/**
 * Getting a model's files onto the phone: each is fetched from where its
 * publisher hosts it and kept in a store on the phone, so the next download
 * picks up after the files already there and a load reads them with no network.
 *
 * Nothing here knows which model the files are of, or what runs them.
 */

/** One file of a model, as its publisher lists it. */
export interface ModelFile {
  /** What the runtime knows the file by. */
  name: string;
  /** Where it is fetched from. */
  url: string;
  /** How many bytes it is. */
  size: number;
}

/** Where a model's files are kept on the phone, by the address they came from. */
export interface ModelFileStore {
  has(url: string): Promise<boolean>;
  /** The bytes kept for `url`; nothing where none are. */
  get(url: string): Promise<Uint8Array | undefined>;
  put(url: string, bytes: Uint8Array): Promise<void>;
  /** Deletes everything the store holds. */
  clear(): Promise<void>;
}

/** The parts of a `fetch` answer a download reads. */
export interface FetchedFile {
  ok: boolean;
  status: number;
  body?: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FetchModelFilesOptions {
  store: ModelFileStore;
  /** Told how many bytes of the whole model are on the phone, as they arrive. */
  onProgress: (receivedBytes: number) => void;
  /** Stops the download where it is. */
  signal: AbortSignal;
  fetchFile?: (url: string, init: { signal: AbortSignal }) => Promise<FetchedFile>;
}

const stopped = (): Error =>
  Object.assign(new Error('The download was stopped.'), { name: 'AbortError' });

/** The whole of one fetched file, with `onBytes` told as each part of it arrives. */
const read = async (
  fetched: FetchedFile,
  signal: AbortSignal,
  onBytes: (received: number) => void
): Promise<Uint8Array> => {
  const reader = fetched.body?.getReader();
  if (!reader) {
    const whole = new Uint8Array(await fetched.arrayBuffer());
    onBytes(whole.byteLength);
    return whole;
  }
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (signal.aborted) {
      throw stopped();
    }
    if (done) {
      break;
    }
    if (value) {
      parts.push(value);
      received += value.byteLength;
      onBytes(received);
    }
  }
  const whole = new Uint8Array(received);
  let offset = 0;
  parts.forEach(part => {
    whole.set(part, offset);
    offset += part.byteLength;
  });
  return whole;
};

/**
 * Fetches every one of `files` the store does not hold yet, in order, and
 * keeps each as it completes. Resolves once they are all held.
 *
 * Rejects if a file cannot be fetched, arrives a different size than listed,
 * or `signal` stops it. The files that had completed stay in the store, for
 * the next call to go on from: a download picks up at the file it broke in,
 * not at the byte.
 */
export const fetchModelFiles = async (
  files: readonly ModelFile[],
  { store, onProgress, signal, fetchFile = (url, init) => fetch(url, init) }: FetchModelFilesOptions
): Promise<void> => {
  let held = 0;
  for (const file of files) {
    if (signal.aborted) {
      throw stopped();
    }
    if (!(await store.has(file.url))) {
      const fetched = await fetchFile(file.url, { signal });
      if (!fetched.ok) {
        throw new Error(`Could not download ${file.name}: ${fetched.status}`);
      }
      const heldBefore = held;
      const bytes = await read(fetched, signal, received => onProgress(heldBefore + received));
      if (bytes.byteLength !== file.size) {
        throw new Error(
          `${file.name} arrived as ${bytes.byteLength} bytes; ${file.size} were expected`
        );
      }
      await store.put(file.url, bytes);
    }
    held += file.size;
    onProgress(held);
  }
};

/** The parts of the browser's Cache API a file store is kept in. */
export interface CacheStorageLike {
  open(name: string): Promise<{
    match(url: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined>;
    put(url: string, response: Response): Promise<void>;
  }>;
  delete(name: string): Promise<boolean>;
}

/**
 * A file store kept in the browser's Cache API, under `cacheName`: where the
 * browser keeps what a page downloads for itself, and what persistent storage
 * is asked for.
 *
 * `storage` is asked for at each use, not once: a page with no Cache API (one
 * that is not a secure context) holds nothing and can keep nothing.
 */
export const createCacheFileStore = (
  cacheName: string,
  storage: () => CacheStorageLike | undefined = () =>
    typeof caches === 'undefined' ? undefined : (caches as unknown as CacheStorageLike)
): ModelFileStore => {
  const cache = async () => {
    const browser = storage();
    if (!browser) {
      throw new Error('This page cannot keep a model: it has no Cache API.');
    }
    return browser.open(cacheName);
  };
  return {
    has: async url => storage() !== undefined && (await (await cache()).match(url)) !== undefined,
    get: async url => {
      if (!storage()) {
        return undefined;
      }
      const kept = await (await cache()).match(url);
      return kept ? new Uint8Array(await kept.arrayBuffer()) : undefined;
    },
    put: async (url, bytes) =>
      (await cache()).put(
        url,
        new Response(new Blob([bytes]), {
          headers: { 'Content-Length': String(bytes.byteLength) },
        })
      ),
    clear: async () => {
      await storage()?.delete(cacheName);
    },
  };
};
