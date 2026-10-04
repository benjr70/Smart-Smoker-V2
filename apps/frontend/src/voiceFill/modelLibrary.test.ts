import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibraryOptions } from './modelLibrary';
import {
  MAX_RETRY_DELAY_MS,
  MODEL_LIBRARY_STORAGE_KEY,
  createModelLibrary,
  isDownloaded,
  pairReadiness,
  percentOf,
  pickedModel,
  statusOf,
} from './modelLibrary';
import { createModelRegistry } from './modelRegistry';

const MB = 1_000_000;

/** Two models a role: the first of each is the pair a fresh phone gets. */
const registry = createModelRegistry([
  { id: 'speech-a', role: 'speech', name: 'Speech A', sizeBytes: 100 * MB },
  { id: 'speech-b', role: 'speech', name: 'Speech B', sizeBytes: 200 * MB },
  { id: 'extractor-a', role: 'extractor', name: 'Extractor A', sizeBytes: 1000 * MB },
  { id: 'extractor-b', role: 'extractor', name: 'Extractor B', sizeBytes: 500 * MB },
]);

/** What a phone keeps between two openings of the app. */
const createPhoneStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const kept = new Map<string, string>();
  return {
    getItem: key => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
};

/** A connection the test switches off and on. */
const createConnection = () => {
  let online = true;
  const listeners = new Set<() => void>();
  return {
    isOnline: () => online,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next: boolean) => {
      online = next;
      listeners.forEach(listener => listener());
    },
  };
};

/** Lets everything already due — a resolved download, a test-load — land. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
};

/** Lets `ms` of downloading go by. */
const pass = async (ms: number): Promise<void> => {
  await settle();
  jest.advanceTimersByTime(ms);
  await settle();
};

/** A phone: what is on it survives the app being closed and opened again. */
const createPhone = (failingTestLoad: readonly string[] = []) => {
  const storage = createPhoneStorage();
  const downloader = createFakeDownloader({
    storage,
    chunkMs: 100,
    chunks: 10,
    failingTestLoad,
  });
  const connection = createConnection();
  const openApp = async (overrides: Partial<ModelLibraryOptions> = {}) => {
    const library = createModelLibrary({
      registry,
      downloader,
      storage,
      connection,
      capabilities: () => Promise.resolve(true),
      ...overrides,
    });
    library.open();
    await settle();
    return library;
  };
  return { storage, downloader, connection, openApp };
};

describe('the Model library', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('the first time the app is opened, the default pair starts downloading', async () => {
    const phone = createPhone();

    const library = await phone.openApp();

    expect(library.getState().picked).toEqual({ speech: 'speech-a', extractor: 'extractor-a' });
    expect(library.getState().statuses).toEqual({
      'speech-a': { state: 'downloading', receivedBytes: 0 },
      'speech-b': { state: 'notDownloaded' },
      'extractor-a': { state: 'downloading', receivedBytes: 0 },
      'extractor-b': { state: 'notDownloaded' },
    });

    await pass(300);

    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 30 * MB,
    });
  });
  test('picking a model starts its download, which runs through to ready', async () => {
    const phone = createPhone();
    const library = await phone.openApp();

    library.pick('speech', 'speech-b');

    expect(library.getState().picked.speech).toBe('speech-b');
    expect(library.getState().statuses['speech-b']).toEqual({
      state: 'downloading',
      receivedBytes: 0,
    });

    await pass(500);
    expect(library.getState().statuses['speech-b']).toEqual({
      state: 'downloading',
      receivedBytes: 100 * MB,
    });

    await pass(500);
    expect(library.getState().statuses['speech-b']).toEqual({ state: 'ready' });
    // The model picked before it is still being fetched: a download is kept.
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
  });

  test('a model is ready only once it has been loaded on this phone', async () => {
    const phone = createPhone();
    let proven: (runsHere: boolean) => void = () => undefined;
    const testLoad = jest.fn(
      () =>
        new Promise<boolean>(resolve => {
          proven = resolve;
        })
    );
    const library = await phone.openApp({ downloader: { ...phone.downloader, testLoad } });
    library.cancel('extractor-a');

    await pass(1000);

    // All of it has arrived, and it is still not offered.
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 100 * MB,
    });

    proven(true);
    await settle();

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
    expect(testLoad).toHaveBeenCalledTimes(1);
  });

  test('a model that cannot be loaded on this phone is failed, not ready', async () => {
    const phone = createPhone(['speech-a']);
    const library = await phone.openApp();

    await pass(1000);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'failed' });
    expect(library.getState().statuses['extractor-a']).toEqual({ state: 'ready' });

    // It is not fetched again by asking: it has to be removed first.
    library.download('speech-a');
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'failed' });
  });

  test('a test-load that throws counts as a model that does not run here', async () => {
    const phone = createPhone();
    const library = await phone.openApp({
      downloader: {
        ...phone.downloader,
        testLoad: () => Promise.reject(new Error('out of memory')),
      },
    });

    await pass(1000);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'failed' });
  });

  test('a download cut short by closing the app is picked up when it is reopened', async () => {
    const phone = createPhone();
    const first = await phone.openApp();
    await pass(300);
    first.close();
    await pass(5000);

    const reopened = createModelLibrary({
      registry,
      downloader: phone.downloader,
      storage: phone.storage,
      connection: phone.connection,
      capabilities: () => Promise.resolve(true),
    });

    // The record survived: what was picked, and how far each model had got.
    expect(reopened.getState().picked).toEqual({ speech: 'speech-a', extractor: 'extractor-a' });
    expect(reopened.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 30 * MB,
    });

    reopened.open();
    await pass(200);

    expect(reopened.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 50 * MB,
    });

    await pass(500);
    expect(reopened.getState().statuses['speech-a']).toEqual({ state: 'ready' });
    expect(reopened.getState().statuses['extractor-a']).toEqual({ state: 'ready' });
  });

  test('a ready model stays ready across a reopening, and is not loaded again', async () => {
    const phone = createPhone();
    const testLoad = jest.fn(phone.downloader.testLoad);
    const downloader = { ...phone.downloader, testLoad };
    const first = await phone.openApp({ downloader });
    await pass(1000);
    first.close();

    const reopened = await phone.openApp({ downloader });

    expect(reopened.getState().statuses['speech-a']).toEqual({ state: 'ready' });
    expect(reopened.getState().statuses['extractor-a']).toEqual({ state: 'ready' });
    expect(testLoad).toHaveBeenCalledTimes(2);
  });

  test('only the first opening downloads by itself', async () => {
    const phone = createPhone();
    const first = await phone.openApp();
    first.cancel('speech-a');
    first.cancel('extractor-a');
    first.close();

    const reopened = await phone.openApp();
    await pass(1000);

    expect(reopened.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(reopened.getState().statuses['extractor-a']).toEqual({ state: 'notDownloaded' });
  });

  test('cancelling a download discards what had arrived', async () => {
    const phone = createPhone();
    const library = await phone.openApp();
    await pass(300);

    library.cancel('speech-a');
    await pass(1000);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });

    library.download('speech-a');
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 0,
    });
    await pass(100);
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 10 * MB,
    });
  });

  test('cancel leaves a model that is not downloading alone', async () => {
    const phone = createPhone();
    const library = await phone.openApp();
    await pass(1000);

    library.cancel('speech-a');

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
  });

  test('removing a model returns it to not downloaded, and it stays picked', async () => {
    const phone = createPhone(['extractor-a']);
    const library = await phone.openApp();
    await pass(1000);

    library.remove('speech-a');
    library.remove('extractor-a');
    await settle();

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(library.getState().statuses['extractor-a']).toEqual({ state: 'notDownloaded' });
    expect(library.getState().picked.speech).toBe('speech-a');
    await expect(phone.downloader.has(registry.find('speech-a')!)).resolves.toBe(false);
  });

  test('a download pauses while the phone is offline and goes on when it is back', async () => {
    const phone = createPhone();
    const library = await phone.openApp();
    await pass(300);

    phone.connection.set(false);
    await pass(1000);

    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'paused',
      receivedBytes: 30 * MB,
    });

    phone.connection.set(true);
    await pass(100);

    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 40 * MB,
    });
  });

  test('a model picked while offline waits, paused, for the connection', async () => {
    const phone = createPhone();
    phone.connection.set(false);
    const library = await phone.openApp();

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'paused', receivedBytes: 0 });

    phone.connection.set(true);
    await pass(1000);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
  });

  test('a download that breaks while offline waits for the connection, with nothing retried', async () => {
    const phone = createPhone();
    const download = jest.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            phone.connection.set(false);
            reject(new Error('network'));
          }, 100);
        })
    );
    const library = await phone.openApp({
      downloader: { ...phone.downloader, download },
      retryDelayMs: 1000,
    });
    library.cancel('extractor-a');

    await pass(100);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'paused', receivedBytes: 0 });

    // Offline, it is the connection that is waited for: no try is made.
    await pass(60_000);
    expect(download).toHaveBeenCalledTimes(2);
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'paused', receivedBytes: 0 });
  });

  /**
   * A downloader whose speech download brings 30 MB and then breaks, `times`
   * times over, with the phone still online: a server error, or a connection
   * gone before the browser has noticed.
   */
  const breakingOnline = (phone: ReturnType<typeof createPhone>, times = 1) => {
    let broken = 0;
    const remove = jest.fn(phone.downloader.remove);
    const download = jest.fn<
      Promise<void>,
      Parameters<ModelLibraryOptions['downloader']['download']>
    >((model, options) => {
      if (model.role !== 'speech' || broken >= times) {
        return phone.downloader.download(model, options);
      }
      broken += 1;
      const inner = new AbortController();
      phone.downloader.download(model, { ...options, signal: inner.signal }).catch(() => {
        // Stopped below.
      });
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          inner.abort();
          reject(new Error('server error'));
        }, 350);
      });
    });
    const speechDownloads = () => download.mock.calls.filter(([model]) => model.id === 'speech-a');
    return { downloader: { ...phone.downloader, remove, download }, remove, speechDownloads };
  };

  test('a download that breaks while online keeps what had arrived and goes on by itself', async () => {
    const phone = createPhone();
    const { downloader, remove, speechDownloads } = breakingOnline(phone);
    const library = await phone.openApp({ downloader, retryDelayMs: 1000 });

    await pass(400);

    // Paused, not given up: the 30 MB are still on the phone and in the record.
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'paused',
      receivedBytes: 30 * MB,
    });
    expect(remove).not.toHaveBeenCalled();
    expect(pairReadiness(registry, library.getState()).state).toBe('downloading');

    // Nobody asks: it is tried again after the wait, from where it stopped.
    await pass(1000);
    expect(speechDownloads()).toHaveLength(2);
    await pass(100);
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 40 * MB,
    });

    await pass(600);
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
  });

  test('a download that keeps breaking with nothing arriving waits longer each time', async () => {
    const phone = createPhone();
    const download = jest.fn(() => Promise.reject(new Error('server error')));
    const library = await phone.openApp({
      downloader: { ...phone.downloader, download },
      retryDelayMs: 1000,
    });
    library.cancel('extractor-a');
    const tries = () => download.mock.calls.length - 1;

    expect(tries()).toBe(1);
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'paused', receivedBytes: 0 });

    await pass(1000);
    expect(tries()).toBe(2);
    await pass(1000);
    expect(tries()).toBe(2);
    await pass(1000);
    expect(tries()).toBe(3);

    // And never longer than the longest wait.
    await pass(10 * MAX_RETRY_DELAY_MS);
    const soFar = tries();
    await pass(MAX_RETRY_DELAY_MS);
    expect(tries()).toBe(soFar + 1);
  });

  test('a broken download waiting for its next try can be cancelled, and is then not tried', async () => {
    const phone = createPhone();
    const { downloader, remove, speechDownloads } = breakingOnline(phone);
    const library = await phone.openApp({ downloader, retryDelayMs: 1000 });
    await pass(400);

    library.cancel('speech-a');
    await pass(5000);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(remove).toHaveBeenCalledWith(registry.find('speech-a'));
    expect(speechDownloads()).toHaveLength(1);
  });

  test('a broken download is picked up when the app is reopened, without waiting to be asked', async () => {
    const phone = createPhone();
    const { downloader, speechDownloads } = breakingOnline(phone);
    const first = await phone.openApp({ downloader, retryDelayMs: 1000 });
    await pass(400);

    // Closed while it waits: the try that was due is not made behind its back.
    first.close();
    await pass(5000);
    expect(speechDownloads()).toHaveLength(1);

    // Not the first opening any more, and still nothing is ready: the download
    // the last one left broken goes on from the 30 MB it had.
    const reopened = await phone.openApp({ downloader, retryDelayMs: 1000 });
    expect(reopened.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 30 * MB,
    });

    await pass(700);
    expect(reopened.getState().statuses['speech-a']).toEqual({ state: 'ready' });
  });

  test('a broken download goes on at once when the phone comes back online', async () => {
    const phone = createPhone();
    const { downloader, speechDownloads } = breakingOnline(phone);
    const library = await phone.openApp({ downloader, retryDelayMs: 60_000 });
    await pass(400);

    phone.connection.set(false);
    phone.connection.set(true);
    await pass(100);

    expect(speechDownloads()).toHaveLength(2);
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 40 * MB,
    });

    // The try that had been waiting is not made on top of this one.
    await pass(60_000);
    expect(speechDownloads()).toHaveLength(2);
  });

  test('a connection lost and found during the test-load neither pauses the model nor loads it twice', async () => {
    const phone = createPhone();
    let proven: (runsHere: boolean) => void = () => undefined;
    const testLoad = jest.fn(
      () =>
        new Promise<boolean>(resolve => {
          proven = resolve;
        })
    );
    const library = await phone.openApp({ downloader: { ...phone.downloader, testLoad } });
    library.cancel('extractor-a');
    await pass(1000);
    expect(testLoad).toHaveBeenCalledTimes(1);

    // All of it is on the phone: there is nothing left for a connection to do.
    phone.connection.set(false);
    await settle();
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 100 * MB,
    });

    phone.connection.set(true);
    await pass(1000);
    expect(testLoad).toHaveBeenCalledTimes(1);

    proven(true);
    await settle();

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
    expect(testLoad).toHaveBeenCalledTimes(1);
  });

  test('a download asked for while the model is still being deleted waits for the delete', async () => {
    const phone = createPhone();
    const download = jest.fn(phone.downloader.download);
    const library = await phone.openApp({
      downloader: {
        ...phone.downloader,
        download,
        // A delete that takes a while, as a real cache's does.
        remove: model =>
          new Promise<void>(resolve => {
            setTimeout(() => {
              phone.downloader.remove(model).then(resolve);
            }, 50);
          }),
      },
    });
    await pass(1000);
    const downloadsOfSpeech = () =>
      download.mock.calls.filter(([model]) => model.id === 'speech-a').length;
    expect(downloadsOfSpeech()).toBe(1);

    library.remove('speech-a');
    library.download('speech-a');
    await settle();

    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 0,
    });
    expect(downloadsOfSpeech()).toBe(1);

    await pass(50);
    expect(downloadsOfSpeech()).toBe(2);

    await pass(1000);
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'ready' });
    await expect(phone.downloader.has(registry.find('speech-a')!)).resolves.toBe(true);
  });

  test('keeps its record under the storage key it is given', async () => {
    const phone = createPhone();

    await phone.openApp({ storageKey: 'voiceFill.elsewhere' });

    expect(phone.storage.getItem('voiceFill.elsewhere')).toContain('speech-a');
    expect(phone.storage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  test('a model the browser evicted reads not downloaded again', async () => {
    const phone = createPhone();
    const first = await phone.openApp();
    await pass(1000);
    first.close();
    await phone.downloader.remove(registry.find('speech-a')!);

    const reopened = await phone.openApp();

    expect(reopened.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(reopened.getState().statuses['extractor-a']).toEqual({ state: 'ready' });
  });

  test.each([
    ['says it cannot', () => Promise.resolve(false)],
    ['cannot be checked', () => Promise.reject(new Error('no adapter'))],
  ])('a phone that %s run Voice Fill downloads and records nothing', async (_, capabilities) => {
    const phone = createPhone();

    const library = await phone.openApp({ capabilities });
    await pass(1000);

    expect(library.getState().supported).toBe(false);
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(phone.storage.getItem(MODEL_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  test('is not known to be supported until the phone has been checked', async () => {
    const phone = createPhone();
    const library = createModelLibrary({
      registry,
      downloader: phone.downloader,
      storage: phone.storage,
      capabilities: () => Promise.resolve(true),
    });

    expect(library.getState().supported).toBeNull();

    library.open();
    await settle();

    expect(library.getState().supported).toBe(true);
  });

  test('tells its subscribers of every change, until they unsubscribe', async () => {
    const phone = createPhone();
    const library = await phone.openApp();
    const heard = jest.fn();
    const unsubscribe = library.subscribe(heard);

    await pass(100);
    expect(heard).toHaveBeenCalled();

    unsubscribe();
    heard.mockClear();
    await pass(100);
    expect(heard).not.toHaveBeenCalled();
  });

  test('ignores a pick of a model that is not registered for that role', async () => {
    const phone = createPhone();
    const library = await phone.openApp();

    library.pick('speech', 'extractor-b');
    library.pick('speech', 'nothing');

    expect(library.getState().picked.speech).toBe('speech-a');
  });

  test('a record that cannot be read, or names a model no longer registered, falls back', async () => {
    const phone = createPhone();
    phone.storage.setItem(MODEL_LIBRARY_STORAGE_KEY, '{not json');
    expect((await phone.openApp()).getState().picked.speech).toBe('speech-a');

    phone.storage.setItem(
      MODEL_LIBRARY_STORAGE_KEY,
      JSON.stringify({
        picked: { speech: 'retired', extractor: 'extractor-b' },
        statuses: { 'speech-b': { state: 'downloading', receivedBytes: 'lots' }, retired: 3 },
      })
    );
    const library = await phone.openApp();

    expect(library.getState().picked).toEqual({ speech: 'speech-a', extractor: 'extractor-b' });
    expect(library.getState().statuses['speech-b']).toEqual({
      state: 'downloading',
      receivedBytes: 0,
    });
    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
  });

  describe('what a screen reads of it', () => {
    test('the picked model of a role, and where any model stands', async () => {
      const phone = createPhone(['speech-a']);
      const library = await phone.openApp();
      library.pick('extractor', 'extractor-b');
      await pass(1000);
      const state = library.getState();

      expect(pickedModel(registry, state, 'speech')?.name).toBe('Speech A');
      expect(pickedModel(registry, state, 'extractor')?.name).toBe('Extractor B');
      expect(statusOf(state, registry.find('extractor-b'))).toEqual({ state: 'ready' });
      expect(statusOf(state, registry.find('speech-b'))).toEqual({ state: 'notDownloaded' });
      expect(statusOf(state, undefined)).toEqual({ state: 'notDownloaded' });
    });

    test('a role with no model registered has no picked model', () => {
      const empty = createModelRegistry([]);

      expect(pickedModel(empty, { picked: empty.defaultPair }, 'speech')).toBeUndefined();
    });

    test('a model is downloaded once all of it is on the phone, whether or not it runs', () => {
      expect(isDownloaded({ state: 'ready' })).toBe(true);
      expect(isDownloaded({ state: 'failed' })).toBe(true);
      expect(isDownloaded({ state: 'downloading', receivedBytes: 100 * MB })).toBe(false);
      expect(isDownloaded({ state: 'paused', receivedBytes: 1 })).toBe(false);
      expect(isDownloaded({ state: 'notDownloaded' })).toBe(false);
    });

    test('percent is the whole percent that has arrived', () => {
      expect(percentOf(0, 300 * MB)).toBe(0);
      expect(percentOf(299 * MB, 300 * MB)).toBe(99);
      expect(percentOf(300 * MB, 300 * MB)).toBe(100);
    });
  });

  describe('the picked pair', () => {
    test('is ready only when both of its models are', async () => {
      const phone = createPhone();
      const library = await phone.openApp();

      expect(pairReadiness(registry, library.getState())).toEqual({
        state: 'downloading',
        percent: 0,
      });

      await pass(500);
      // 50 of 100 MB and 500 of 1000 MB.
      expect(pairReadiness(registry, library.getState())).toEqual({
        state: 'downloading',
        percent: 50,
      });

      await pass(500);
      expect(pairReadiness(registry, library.getState())).toEqual({ state: 'ready' });
    });

    test('counts a ready model as all there while the other arrives', async () => {
      const phone = createPhone();
      const library = await phone.openApp();
      await pass(1000);

      library.pick('extractor', 'extractor-b');
      await pass(500);

      // 100 of 100 MB and 250 of 500 MB.
      expect(pairReadiness(registry, library.getState())).toEqual({
        state: 'downloading',
        percent: 58,
      });
    });

    test('is not downloaded when nothing of it is arriving', async () => {
      const phone = createPhone(['speech-a']);
      const library = await phone.openApp();
      await pass(1000);

      // One model works and the other did not: nothing more is coming.
      expect(pairReadiness(registry, library.getState())).toEqual({ state: 'notDownloaded' });
    });

    test('is not downloaded where no model is registered', () => {
      const empty = createModelRegistry([]);

      expect(empty.defaultPair).toEqual({ speech: null, extractor: null });
      expect(pairReadiness(empty, { picked: empty.defaultPair, statuses: {} })).toEqual({
        state: 'notDownloaded',
      });
    });
  });
});
