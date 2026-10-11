import { jsonExtractionRequestFor } from './extractionRequest';
import { jsonSchemaFor } from './fieldDefinition';
import type { WebLlmRequest, WebLlmRuntime } from './webLlmExtractor';
import { CannotRunHereError, createWebLlmExtractor, createWebLlmModel } from './webLlmExtractor';

const TRANSCRIPT = 'Sixteen pound brisket.';
const context = { now: new Date(2026, 9, 3, 15, 5) };
const MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';
const MB = 1_000_000;

interface PhoneScript {
  /** What every answer of the model is; an error where the model fails. */
  reply?: string | Error;
  /** Whether the whole of the model is on the phone before anything is asked. */
  onPhone?: boolean;
  /** What loading the model fails with; nothing where it loads. */
  loadFails?: Error;
  /** How much of the model a load says is on the phone, as it goes. */
  progress?: readonly number[];
  /** Whether a load leaves the whole model on the phone, failed or not. */
  loadFetchesAll?: boolean;
}

/**
 * A runtime that runs no model: every engine answers with `reply`, and
 * everything asked of it is kept to be looked at.
 */
const runtimeOn = ({
  reply = '{}',
  onPhone = true,
  loadFails,
  progress = [],
  loadFetchesAll = true,
}: PhoneScript = {}) => {
  const phone = {
    holds: onPhone,
    loadFails,
    loads: [] as string[],
    requests: [] as WebLlmRequest[],
    released: 0,
    removed: [] as string[],
  };
  const runtime: WebLlmRuntime = {
    createEngine: async (modelId, options) => {
      phone.loads.push(modelId);
      progress.forEach(fraction => options?.onProgress?.(fraction));
      phone.holds = phone.holds || loadFetchesAll;
      if (phone.loadFails) {
        throw phone.loadFails;
      }
      return {
        complete: request => {
          phone.requests.push(request);
          return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
        },
        unload: () => {
          phone.released += 1;
          return Promise.resolve();
        },
      };
    },
    has: () => Promise.resolve(phone.holds),
    remove: modelId => {
      phone.removed.push(modelId);
      phone.holds = false;
      return Promise.resolve();
    },
  };
  return { runtime, phone };
};

const extractorOn = (script?: PhoneScript) => {
  const { runtime, phone } = runtimeOn(script);
  return { extractor: createWebLlmExtractor(runtime, MODEL_ID), phone };
};

describe('the WebLLM extractor', () => {
  it('gives the JSON object the model answers with as the raw object', async () => {
    const raw = { meatType: 'brisket', weight: 16, notes: 'Bark is setting.' };
    const { extractor } = extractorOn({ reply: JSON.stringify(raw) });

    await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).resolves.toEqual(raw);
  });

  it('asks the model once for a Ramble, holding its answer to the screen’s JSON Schema', async () => {
    const { extractor, phone } = extractorOn();
    const request = jsonExtractionRequestFor('smoke', TRANSCRIPT, context);

    await extractor.extract('smoke', TRANSCRIPT, context);

    expect(phone.requests).toEqual([
      {
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        response_format: {
          type: 'json_object',
          schema: JSON.stringify(jsonSchemaFor('smoke', context)),
        },
      },
    ]);
  });

  it('tells the model, in words, to write the JSON its answer is held to', async () => {
    const { extractor, phone } = extractorOn();

    await extractor.extract('postSmoke', TRANSCRIPT, context);

    const [{ messages, response_format: held }] = phone.requests;
    expect(messages[0].content).toContain('JSON');
    expect(messages[0].content).toContain(held.schema);
  });

  it.each([
    ['plain text', 'A sixteen pound brisket.'],
    ['JSON cut short', '{"meatType": "brisket"'],
    ['a list', '[{"meatType": "brisket"}]'],
    ['nothing', ''],
  ])('fails on an answer that is %s', async (_what, reply) => {
    const { extractor } = extractorOn({ reply });

    await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).rejects.toThrow(
      /did not answer/
    );
  });

  it('fails when the model does', async () => {
    const { extractor } = extractorOn({ reply: new Error('The GPU was lost.') });

    await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).rejects.toThrow(
      'The GPU was lost.'
    );
  });

  it('loads the model once, however often it is asked to load or to extract', async () => {
    const { extractor, phone } = extractorOn();

    await Promise.all([extractor.load(), extractor.load()]);
    await extractor.extract('preSmoke', TRANSCRIPT, context);
    await extractor.extract('preSmoke', TRANSCRIPT, context);

    expect(phone.loads).toEqual([MODEL_ID]);
  });

  it('never downloads a model for a Ramble: one that is not on the phone cannot load', async () => {
    const { extractor, phone } = extractorOn({ onPhone: false });

    await expect(extractor.load()).rejects.toThrow('not downloaded');
    expect(phone.loads).toEqual([]);

    phone.holds = true;
    await expect(extractor.load()).resolves.toBeUndefined();
  });

  it('tries a load that failed again when next asked', async () => {
    const { extractor, phone } = extractorOn({ loadFails: new Error('Out of memory.') });

    await expect(extractor.load()).rejects.toThrow('Out of memory.');
    phone.loadFails = undefined;

    await expect(extractor.load()).resolves.toBeUndefined();
  });

  it('lets the model go when unloaded, and loads it again when next asked', async () => {
    const { extractor, phone } = extractorOn();

    await extractor.load();
    await extractor.unload();
    expect(phone.released).toBe(1);

    await extractor.load();
    expect(phone.loads).toHaveLength(2);
  });

  it('has nothing to let go of when it was never loaded', async () => {
    const { extractor, phone } = extractorOn();

    await expect(extractor.unload()).resolves.toBeUndefined();
    expect(phone.released).toBe(0);
  });

  it('lets go of a model that was still loading when it was unloaded', async () => {
    const { extractor, phone } = extractorOn();

    const loading = extractor.load();
    await extractor.unload();
    await loading;

    expect(phone.released).toBe(1);
  });
});

describe('a model WebLLM runs', () => {
  const download = (script: PhoneScript, signal = new AbortController().signal) => {
    const { runtime, phone } = runtimeOn({ onPhone: false, ...script });
    const model = createWebLlmModel(runtime);
    const progress: number[] = [];
    const downloading = model.download(MODEL_ID, 1000 * MB, {
      signal,
      onProgress: receivedBytes => progress.push(receivedBytes),
    });
    return { model, phone, progress, downloading };
  };

  describe('as it is downloaded', () => {
    it('is fetched by WebLLM loading it, and is let go once it is all there', async () => {
      const { phone, downloading } = download({});

      await expect(downloading).resolves.toBeUndefined();

      expect(phone.loads).toEqual([MODEL_ID]);
      expect(phone.released).toBe(1);
    });

    it('says how many of its listed bytes are on the phone, and never fewer than before', async () => {
      // WebLLM counts up as it fetches, then again from nothing as it loads.
      const { progress, downloading } = download({ progress: [0, 0.25, 1, 0.1, 1] });

      await downloading;

      expect(progress).toEqual([0, 250 * MB, 1000 * MB, 1000 * MB, 1000 * MB]);
    });

    it('breaks, to be picked up again, when the load fails with the model still part-way', async () => {
      const { downloading } = download({
        loadFails: new Error('Failed to fetch.'),
        loadFetchesAll: false,
      });

      await expect(downloading).rejects.toThrow('Failed to fetch.');
    });

    it('is over when the model fails to initialise with all of it on the phone', async () => {
      const { downloading } = download({ loadFails: new Error('The WebGPU device was lost.') });

      await expect(downloading).resolves.toBeUndefined();
    });

    it('is over on a phone that cannot run the model, whatever it downloads', async () => {
      const { downloading } = download({
        loadFails: new CannotRunHereError('This model requires shader-f16.'),
        loadFetchesAll: false,
      });

      await expect(downloading).resolves.toBeUndefined();
    });

    it('is not over when it was stopped, wherever the stop left it', async () => {
      const stopping = new AbortController();
      stopping.abort();
      const { downloading } = download({ loadFails: new Error('Stopped.') }, stopping.signal);

      await expect(downloading).rejects.toThrow('Stopped.');
    });

    it('goes on where the browser will not promise to keep it, or cannot be asked', async () => {
      const persist = jest.fn(() => Promise.reject(new Error('Refused.')));
      Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist } });
      try {
        await expect(download({}).downloading).resolves.toBeUndefined();
        expect(persist).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
      }
      await expect(download({}).downloading).resolves.toBeUndefined();
    });
  });

  it('is proven to run by loading it once from the phone, and is then let go', async () => {
    const { runtime, phone } = runtimeOn();

    await expect(createWebLlmModel(runtime).testLoad(MODEL_ID)).resolves.toBe(true);

    expect(phone.loads).toEqual([MODEL_ID]);
    expect(phone.released).toBe(1);
  });

  it('did not work on this phone when it fails to initialise', async () => {
    const { runtime, phone } = runtimeOn({ loadFails: new Error('The WebGPU device was lost.') });

    await expect(createWebLlmModel(runtime).testLoad(MODEL_ID)).resolves.toBe(false);

    expect(phone.loads).toEqual([MODEL_ID]);
  });

  it('did not work when it is not on the phone, and is not fetched to find out', async () => {
    const { runtime, phone } = runtimeOn({ onPhone: false });

    await expect(createWebLlmModel(runtime).testLoad(MODEL_ID)).resolves.toBe(false);

    expect(phone.loads).toEqual([]);
  });

  it('is deleted, and looked for, by the runtime that keeps it', async () => {
    const { runtime, phone } = runtimeOn();
    const model = createWebLlmModel(runtime);

    await expect(model.has(MODEL_ID)).resolves.toBe(true);
    await model.remove(MODEL_ID);

    expect(phone.removed).toEqual([MODEL_ID]);
    await expect(model.has(MODEL_ID)).resolves.toBe(false);
  });

  it('reads a Ramble with the model kept on the phone', async () => {
    const { runtime } = runtimeOn({ reply: '{"restMinutes": 45}' });

    await expect(
      createWebLlmModel(runtime).createExtractor(MODEL_ID).extract('postSmoke', TRANSCRIPT, context)
    ).resolves.toEqual({ restMinutes: 45 });
  });
});
