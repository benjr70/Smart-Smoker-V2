import { createFakeDownloader } from './fakeDownloader';
import type { VoiceFillModel } from './modelRegistry';
import { formatBytes } from './modelRegistry';

const model: VoiceFillModel = { id: 'speech', role: 'speech', name: 'Speech', sizeBytes: 1000 };

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
};

describe('the fake downloader', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('brings a model in a chunk at a time, and then has all of it', async () => {
    const downloader = createFakeDownloader({ chunkMs: 100, chunks: 4 });
    const progress: number[] = [];
    const done = jest.fn();

    downloader
      .download(model, {
        onProgress: bytes => progress.push(bytes),
        signal: new AbortController().signal,
      })
      .then(done);

    jest.advanceTimersByTime(250);
    await settle();
    expect(progress).toEqual([250, 500]);
    expect(done).not.toHaveBeenCalled();
    await expect(downloader.has(model)).resolves.toBe(false);

    jest.advanceTimersByTime(200);
    await settle();
    expect(progress).toEqual([250, 500, 750, 1000]);
    expect(done).toHaveBeenCalled();
    await expect(downloader.has(model)).resolves.toBe(true);
  });

  test('a stopped download rejects, and the next picks up from what had arrived', async () => {
    const downloader = createFakeDownloader({ chunkMs: 100, chunks: 4 });
    const stopper = new AbortController();
    const stopped = jest.fn();
    downloader
      .download(model, { onProgress: () => undefined, signal: stopper.signal })
      .catch(stopped);
    jest.advanceTimersByTime(200);

    stopper.abort();
    await settle();
    expect(stopped).toHaveBeenCalled();

    const progress: number[] = [];
    downloader.download(model, {
      onProgress: bytes => progress.push(bytes),
      signal: new AbortController().signal,
    });
    jest.advanceTimersByTime(100);

    expect(progress).toEqual([750]);
  });

  test('keeps what has arrived in the storage it is given, across a reload', async () => {
    const kept = new Map<string, string>();
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => {
        kept.set(key, value);
      },
    };
    createFakeDownloader({ storage, chunkMs: 100, chunks: 2 }).download(model, {
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    jest.advanceTimersByTime(200);

    const reloaded = createFakeDownloader({ storage });

    await expect(reloaded.has(model)).resolves.toBe(true);
    // Nothing is left to fetch.
    await expect(
      reloaded.download(model, {
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })
    ).resolves.toBeUndefined();
  });

  test('removing a model leaves none of it, and storage it cannot read holds nothing', async () => {
    const downloader = createFakeDownloader({ chunkMs: 100, chunks: 1 });
    downloader.download(model, {
      onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    jest.advanceTimersByTime(100);

    await downloader.remove(model);

    await expect(downloader.has(model)).resolves.toBe(false);
    await expect(
      createFakeDownloader({
        storage: { getItem: () => '{not json', setItem: () => undefined },
      }).has(model)
    ).resolves.toBe(false);
  });

  test('test-loads every model but the ones scripted to fail', async () => {
    const downloader = createFakeDownloader({ failingTestLoad: ['other'] });

    await expect(downloader.testLoad(model)).resolves.toBe(true);
    await expect(downloader.testLoad({ ...model, id: 'other' })).resolves.toBe(false);
  });
});

describe('a model’s size', () => {
  test('reads in megabytes, and in gigabytes from a thousand of them', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(158_000_000)).toBe('158 MB');
    expect(formatBytes(999_400_000)).toBe('999 MB');
    expect(formatBytes(1_900_000_000)).toBe('1.9 GB');
  });
});
