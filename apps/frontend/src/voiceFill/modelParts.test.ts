import { Blob as NodeBlob } from 'buffer';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
} from 'stream/web';
import type { CachePartStorage, FetchedPart, ModelPartStore } from './modelParts';
import { createCachePartStore, fetchInParts, hasEveryPart, wholeFile } from './modelParts';

// jsdom has none of the three; a browser has them all. Node's own stand in.
const browser = global as unknown as Record<string, unknown>;
const jsdomBlob = browser.Blob;
beforeAll(() => {
  browser.Blob = NodeBlob;
  browser.TransformStream = NodeTransformStream;
});
afterAll(() => {
  browser.Blob = jsdomBlob;
  delete browser.TransformStream;
});

const URL = 'https://models.example/model.litertlm';
const PART = 4;
/** Ten bytes: two whole parts and a part of two. */
const BYTES = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const FILE = { url: URL, size: BYTES.byteLength };

const streamOf = (chunks: Uint8Array[], then?: Error): ReadableStream<Uint8Array> =>
  new NodeReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      if (then) {
        controller.error(then);
      } else {
        controller.close();
      }
    },
  }) as unknown as ReadableStream<Uint8Array>;

/** The whole of a stream; rejects as the stream does. */
const drained = async (body: ReadableStream<Uint8Array>): Promise<Blob> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return new NodeBlob(chunks) as unknown as Blob;
    }
    chunks.push(value);
  }
};

/** A store that keeps its parts in memory, and only parts that arrived whole. */
const createMemoryStore = () => {
  const kept = new Map<string, Blob>();
  const store: ModelPartStore = {
    has: key => Promise.resolve(kept.has(key)),
    put: async (key, body) => {
      kept.set(key, await drained(body));
    },
    get: key => Promise.resolve(kept.get(key)),
    delete: key => {
      kept.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      kept.clear();
      return Promise.resolve();
    },
  };
  return { store, kept };
};

interface HostScript {
  /** The ranges, in the order asked, that the host breaks off half-way through. */
  breaksOn?: string[];
  /** What it answers instead of the bytes asked for. */
  answers?: (range: string) => FetchedPart | undefined;
}

/** A host of the file that answers a range with those bytes, a byte to a chunk. */
const createHost = ({ breaksOn = [], answers }: HostScript = {}) => {
  const asked: string[] = [];
  const fetchPart = (
    url: string,
    init: { headers: { Range: string }; signal: AbortSignal }
  ): Promise<FetchedPart> => {
    const range = init.headers.Range;
    asked.push(`${url} ${range}`);
    const scripted = answers?.(range);
    if (scripted) {
      return Promise.resolve(scripted);
    }
    const [start, end] = range.replace('bytes=', '').split('-').map(Number);
    const bytes = Array.from(BYTES.slice(start, end + 1), byte => Uint8Array.from([byte]));
    const breaks = breaksOn.includes(range);
    return Promise.resolve({
      status: 206,
      body: streamOf(breaks ? bytes.slice(0, 2) : bytes, breaks ? new Error('reset') : undefined),
    });
  };
  return { fetchPart, asked };
};

const bytesOf = async (blob: Blob | undefined): Promise<number[]> =>
  blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : [];

const downloading = (
  store: ModelPartStore,
  host: ReturnType<typeof createHost>,
  signal: AbortSignal = new AbortController().signal
) => {
  const progress: number[] = [];
  const done = fetchInParts(FILE, {
    store,
    fetchPart: host.fetchPart,
    partBytes: PART,
    progressStepBytes: 1,
    signal,
    onProgress: received => progress.push(received),
  });
  return { done, progress };
};

describe('a model file fetched in parts', () => {
  it('is asked for a range at a time and kept whole, with progress up to its size', async () => {
    const { store } = createMemoryStore();
    const host = createHost();

    const { done, progress } = downloading(store, host);
    await done;

    expect(host.asked).toEqual([`${URL} bytes=0-3`, `${URL} bytes=4-7`, `${URL} bytes=8-9`]);
    expect(progress[0]).toBe(1);
    expect(progress[progress.length - 1]).toBe(FILE.size);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    expect(await bytesOf(await wholeFile(FILE, store, PART))).toEqual(Array.from(BYTES));
  });

  it('is on the phone only once every part is', async () => {
    const { store, kept } = createMemoryStore();
    expect(await hasEveryPart(FILE, store, PART)).toBe(false);
    expect(await wholeFile(FILE, store, PART)).toBeUndefined();

    await downloading(store, createHost()).done;
    expect(await hasEveryPart(FILE, store, PART)).toBe(true);

    // A browser short of storage may evict one part and not the rest.
    kept.delete([...kept.keys()][1]);
    expect(await hasEveryPart(FILE, store, PART)).toBe(false);
    expect(await wholeFile(FILE, store, PART)).toBeUndefined();
  });

  it('keeps the parts that arrived when it breaks, and goes on from the one it broke in', async () => {
    const { store, kept } = createMemoryStore();

    const broken = downloading(store, createHost({ breaksOn: ['bytes=4-7'] }));
    await expect(broken.done).rejects.toThrow('reset');
    expect(kept.size).toBe(1);

    const host = createHost();
    const { done, progress } = downloading(store, host);
    await done;

    expect(host.asked).toEqual([`${URL} bytes=4-7`, `${URL} bytes=8-9`]);
    // What was already on the phone is counted before anything new arrives.
    expect(progress[0]).toBe(4);
    expect(progress[progress.length - 1]).toBe(FILE.size);
    expect(await bytesOf(await wholeFile(FILE, store, PART))).toEqual(Array.from(BYTES));
  });

  it('fetches nothing when it is all on the phone already, and says so', async () => {
    const { store } = createMemoryStore();
    await downloading(store, createHost()).done;

    const host = createHost();
    const { done, progress } = downloading(store, host);
    await done;

    expect(host.asked).toEqual([]);
    expect(progress).toEqual([4, 8, 10]);
  });

  it('asks for nothing more once it is stopped', async () => {
    const { store, kept } = createMemoryStore();
    const stop = new AbortController();
    const host = createHost();
    const fetchPart: typeof host.fetchPart = (url, init) => {
      // Stopped while the first part is on its way.
      stop.abort();
      return host.fetchPart(url, init);
    };

    const { done } = downloading(store, { ...host, fetchPart }, stop.signal);

    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.asked).toEqual([`${URL} bytes=0-3`]);
    expect(kept.size).toBe(1);
  });

  it('fails on a host that answers with anything but the range asked for', async () => {
    const { store, kept } = createMemoryStore();
    const whole = createHost({ answers: () => ({ status: 200, body: streamOf([BYTES]) }) });
    const missing = createHost({ answers: () => ({ status: 404, body: null }) });
    const empty = createHost({ answers: () => ({ status: 206, body: null }) });

    await expect(downloading(store, whole).done).rejects.toThrow('200');
    await expect(downloading(store, missing).done).rejects.toThrow('404');
    await expect(downloading(store, empty).done).rejects.toThrow('206');
    expect(kept.size).toBe(0);
  });

  it('does not keep a part that arrived short', async () => {
    const { store, kept } = createMemoryStore();
    const short = createHost({
      answers: range =>
        range === 'bytes=4-7' ? { status: 206, body: streamOf([BYTES.slice(4, 6)]) } : undefined,
    });

    await expect(downloading(store, short).done).rejects.toThrow(
      'arrived as 2 bytes; 4 were expected'
    );
    expect(kept.size).toBe(1);
  });

  it('tells progress a step at a time, not a packet at a time', async () => {
    const { store } = createMemoryStore();
    const progress: number[] = [];

    await fetchInParts(FILE, {
      store,
      fetchPart: createHost().fetchPart,
      partBytes: PART,
      progressStepBytes: 2,
      signal: new AbortController().signal,
      onProgress: received => progress.push(received),
    });

    expect(progress).toEqual([2, 4, 6, 8, 10]);
  });

  it('keeps parts cut to one size apart from parts cut to another', async () => {
    const { store } = createMemoryStore();
    await downloading(store, createHost()).done;

    expect(await hasEveryPart(FILE, store, PART)).toBe(true);
    expect(await hasEveryPart(FILE, store, 5)).toBe(false);
    expect(await hasEveryPart({ ...FILE, url: `${URL}?download=true` }, store, PART)).toBe(false);
  });
});

describe('a part store kept in the browser’s Cache API', () => {
  /** A Cache API that keeps, per cache, what each response's body gave. */
  const createCaches = () => {
    const opened = new Map<string, Map<string, Blob>>();
    const storage: CachePartStorage = {
      open: name => {
        const kept = opened.get(name) ?? new Map<string, Blob>();
        opened.set(name, kept);
        return Promise.resolve({
          match: url => {
            const part = kept.get(url);
            return Promise.resolve(part && { blob: () => Promise.resolve(part) });
          },
          put: (url, response) => {
            // A browser's cache drops a body that is still arriving once it is
            // some megabytes long; a body that is already whole, it keeps.
            const body = (response as unknown as { body: unknown }).body;
            if (!(body instanceof NodeBlob)) {
              return Promise.reject(new Error('Cache.put() encountered a network error'));
            }
            kept.set(url, body as unknown as Blob);
            return Promise.resolve();
          },
          delete: url => Promise.resolve(kept.delete(url)),
        });
      },
      delete: name => Promise.resolve(opened.delete(name)),
    };
    return { storage, opened };
  };

  // jsdom has no Response; all the store asks of one is that it carries a body.
  beforeAll(() => {
    browser.Response = class {
      constructor(public body: unknown) {}
    };
  });
  afterAll(() => {
    delete browser.Response;
  });

  it('keeps a part under its key in the named cache, and gives it back', async () => {
    const { storage, opened } = createCaches();
    const store = createCachePartStore('voiceFill.test', () => storage);
    expect(await store.has('part-0')).toBe(false);
    expect(await store.get('part-0')).toBeUndefined();

    await store.put('part-0', streamOf([BYTES.slice(0, 4)]));

    expect([...(opened.get('voiceFill.test')?.keys() ?? [])]).toEqual(['part-0']);
    expect(await store.has('part-0')).toBe(true);
    expect(await bytesOf(await store.get('part-0'))).toEqual([0, 1, 2, 3]);
  });

  it('gives the cache a part only once all of it has arrived, as one blob', async () => {
    const { storage, opened } = createCaches();
    const store = createCachePartStore('voiceFill.test', () => storage);

    await store.put('part-0', streamOf([BYTES.slice(0, 2), BYTES.slice(2, 3), BYTES.slice(3, 4)]));

    const kept = opened.get('voiceFill.test')?.get('part-0');
    expect(kept).toBeInstanceOf(NodeBlob);
    expect(kept?.size).toBe(4);
    expect(await bytesOf(kept)).toEqual([0, 1, 2, 3]);
  });

  it('keeps nothing of a part that broke off', async () => {
    const { storage } = createCaches();
    const store = createCachePartStore('voiceFill.test', () => storage);

    await expect(
      store.put('part-0', streamOf([BYTES.slice(0, 2)], new Error('reset')))
    ).rejects.toThrow('reset');

    expect(await store.has('part-0')).toBe(false);
  });

  it('deletes one part, and deletes the whole cache when cleared', async () => {
    const { storage, opened } = createCaches();
    const store = createCachePartStore('voiceFill.test', () => storage);
    await store.put('part-0', streamOf([BYTES.slice(0, 4)]));
    await store.put('part-1', streamOf([BYTES.slice(4, 8)]));

    await store.delete('part-0');
    expect(await store.has('part-0')).toBe(false);
    expect(await store.has('part-1')).toBe(true);

    await store.clear();
    expect(opened.has('voiceFill.test')).toBe(false);
    expect(await store.has('part-1')).toBe(false);
  });

  it('holds nothing and can keep nothing on a page with no Cache API', async () => {
    const store = createCachePartStore('voiceFill.test', () => undefined);

    expect(await store.has('part-0')).toBe(false);
    expect(await store.get('part-0')).toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
    await expect(store.put('part-0', streamOf([BYTES]))).rejects.toThrow('no Cache API');
  });

  it('is the browser’s own cache unless it is given another', async () => {
    const { storage, opened } = createCaches();
    browser.caches = storage;
    try {
      await createCachePartStore('voiceFill.own').put('part-0', streamOf([BYTES]));
      expect(opened.has('voiceFill.own')).toBe(true);
    } finally {
      delete browser.caches;
    }
    // jsdom has none of its own.
    expect(await createCachePartStore('voiceFill.own').has('part-0')).toBe(false);
  });
});
