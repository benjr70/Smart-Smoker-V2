import { createFakeExtractor } from './fakeAdapters';
import { REGISTERED_MODELS, createModelRegistry, formatBytes } from './modelRegistry';
import type { WebLlmOptions } from './webLlmModels';
import { WEB_LLM_MODEL_IDS, createWebLlmDownloaders, createWebLlmExtractors } from './webLlmModels';

const context = { now: new Date(2026, 9, 3, 15, 5) };
const QWEN = 'qwen3-1.7b-webllm';
const registry = createModelRegistry(REGISTERED_MODELS);
const qwen = registry.find(QWEN)!;

/** The adapter's chunk, with no runtime in it, and how often it was fetched. */
const chunk = () => {
  const adapter = {
    download: jest.fn(() => Promise.resolve()),
    testLoad: jest.fn(() => Promise.resolve(true)),
    has: jest.fn(() => Promise.resolve(true)),
    remove: jest.fn(() => Promise.resolve()),
    createExtractor: jest.fn(() => createFakeExtractor({ raw: { restMinutes: 45 } })),
  };
  const fetched = jest.fn(() => Promise.resolve(adapter));
  return {
    adapter,
    fetched: fetched as unknown as NonNullable<WebLlmOptions['adapter']> & jest.Mock,
  };
};

describe('the models WebLLM runs', () => {
  it('are registered as extraction models, each with its size, after the one a fresh phone gets', () => {
    expect(registry.defaultPair.extractor).toBe('gemma-4-e2b-litert');
    expect(
      registry
        .ofRole('extractor')
        // The models Transformers.js runs come between: WebLLM's are the last.
        .slice(4)
        .map(model => [model.id, model.name, formatBytes(model.sizeBytes)])
    ).toEqual([
      ['qwen3-1.7b-webllm', 'Qwen3 1.7B (WebLLM)', '986 MB'],
      ['qwen3.5-2b-webllm', 'Qwen3.5 2B (WebLLM)', '1.1 GB'],
      ['qwen3.5-0.8b-webllm', 'Qwen3.5 0.8B (WebLLM)', '444 MB'],
    ]);
  });

  it('are each a build WebLLM lists, and each have a downloader and an extractor', () => {
    const { fetched } = chunk();
    const ids = Object.keys(WEB_LLM_MODEL_IDS);

    expect(ids.map(id => registry.find(id)?.role)).toEqual(['extractor', 'extractor', 'extractor']);
    expect(Object.values(WEB_LLM_MODEL_IDS)).toEqual([
      'Qwen3-1.7B-q4f16_1-MLC',
      'Qwen3.5-2B-q4f16_1-MLC',
      'Qwen3.5-0.8B-q4f16_1-MLC',
    ]);
    expect(Object.keys(createWebLlmDownloaders({ adapter: fetched }))).toEqual(ids);
    expect(Object.keys(createWebLlmExtractors({ adapter: fetched }))).toEqual(ids);
  });

  it('fetch nothing of WebLLM until something is asked of one of them', () => {
    const { fetched } = chunk();

    createWebLlmDownloaders({ adapter: fetched });
    createWebLlmExtractors({ adapter: fetched });

    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('the downloader of a model WebLLM runs', () => {
  it('has WebLLM fetch the model it is listed under, told its size', async () => {
    const { adapter, fetched } = chunk();
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await createWebLlmDownloaders({ adapter: fetched })[QWEN].download(qwen, options);

    expect(adapter.download).toHaveBeenCalledWith(
      'Qwen3-1.7B-q4f16_1-MLC',
      qwen.sizeBytes,
      options
    );
  });

  it('proves, looks for and removes the model through WebLLM, which keeps it', async () => {
    const { adapter, fetched } = chunk();
    const downloader = createWebLlmDownloaders({ adapter: fetched })[QWEN];
    adapter.testLoad.mockResolvedValue(false);

    await expect(downloader.testLoad(qwen)).resolves.toBe(false);
    await expect(downloader.has(qwen)).resolves.toBe(true);
    await downloader.remove(qwen);

    expect(adapter.testLoad).toHaveBeenCalledWith('Qwen3-1.7B-q4f16_1-MLC');
    expect(adapter.has).toHaveBeenCalledWith('Qwen3-1.7B-q4f16_1-MLC');
    expect(adapter.remove).toHaveBeenCalledWith('Qwen3-1.7B-q4f16_1-MLC');
  });

  it('does not fetch WebLLM to look for a model that is not the picked one: it cannot say', async () => {
    const { adapter, fetched } = chunk();
    const downloaders = createWebLlmDownloaders({
      adapter: fetched,
      isPicked: id => id === 'qwen3.5-2b-webllm',
    });

    // Not `false`: a model that is not picked has not gone from the phone.
    await expect(downloaders[QWEN].has(qwen)).rejects.toThrow('not picked');
    expect(fetched).not.toHaveBeenCalled();

    await expect(
      downloaders['qwen3.5-2b-webllm'].has(registry.find('qwen3.5-2b-webllm')!)
    ).resolves.toBe(true);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(adapter.has).toHaveBeenCalledWith('Qwen3.5-2B-q4f16_1-MLC');
  });

  it('takes what WebLLM cannot read as a model that is not there', async () => {
    const { adapter, fetched } = chunk();
    adapter.has.mockRejectedValue(new Error('The cache cannot be opened.'));

    await expect(createWebLlmDownloaders({ adapter: fetched })[QWEN].has(qwen)).resolves.toBe(
      false
    );
  });

  it('cannot say whether the model is there while WebLLM cannot be reached', async () => {
    const offline = jest.fn(() => Promise.reject(new Error('Loading chunk failed.')));

    // Not `false`: a phone that is offline has not lost its model.
    await expect(createWebLlmDownloaders({ adapter: offline })[QWEN].has(qwen)).rejects.toThrow(
      'Loading chunk failed.'
    );
  });
});

describe('the extractor of a model WebLLM runs', () => {
  it('fetches the adapter only once it is asked to load, and reads through it', async () => {
    const { adapter, fetched } = chunk();
    const extractor = createWebLlmExtractors({ adapter: fetched })['qwen3.5-0.8b-webllm'];

    expect(fetched).not.toHaveBeenCalled();

    await extractor.load();
    await expect(extractor.extract('postSmoke', 'Rested it 45 minutes.', context)).resolves.toEqual(
      { restMinutes: 45 }
    );
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(adapter.createExtractor).toHaveBeenCalledWith('Qwen3.5-0.8B-q4f16_1-MLC');
  });
});
