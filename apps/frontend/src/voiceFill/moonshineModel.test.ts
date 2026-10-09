import type { ModelFile, ModelFileStore } from './modelFiles';
import { MOONSHINE_SMALL_STREAMING, REGISTERED_MODELS, createModelRegistry } from './modelRegistry';
import {
  MOONSHINE_FILE_LIST,
  createMoonshineDownloader,
  createMoonshineSpeech,
  keepFileList,
  keptFileList,
} from './moonshineModel';
import { createFakeSpeech } from './fakeAdapters';

const FILES: ModelFile[] = [
  { name: 'encoder.ort', url: 'https://download.moonshine.test/encoder.ort', size: 6 },
  { name: 'tokenizer.bin', url: 'https://download.moonshine.test/tokenizer.bin', size: 4 },
];

const memoryStore = () => {
  const files = new Map<string, Uint8Array>();
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

/** The store as a finished download leaves it: every file, and the list of them. */
const downloadedStore = async () => {
  const held = memoryStore();
  await Promise.all(FILES.map(file => held.store.put(file.url, new Uint8Array(file.size))));
  await keepFileList(held.store, FILES);
  return held;
};

/** The adapter's chunk, standing in for the real one, saying when it is fetched. */
const fakeAdapter = () => {
  const speech = createFakeSpeech({ transcript: 'Sixteen pound brisket.' });
  const chunk = {
    download: jest.fn(() => Promise.resolve()),
    testLoad: jest.fn(() => Promise.resolve(true)),
    createSpeech: jest.fn(() => speech),
  };
  const adapter = jest.fn(() => Promise.resolve(chunk));
  return { adapter, chunk };
};

describe('Moonshine Small Streaming in the Model registry', () => {
  test('is the speech model a fresh phone gets', () => {
    expect(createModelRegistry(REGISTERED_MODELS).defaultPair.speech).toBe(
      MOONSHINE_SMALL_STREAMING.id
    );
  });

  test('is listed for the speech dropdown under its name, with its size', () => {
    expect(createModelRegistry(REGISTERED_MODELS).ofRole('speech')[0]).toEqual({
      id: 'moonshine-small-streaming',
      role: 'speech',
      name: 'Moonshine Small Streaming',
      sizeBytes: 165_489_086,
    });
  });
});

describe('the Moonshine downloader', () => {
  test('a model never downloaded is not on the phone', async () => {
    const { store } = memoryStore();
    const { adapter } = fakeAdapter();

    expect(await createMoonshineDownloader({ store, adapter }).has(MOONSHINE_SMALL_STREAMING)).toBe(
      false
    );
  });

  test('a downloaded model is on the phone', async () => {
    const { store } = await downloadedStore();
    const { adapter } = fakeAdapter();

    expect(await createMoonshineDownloader({ store, adapter }).has(MOONSHINE_SMALL_STREAMING)).toBe(
      true
    );
  });

  test('one the browser has evicted a file of is not', async () => {
    const { store, files } = await downloadedStore();
    files.delete(FILES[1].url);
    const { adapter } = fakeAdapter();

    expect(await createMoonshineDownloader({ store, adapter }).has(MOONSHINE_SMALL_STREAMING)).toBe(
      false
    );
  });

  test.each([
    ['is not a list', '{"name":"encoder.ort"}'],
    ['lists nothing', '[]'],
    ['lists something that is not a file', '[{"name":"encoder.ort"}]'],
    ['cannot be read', 'not json'],
  ])('one whose kept file list %s is not', async (_why, kept) => {
    const { store } = await downloadedStore();
    await store.put(
      MOONSHINE_FILE_LIST,
      Uint8Array.from(kept, character => character.charCodeAt(0))
    );
    const { adapter } = fakeAdapter();

    expect(await keptFileList(store)).toBeUndefined();
    expect(await createMoonshineDownloader({ store, adapter }).has(MOONSHINE_SMALL_STREAMING)).toBe(
      false
    );
  });

  test('a store that cannot be read holds nothing', async () => {
    const { store } = memoryStore();
    const { adapter } = fakeAdapter();
    const broken = { ...store, get: () => Promise.reject(new Error('storage is unavailable')) };

    expect(
      await createMoonshineDownloader({ store: broken, adapter }).has(MOONSHINE_SMALL_STREAMING)
    ).toBe(false);
  });

  test('asking whether it is on the phone does not fetch the adapter', async () => {
    const { store } = await downloadedStore();
    const { adapter } = fakeAdapter();

    await createMoonshineDownloader({ store, adapter }).has(MOONSHINE_SMALL_STREAMING);

    expect(adapter).not.toHaveBeenCalled();
  });

  test('removing it deletes every file and the list of them, without the adapter', async () => {
    const { store, files } = await downloadedStore();
    const { adapter } = fakeAdapter();
    const downloader = createMoonshineDownloader({ store, adapter });

    await downloader.remove(MOONSHINE_SMALL_STREAMING);

    expect(files.size).toBe(0);
    expect(await downloader.has(MOONSHINE_SMALL_STREAMING)).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
  });

  test('a download goes through the adapter, into the store, with its progress and its stop', async () => {
    const { store } = memoryStore();
    const { adapter, chunk } = fakeAdapter();
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await createMoonshineDownloader({ store, adapter }).download(
      MOONSHINE_SMALL_STREAMING,
      options
    );

    expect(chunk.download).toHaveBeenCalledWith(store, options);
  });

  test('the test-load is the adapter’s, of what is in the store', async () => {
    const { store } = await downloadedStore();
    const { adapter, chunk } = fakeAdapter();
    chunk.testLoad.mockResolvedValue(false);

    expect(
      await createMoonshineDownloader({ store, adapter }).testLoad(MOONSHINE_SMALL_STREAMING)
    ).toBe(false);
    expect(chunk.testLoad).toHaveBeenCalledWith(store);
  });
});

describe('the Moonshine speech port', () => {
  test('fetches the adapter only once it is asked to load', async () => {
    const { store } = await downloadedStore();
    const { adapter, chunk } = fakeAdapter();
    const speech = createMoonshineSpeech({ store, adapter });
    expect(adapter).not.toHaveBeenCalled();

    await speech.load();

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(chunk.createSpeech).toHaveBeenCalledWith(store);
  });
});
