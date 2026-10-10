import type { FetchedFile, ModelFile, ModelFileStore } from './modelFiles';
import { createCacheFileStore, fetchModelFiles } from './modelFiles';

const bytesOf = (length: number, fill = 7): Uint8Array => new Uint8Array(length).fill(fill);

const FILES: ModelFile[] = [
  { name: 'encoder.ort', url: 'https://models.test/encoder.ort', size: 6 },
  { name: 'decoder.ort', url: 'https://models.test/decoder.ort', size: 4 },
];

const memoryStore = (kept: Record<string, Uint8Array> = {}) => {
  const files = new Map(Object.entries(kept));
  const store: ModelFileStore = {
    has: url => Promise.resolve(files.has(url)),
    get: url => Promise.resolve(files.get(url)),
    put: (url, bytes) => {
      files.set(url, bytes);
      return Promise.resolve();
    },
    clear: () => {
      files.clear();
      return Promise.resolve();
    },
  };
  return { store, files };
};

/** A fetched file that arrives in `parts`, as a browser streams one. */
const streamed = (...parts: Uint8Array[]): FetchedFile => {
  const left = [...parts];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          Promise.resolve(left.length > 0 ? { done: false, value: left.shift() } : { done: true }),
      }),
    },
    arrayBuffer: () => Promise.reject(new Error('read as a stream')),
  };
};

describe('fetching a model’s files', () => {
  test('every file is fetched and kept, with progress across the whole model', async () => {
    const { store, files } = memoryStore();
    const progress: number[] = [];
    const fetchFile = jest
      .fn()
      .mockResolvedValueOnce(streamed(bytesOf(2), bytesOf(4)))
      .mockResolvedValueOnce(streamed(bytesOf(4)));

    await fetchModelFiles(FILES, {
      store,
      fetchFile,
      onProgress: received => progress.push(received),
      signal: new AbortController().signal,
    });

    expect(fetchFile.mock.calls.map(call => call[0])).toEqual(FILES.map(file => file.url));
    expect(files.get(FILES[0].url)).toEqual(bytesOf(6));
    expect(files.get(FILES[1].url)).toEqual(bytesOf(4));
    expect(progress).toEqual([2, 6, 6, 10, 10]);
  });

  test('a file already on the phone is not fetched again, and counts as arrived', async () => {
    const { store } = memoryStore({ [FILES[0].url]: bytesOf(6) });
    const progress: number[] = [];
    const fetchFile = jest.fn().mockResolvedValue(streamed(bytesOf(4)));

    await fetchModelFiles(FILES, {
      store,
      fetchFile,
      onProgress: received => progress.push(received),
      signal: new AbortController().signal,
    });

    expect(fetchFile).toHaveBeenCalledTimes(1);
    expect(fetchFile.mock.calls[0][0]).toBe(FILES[1].url);
    expect(progress).toEqual([6, 10, 10]);
  });

  test('a download that breaks keeps the files that had completed', async () => {
    const { store, files } = memoryStore();
    const fetchFile = jest
      .fn()
      .mockResolvedValueOnce(streamed(bytesOf(6)))
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      fetchModelFiles(FILES, {
        store,
        fetchFile,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('connection lost');

    expect(Array.from(files.keys())).toEqual([FILES[0].url]);
  });

  test('a server that refuses a file breaks the download', async () => {
    const { store, files } = memoryStore();
    const fetchFile = jest.fn().mockResolvedValue({ ...streamed(), ok: false, status: 503 });

    await expect(
      fetchModelFiles(FILES, {
        store,
        fetchFile,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('503');
    expect(files.size).toBe(0);
  });

  test('a file that arrives the wrong size is not kept', async () => {
    const { store, files } = memoryStore();
    const fetchFile = jest.fn().mockResolvedValue(streamed(bytesOf(5)));

    await expect(
      fetchModelFiles(FILES, {
        store,
        fetchFile,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('encoder.ort');
    expect(files.size).toBe(0);
  });

  test('stopping it part-way through a file rejects, and that file is not kept', async () => {
    const { store, files } = memoryStore();
    const controller = new AbortController();
    const fetchFile = jest.fn().mockResolvedValue(streamed(bytesOf(2), bytesOf(4)));

    const downloading = fetchModelFiles(FILES, {
      store,
      fetchFile,
      onProgress: () => controller.abort(),
      signal: controller.signal,
    });

    await expect(downloading).rejects.toMatchObject({ name: 'AbortError' });
    expect(files.size).toBe(0);
  });

  test('one that was stopped before it began fetches nothing', async () => {
    const { store } = memoryStore();
    const controller = new AbortController();
    controller.abort();
    const fetchFile = jest.fn();

    await expect(
      fetchModelFiles(FILES, {
        store,
        fetchFile,
        onProgress: () => undefined,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchFile).not.toHaveBeenCalled();
  });

  test('a file that cannot be streamed is read whole', async () => {
    const { store, files } = memoryStore();
    const whole: FetchedFile = {
      ok: true,
      status: 200,
      body: null,
      arrayBuffer: () => Promise.resolve(bytesOf(6).buffer),
    };
    const progress: number[] = [];

    await fetchModelFiles([FILES[0]], {
      store,
      fetchFile: () => Promise.resolve(whole),
      onProgress: received => progress.push(received),
      signal: new AbortController().signal,
    });

    expect(files.get(FILES[0].url)).toEqual(bytesOf(6));
    expect(progress).toEqual([6, 6]);
  });
});

describe('a file store on a page with no Cache API', () => {
  const store = createCacheFileStore('voiceFill.test', () => undefined);

  test('holds nothing', async () => {
    expect(await store.has(FILES[0].url)).toBe(false);
    expect(await store.get(FILES[0].url)).toBeUndefined();
  });

  test('cannot keep a file', async () => {
    await expect(store.put(FILES[0].url, bytesOf(6))).rejects.toThrow('Cache API');
  });

  test('has nothing to clear', async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });
});
