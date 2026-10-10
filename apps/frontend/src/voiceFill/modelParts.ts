/**
 * Getting a model that is one very large file onto the phone: it is asked of
 * its host a range at a time, and each range is kept as a part of its own, in
 * a store on the phone.
 *
 * A file of two gigabytes cannot be held in memory to be kept, so it is kept a
 * part at a time: one part is all of it that is ever in memory, and only until
 * the store has it. And it cannot be started again from nothing each time a
 * download breaks, so the parts that had arrived stay: the next download goes
 * on from the part it broke in. A load reads the parts back as one file, with
 * no network.
 *
 * Nothing here knows which model the file is of, or what runs it.
 */

/** A model's one file, as its publisher hosts it. */
export interface PartedFile {
  /** Where it is fetched from. The host has to answer range requests. */
  url: string;
  /** How many bytes it is. */
  size: number;
}

/**
 * How many bytes a part is: all but the last, which is what is left. It is
 * also how much of the file is in memory at once while it downloads.
 */
export const PART_BYTES = 32 * 1024 * 1024;

/** How many more bytes have to arrive before progress is told again. */
export const PROGRESS_STEP_BYTES = 1024 * 1024;

/** Where a model's parts are kept on the phone. */
export interface ModelPartStore {
  has(key: string): Promise<boolean>;
  /**
   * Keeps everything `body` gives under `key`, reading it as it arrives.
   * Resolves once it is all kept; rejects, keeping nothing under `key`, if
   * `body` breaks off.
   */
  put(key: string, body: ReadableStream<Uint8Array>): Promise<void>;
  /** The part kept under `key`; nothing where none is. */
  get(key: string): Promise<Blob | undefined>;
  delete(key: string): Promise<void>;
  /** Deletes everything the store holds. */
  clear(): Promise<void>;
}

/** The parts of a `fetch` answer a download reads. */
export interface FetchedPart {
  status: number;
  body: ReadableStream<Uint8Array> | null;
}

export interface FetchInPartsOptions {
  store: ModelPartStore;
  /** Told how many bytes of the file are on the phone, as they arrive. */
  onProgress: (receivedBytes: number) => void;
  /** Stops the download where it is. */
  signal: AbortSignal;
  fetchPart?: (
    url: string,
    init: { headers: { Range: string }; signal: AbortSignal }
  ) => Promise<FetchedPart>;
  partBytes?: number;
  progressStepBytes?: number;
}

interface Part {
  /** What the part is kept under. */
  key: string;
  /** The first and the last byte of the file it holds. */
  start: number;
  end: number;
}

/**
 * The parts `file` is fetched and kept in. A part is kept under the file's
 * address, which part it is and how large the parts are, so parts cut to
 * another size are never read as these.
 */
const partsOf = ({ url, size }: PartedFile, partBytes: number): Part[] =>
  Array.from({ length: Math.ceil(size / partBytes) }, (_, index) => ({
    key: `${url}${url.includes('?') ? '&' : '?'}part=${index}&partBytes=${partBytes}`,
    start: index * partBytes,
    end: Math.min(size, (index + 1) * partBytes) - 1,
  }));

const stopped = (): Error =>
  Object.assign(new Error('The download was stopped.'), { name: 'AbortError' });

/**
 * Fetches every part of `file` the store does not hold yet, in order, and
 * keeps each as it arrives. Resolves once they are all held.
 *
 * Rejects if a part cannot be fetched, arrives a different size than asked
 * for, or `signal` stops it. The parts that had completed stay in the store,
 * for the next call to go on from: a download picks up at the part it broke
 * in, not at the byte.
 */
export const fetchInParts = async (
  file: PartedFile,
  {
    store,
    onProgress,
    signal,
    fetchPart = (url, init) => fetch(url, init),
    partBytes = PART_BYTES,
    progressStepBytes = PROGRESS_STEP_BYTES,
  }: FetchInPartsOptions
): Promise<void> => {
  let held = 0;
  for (const part of partsOf(file, partBytes)) {
    if (signal.aborted) {
      throw stopped();
    }
    const size = part.end - part.start + 1;
    if (!(await store.has(part.key))) {
      const fetched = await fetchPart(file.url, {
        headers: { Range: `bytes=${part.start}-${part.end}` },
        signal,
      });
      // Anything but the range asked for — the whole file, an error page — is
      // not a part of the file.
      if (fetched.status !== 206 || !fetched.body) {
        throw new Error(`Could not download the model: ${fetched.status}`);
      }
      const heldBefore = held;
      let received = 0;
      let told = 0;
      const counted = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          received += chunk.byteLength;
          // Told a step at a time: a byte count for every packet of two
          // gigabytes is more than anything showing it can use.
          if (received - told >= progressStepBytes && received < size) {
            told = received;
            onProgress(heldBefore + received);
          }
          controller.enqueue(chunk);
        },
      });
      await store.put(part.key, fetched.body.pipeThrough(counted));
      if (received !== size) {
        await store.delete(part.key);
        throw new Error(`A part of the model arrived as ${received} bytes; ${size} were expected`);
      }
    }
    held += size;
    onProgress(held);
  }
};

/** Whether every part of `file` is in the store. */
export const hasEveryPart = async (
  file: PartedFile,
  store: ModelPartStore,
  partBytes: number = PART_BYTES
): Promise<boolean> => {
  for (const part of partsOf(file, partBytes)) {
    if (!(await store.has(part.key))) {
      return false;
    }
  }
  return true;
};

/**
 * `file` as one file, read from its parts in the store; nothing where a part
 * is missing. The parts stay where the store keeps them: the file is their
 * order, not a copy of them in memory.
 */
export const wholeFile = async (
  file: PartedFile,
  store: ModelPartStore,
  partBytes: number = PART_BYTES
): Promise<Blob | undefined> => {
  const parts: Blob[] = [];
  for (const part of partsOf(file, partBytes)) {
    const kept = await store.get(part.key);
    if (!kept) {
      return undefined;
    }
    parts.push(kept);
  }
  return new Blob(parts);
};

/** Everything `body` gives, as one blob; rejects as `body` does if it breaks off. */
const wholePart = async (body: ReadableStream<Uint8Array>): Promise<Blob> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return new Blob(chunks);
    }
    chunks.push(value);
  }
};

/** The parts of the browser's Cache API a part store is kept in. */
export interface CachePartStorage {
  open(name: string): Promise<{
    match(url: string): Promise<{ blob(): Promise<Blob> } | undefined>;
    put(url: string, response: Response): Promise<void>;
    delete(url: string): Promise<boolean>;
  }>;
  delete(name: string): Promise<boolean>;
}

/**
 * A part store kept in the browser's Cache API, under `cacheName`: where the
 * browser keeps what a page downloads for itself, and what persistent storage
 * is asked for.
 *
 * `storage` is asked for at each use, not once: a page with no Cache API (one
 * that is not a secure context) holds nothing and can keep nothing.
 */
export const createCachePartStore = (
  cacheName: string,
  storage: () => CachePartStorage | undefined = () =>
    typeof caches === 'undefined' ? undefined : (caches as unknown as CachePartStorage)
): ModelPartStore => {
  const cache = async () => {
    const browser = storage();
    if (!browser) {
      throw new Error('This page cannot keep a model: it has no Cache API.');
    }
    return browser.open(cacheName);
  };
  return {
    has: async key => storage() !== undefined && (await (await cache()).match(key)) !== undefined,
    // The cache is given the part whole, once all of it has arrived. Given a
    // body that is still arriving, Chrome's cache drops it with a network
    // error some ten megabytes in, and nothing of the model is ever kept.
    put: async (key, body) => {
      const opened = await cache();
      await opened.put(key, new Response(await wholePart(body)));
    },
    get: async key => {
      if (!storage()) {
        return undefined;
      }
      return (await (await cache()).match(key))?.blob();
    },
    delete: async key => {
      await (await cache()).delete(key);
    },
    clear: async () => {
      await storage()?.delete(cacheName);
    },
  };
};
