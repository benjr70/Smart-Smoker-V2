import { Blob as NodeBlob } from 'buffer';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import type { ModelPartStore } from './modelParts';
import {
  MOONSHINE_BASE,
  QWEN_3_1_7B,
  QWEN_3_5_0_8B,
  QWEN_3_5_2B,
  REGISTERED_MODELS,
  WHISPER_BASE_EN,
  createModelRegistry,
  formatBytes,
} from './modelRegistry';
import { TRANSFORMERS_FILE_LIST } from './transformersFiles';
import type { TransformersModel, TransformersOptions } from './transformersModels';
import {
  TRANSFORMERS_MODELS,
  createTransformersDownloader,
  createTransformersDownloaders,
  createTransformersExtractor,
  createTransformersExtractorPorts,
  createTransformersSpeech,
  createTransformersSpeechPorts,
  transformersCacheOf,
} from './transformersModels';

// jsdom's Blob cannot be read back; a browser's can. Node's own stands in.
const browser = global as unknown as Record<string, unknown>;
const jsdomBlob = browser.Blob;
beforeAll(() => {
  browser.Blob = NodeBlob;
});
afterAll(() => {
  browser.Blob = jsdomBlob;
});

const context = { now: new Date(2026, 9, 3, 15, 5) };

const modelOf = (id: string): TransformersModel =>
  TRANSFORMERS_MODELS.find(({ model }) => model.id === id) as TransformersModel;
const WHISPER = modelOf(WHISPER_BASE_EN.id);
const QWEN = modelOf(QWEN_3_5_2B.id);

/** A store holding the list of a model's files and every part of them, or nothing. */
const storeHolding = (everything: boolean) => {
  const list = new NodeBlob([
    JSON.stringify([{ name: 'config.json', url: 'https://huggingface.co/c', size: 3 }]),
  ]) as unknown as Blob;
  const store: ModelPartStore = {
    has: jest.fn(() => Promise.resolve(everything)),
    put: jest.fn(() => Promise.resolve()),
    get: jest.fn(key =>
      Promise.resolve(everything && key === TRANSFORMERS_FILE_LIST ? list : undefined)
    ),
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
    createSpeech: jest.fn(() => createFakeSpeech({ transcript: 'Sixteen pound brisket.' })),
    createExtractor: jest.fn(() => createFakeExtractor({ raw: { restMinutes: 45 } })),
  };
  const fetched = jest.fn(() => Promise.resolve(adapter));
  return {
    adapter,
    fetched: fetched as unknown as NonNullable<TransformersOptions['adapter']> & jest.Mock,
  };
};

describe('the Transformers.js models in the Model registry', () => {
  const registry = createModelRegistry(REGISTERED_MODELS);

  it('are listed in the speech dropdown after the model a fresh phone gets, with their sizes', () => {
    expect(registry.ofRole('speech').slice(1)).toEqual([
      {
        id: 'whisper-base-en-transformers',
        role: 'speech',
        name: 'Whisper base.en',
        sizeBytes: 208_760_882,
      },
      {
        id: 'moonshine-base-transformers',
        role: 'speech',
        name: 'Moonshine Base',
        sizeBytes: 250_928_812,
      },
    ]);
    expect(
      registry
        .ofRole('speech')
        .slice(1)
        .map(model => formatBytes(model.sizeBytes))
    ).toEqual(['209 MB', '251 MB']);
  });

  it('are listed in the extraction dropdown after the model a fresh phone gets, with their sizes', () => {
    expect(registry.ofRole('extractor').slice(1)).toEqual([
      {
        id: 'qwen3.5-2b-transformers',
        role: 'extractor',
        name: 'Qwen3.5-2B',
        sizeBytes: 1_404_075_458,
      },
      {
        id: 'qwen3-1.7b-transformers',
        role: 'extractor',
        name: 'Qwen3-1.7B',
        sizeBytes: 1_435_197_660,
      },
      {
        id: 'qwen3.5-0.8b-transformers',
        role: 'extractor',
        name: 'Qwen3.5-0.8B',
        sizeBytes: 603_944_942,
      },
    ]);
    expect(
      registry
        .ofRole('extractor')
        .slice(1)
        .map(model => formatBytes(model.sizeBytes))
    ).toEqual(['1.4 GB', '1.4 GB', '604 MB']);
  });

  it('leave the pair a fresh phone gets as it was', () => {
    expect(registry.defaultPair).toEqual({
      speech: 'moonshine-small-streaming',
      extractor: 'gemma-4-e2b-litert',
    });
  });

  it('are each a repository on Hugging Face, with a cache of its own on the phone', () => {
    expect(TRANSFORMERS_MODELS.map(({ model, repo }) => [model, repo])).toEqual([
      [WHISPER_BASE_EN, 'onnx-community/whisper-base.en'],
      [MOONSHINE_BASE, 'onnx-community/moonshine-base-ONNX'],
      [QWEN_3_5_2B, 'onnx-community/Qwen3.5-2B-ONNX'],
      [QWEN_3_1_7B, 'onnx-community/Qwen3-1.7B-ONNX'],
      [QWEN_3_5_0_8B, 'onnx-community/Qwen3.5-0.8B-ONNX'],
    ]);
    const caches = TRANSFORMERS_MODELS.map(transformersCacheOf);
    expect(new Set(caches).size).toBe(TRANSFORMERS_MODELS.length);
    expect(caches[0]).toBe('voiceFill.transformers.whisper-base-en-transformers');
  });

  it('have a downloader each, and a port for the role each plays', () => {
    const ids = (role: string) =>
      TRANSFORMERS_MODELS.filter(({ model }) => model.role === role).map(({ model }) => model.id);

    expect(Object.keys(createTransformersDownloaders())).toEqual(
      TRANSFORMERS_MODELS.map(({ model }) => model.id)
    );
    expect(Object.keys(createTransformersSpeechPorts())).toEqual(ids('speech'));
    expect(Object.keys(createTransformersExtractorPorts())).toEqual(ids('extractor'));
  });
});

describe('the downloader of a Transformers.js model', () => {
  it('says whether the model is on the phone without fetching the adapter', async () => {
    const { fetched } = chunk();

    await expect(
      createTransformersDownloader(QWEN, { store: storeHolding(true), adapter: fetched }).has(
        QWEN_3_5_2B
      )
    ).resolves.toBe(true);
    await expect(
      createTransformersDownloader(QWEN, { store: storeHolding(false), adapter: fetched }).has(
        QWEN_3_5_2B
      )
    ).resolves.toBe(false);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('takes a store that cannot be read as a model that is not there', async () => {
    const store = storeHolding(true);
    (store.get as jest.Mock).mockRejectedValue(new Error('no Cache API'));

    await expect(createTransformersDownloader(QWEN, { store }).has(QWEN_3_5_2B)).resolves.toBe(
      false
    );
  });

  it('downloads the model’s files through the adapter, into its store, with progress', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(false);
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await createTransformersDownloader(WHISPER, { store, adapter: fetched }).download(
      WHISPER_BASE_EN,
      options
    );

    expect(adapter.download).toHaveBeenCalledWith(WHISPER, store, options);
  });

  it('proves the model through the adapter', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(true);
    adapter.testLoad.mockResolvedValue(false);

    await expect(
      createTransformersDownloader(QWEN, { store, adapter: fetched }).testLoad(QWEN_3_5_2B)
    ).resolves.toBe(false);
    expect(adapter.testLoad).toHaveBeenCalledWith(QWEN, store);
  });

  it('removes the model by emptying its store, without fetching the adapter', async () => {
    const { fetched } = chunk();
    const store = storeHolding(true);

    await createTransformersDownloader(QWEN, { store, adapter: fetched }).remove(QWEN_3_5_2B);

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('the ports of a Transformers.js model', () => {
  it('fetch the adapter only once the speech port is asked to load, and hear through it', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(true);
    const speech = createTransformersSpeech(WHISPER, { store, adapter: fetched });
    expect(fetched).not.toHaveBeenCalled();

    await speech.load();
    await speech.start(jest.fn());
    await expect(speech.stop()).resolves.toBe('Sixteen pound brisket.');

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(adapter.createSpeech).toHaveBeenCalledWith(WHISPER, store);
  });

  it('fetch the adapter only once the extractor port is asked to load, and read through it', async () => {
    const { adapter, fetched } = chunk();
    const store = storeHolding(true);
    const extractor = createTransformersExtractor(QWEN, { store, adapter: fetched });
    expect(fetched).not.toHaveBeenCalled();

    await extractor.load();
    await expect(extractor.extract('postSmoke', 'Rested 45 minutes.', context)).resolves.toEqual({
      restMinutes: 45,
    });

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(adapter.createExtractor).toHaveBeenCalledWith(QWEN, store);
  });
});
