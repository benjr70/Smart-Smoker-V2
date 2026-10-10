import { createFakeExtractor } from './fakeAdapters';
import type { GemmaOptions } from './gemmaModel';
import { GEMMA_FILE, createGemmaDownloader, createGemmaExtractor } from './gemmaModel';
import type { ModelPartStore } from './modelParts';
import { GEMMA_4_E2B, REGISTERED_MODELS, createModelRegistry, formatBytes } from './modelRegistry';

const context = { now: new Date(2026, 9, 3, 15, 5) };

/** A store that holds every part it is asked for, or none. */
const storeHolding = (everything: boolean) => {
  const store: ModelPartStore = {
    has: jest.fn(() => Promise.resolve(everything)),
    put: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve(undefined)),
    delete: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  };
  return store;
};

/** The adapter's chunk, with no runtime in it, and how often it was fetched. */
const chunk = () => {
  const adapter = {
    download: jest.fn(() => Promise.resolve()),
    testLoad: jest.fn(() => Promise.resolve(true)),
    createExtractor: jest.fn(() => createFakeExtractor({ raw: { restMinutes: 45 } })),
  };
  const fetched = jest.fn(() => Promise.resolve(adapter));
  return {
    adapter,
    fetched: fetched as unknown as NonNullable<GemmaOptions['adapter']> & jest.Mock,
  };
};

describe('Gemma 4 E2B', () => {
  it('is the extraction model a fresh phone gets, listed with its size', () => {
    const registry = createModelRegistry(REGISTERED_MODELS);

    expect(registry.defaultPair.extractor).toBe(GEMMA_4_E2B.id);
    expect(registry.ofRole('extractor')[0]).toEqual({
      id: 'gemma-4-e2b-litert',
      role: 'extractor',
      name: 'Gemma 4 E2B',
      sizeBytes: 2_008_432_640,
    });
    expect(formatBytes(GEMMA_4_E2B.sizeBytes)).toBe('2.0 GB');
  });

  it('is one file on Hugging Face, of the size it is listed with', () => {
    expect(GEMMA_FILE.url).toMatch(
      /^https:\/\/huggingface\.co\/litert-community\/gemma-4-E2B-it-litert-lm\/resolve\/[0-9a-f]{40}\/gemma-4-E2B-it-web\.litertlm$/
    );
    expect(GEMMA_FILE.size).toBe(GEMMA_4_E2B.sizeBytes);
  });
});

describe('the Gemma downloader', () => {
  it('says whether the model is on the phone without fetching the adapter', async () => {
    const { fetched } = chunk();

    await expect(
      createGemmaDownloader({ store: storeHolding(true), adapter: fetched }).has(GEMMA_4_E2B)
    ).resolves.toBe(true);
    await expect(
      createGemmaDownloader({ store: storeHolding(false), adapter: fetched }).has(GEMMA_4_E2B)
    ).resolves.toBe(false);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('takes a store that cannot be read as a model that is not there', async () => {
    const store = storeHolding(true);
    (store.has as jest.Mock).mockRejectedValue(new Error('no Cache API'));

    await expect(createGemmaDownloader({ store }).has(GEMMA_4_E2B)).resolves.toBe(false);
  });

  it('downloads the file through the adapter, into its store', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(false);
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await createGemmaDownloader({ store, adapter: fetched }).download(GEMMA_4_E2B, options);

    expect(adapter.download).toHaveBeenCalledWith(GEMMA_FILE, store, options);
  });

  it('proves the model through the adapter', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(true);
    adapter.testLoad.mockResolvedValue(false);

    await expect(
      createGemmaDownloader({ store, adapter: fetched }).testLoad(GEMMA_4_E2B)
    ).resolves.toBe(false);
    expect(adapter.testLoad).toHaveBeenCalledWith(GEMMA_FILE, store);
  });

  it('removes the model by emptying its store, without fetching the adapter', async () => {
    const { fetched } = chunk();
    const store = storeHolding(true);

    await createGemmaDownloader({ store, adapter: fetched }).remove(GEMMA_4_E2B);

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('the Gemma extractor', () => {
  it('fetches the adapter only once it is asked to load, and reads through it', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(true);
    const extractor = createGemmaExtractor({ store, adapter: fetched });
    expect(fetched).not.toHaveBeenCalled();

    await extractor.load();
    await expect(extractor.extract('postSmoke', 'Rested 45 minutes.', context)).resolves.toEqual({
      restMinutes: 45,
    });

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(adapter.createExtractor).toHaveBeenCalledWith(GEMMA_FILE, store);
  });
});
