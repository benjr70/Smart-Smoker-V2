import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibraryOptions } from './modelLibrary';
import { MODEL_LIBRARY_STORAGE_KEY, createModelLibrary, pairReadiness } from './modelLibrary';
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

  test('a download that breaks while offline waits; one that breaks online is given up', async () => {
    const phone = createPhone();
    let online = true;
    const library = await phone.openApp({
      connection: { isOnline: () => online, subscribe: () => () => undefined },
      downloader: {
        ...phone.downloader,
        download: model =>
          model.role === 'speech'
            ? Promise.reject(new Error('network'))
            : new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                  online = false;
                  reject(new Error('network'));
                }, 100);
              }),
      },
    });

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });

    await pass(100);

    expect(library.getState().statuses['extractor-a']).toEqual({
      state: 'paused',
      receivedBytes: 0,
    });
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

  test('a download given up on leaves nothing of the model on the phone', async () => {
    const phone = createPhone();
    const remove = jest.fn(phone.downloader.remove);
    const breaksOnce = { broken: false };
    const library = await phone.openApp({
      downloader: {
        ...phone.downloader,
        remove,
        // The speech model's first download brings 30 MB and then breaks, with
        // the phone still online.
        download: (model, options) => {
          if (model.role !== 'speech' || breaksOnce.broken) {
            return phone.downloader.download(model, options);
          }
          breaksOnce.broken = true;
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
        },
      },
    });

    await pass(400);

    expect(library.getState().statuses['speech-a']).toEqual({ state: 'notDownloaded' });
    expect(remove).toHaveBeenCalledWith(registry.find('speech-a'));

    // Not downloaded is the truth: the next download starts from nothing.
    library.download('speech-a');
    await pass(100);
    expect(library.getState().statuses['speech-a']).toEqual({
      state: 'downloading',
      receivedBytes: 10 * MB,
    });
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
