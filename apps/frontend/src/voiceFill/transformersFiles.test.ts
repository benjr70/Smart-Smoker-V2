import { Blob as NodeBlob } from 'buffer';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
} from 'stream/web';
import type { FetchedPart, ModelPartStore } from './modelParts';
import type { HubFile } from './transformersFiles';
import {
  TRANSFORMERS_FILE_LIST,
  downloadHubFiles,
  hasHubFiles,
  hubFileUrl,
  keepFileList,
  keptFileList,
  keptHubFile,
} from './transformersFiles';

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

const REPO = 'onnx-community/whisper-base.en';
const PART = 4;

/** What the repository hosts: a small file, and one of two parts and a bit. */
const HOSTED: Record<string, Uint8Array> = {
  'config.json': Uint8Array.from([1, 2, 3]),
  'onnx/encoder_model.onnx': Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
};
const FILES: HubFile[] = Object.entries(HOSTED).map(([name, bytes]) => ({
  name,
  url: hubFileUrl(REPO, name),
  size: bytes.byteLength,
}));

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

/** A store that keeps its parts in memory. */
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

/** Hugging Face, answering a range of a file; `breaksAt` is a file it cannot give. */
const host = (breaksAt?: string) => {
  const asked: string[] = [];
  const fetchPart = async (
    url: string,
    init: { headers: { Range: string } }
  ): Promise<FetchedPart> => {
    asked.push(`${url} ${init.headers.Range}`);
    const name = Object.keys(HOSTED).find(hosted => hubFileUrl(REPO, hosted) === url);
    if (!name || name === breaksAt) {
      return { status: 404, body: null };
    }
    const [, first, last] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range) ?? [];
    const range = HOSTED[name].slice(Number(first), Number(last) + 1);
    return {
      status: 206,
      body: new NodeReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(range);
          controller.close();
        },
      }) as unknown as ReadableStream<Uint8Array>,
    };
  };
  return { asked, fetchPart };
};

/** Downloads the model, in parts of the size a real download cuts unless told one. */
const download = (
  store: ModelPartStore,
  hosting = host(),
  onProgress = jest.fn(),
  partBytes?: number
) =>
  downloadHubFiles(FILES, {
    store,
    onProgress,
    signal: new AbortController().signal,
    fetchPart: hosting.fetchPart,
    ...(partBytes !== undefined && { partBytes }),
  });

const bytesOf = async (blob: Blob | undefined): Promise<number[]> =>
  blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : [];

describe('a file of a model on Hugging Face', () => {
  it('is hosted where the runtime asks for it: in its repository as it stands', () => {
    expect(hubFileUrl(REPO, 'onnx/encoder_model.onnx')).toBe(
      'https://huggingface.co/onnx-community/whisper-base.en/resolve/main/onnx/encoder_model.onnx'
    );
  });
});

describe('downloading a model’s files from Hugging Face', () => {
  it('fetches every file a range at a time, telling how much of the model has arrived', async () => {
    const { store } = createMemoryStore();
    const hosting = host();
    const onProgress = jest.fn();

    await download(store, hosting, onProgress, PART);

    expect(hosting.asked).toEqual([
      `${FILES[0].url} bytes=0-2`,
      `${FILES[1].url} bytes=0-3`,
      `${FILES[1].url} bytes=4-7`,
      `${FILES[1].url} bytes=8-9`,
    ]);
    // Bytes of the whole model, never of the one file: they only ever go up.
    expect(onProgress.mock.calls.map(([received]) => received)).toEqual([3, 7, 11, 13]);
  });

  it('keeps the list of the files once they have all arrived', async () => {
    const { store } = createMemoryStore();

    await download(store);

    expect(await keptFileList(store)).toEqual(FILES);
    expect(await hasHubFiles(store)).toBe(true);
  });

  it('keeps no list of a model that broke off, and goes on from what had arrived', async () => {
    const { store } = createMemoryStore();

    await expect(download(store, host('onnx/encoder_model.onnx'))).rejects.toThrow('404');
    expect(await keptFileList(store)).toBeUndefined();
    expect(await hasHubFiles(store)).toBe(false);

    const again = host();
    await download(store, again);

    // The file that had arrived is not asked for a second time.
    expect(again.asked.some(asked => asked.startsWith(FILES[0].url))).toBe(false);
    expect(await hasHubFiles(store)).toBe(true);
  });

  it('stops where it is when the download is stopped', async () => {
    const { store } = createMemoryStore();
    const stopping = new AbortController();
    stopping.abort();

    await expect(
      downloadHubFiles(FILES, {
        store,
        onProgress: jest.fn(),
        signal: stopping.signal,
        fetchPart: host().fetchPart,
        partBytes: PART,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('whether a model is still on the phone', () => {
  it('is not, where it was never downloaded', async () => {
    expect(await hasHubFiles(createMemoryStore().store)).toBe(false);
  });

  it('is not, once the browser has evicted a part of one of its files', async () => {
    const { store, kept } = createMemoryStore();
    await download(store);
    expect(await hasHubFiles(store)).toBe(true);

    const part = Array.from(kept.keys()).find(key => key.startsWith(FILES[1].url));
    kept.delete(part as string);

    expect(await hasHubFiles(store)).toBe(false);
  });

  it('is not, where the list kept of it cannot be read', async () => {
    const { store, kept } = createMemoryStore();
    kept.set(TRANSFORMERS_FILE_LIST, new NodeBlob(['not a list']) as unknown as Blob);

    expect(await keptFileList(store)).toBeUndefined();
    expect(await hasHubFiles(store)).toBe(false);
  });
});

describe('what the runtime is handed when it asks for a file', () => {
  /** A store holding the whole of the model. */
  const downloaded = async () => {
    const held = createMemoryStore();
    await download(held.store);
    return held;
  };

  it('is the whole of the file, from whichever model’s store holds it', async () => {
    const other = createMemoryStore();
    await keepFileList(other.store, [
      { name: 'config.json', url: 'https://other.test/c', size: 0 },
    ]);
    const { store } = await downloaded();

    expect(await bytesOf(await keptHubFile([other.store, store], FILES[1].url))).toEqual(
      Array.from(HOSTED['onnx/encoder_model.onnx'])
    );
  });

  it('is nothing for a file no downloaded model lists', async () => {
    const { store } = await downloaded();

    expect(await keptHubFile([store], hubFileUrl(REPO, 'onnx/decoder_model.onnx'))).toBeUndefined();
    expect(await keptHubFile([createMemoryStore().store], FILES[0].url)).toBeUndefined();
  });

  it('is nothing for a file a part of which is gone', async () => {
    const { store, kept } = await downloaded();
    const part = Array.from(kept.keys()).find(key => key.startsWith(FILES[1].url));
    kept.delete(part as string);

    expect(await keptHubFile([store], FILES[1].url)).toBeUndefined();
  });
});
