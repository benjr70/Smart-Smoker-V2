import { extractionRequestFor } from './extractionRequest';
import type { LiteRtConversationConfig, LiteRtRuntime } from './liteRtExtractor';
import { createLiteRtExtractor, createLiteRtModel } from './liteRtExtractor';
import type { ModelPartStore } from './modelParts';

const TRANSCRIPT = 'Sixteen pound brisket.';
const context = { now: new Date(2026, 9, 3, 15, 5) };
const MODEL = new Blob(['the model']);

/** A reply that calls `name` with `args`, as LiteRT-LM gives one. */
const calling = (name: string, args: unknown) => ({
  role: 'assistant',
  tool_calls: [{ type: 'function', function: { name, arguments: args } }],
});

/**
 * A runtime that runs no model: every conversation answers with `reply`, and
 * everything asked of it is kept to be looked at.
 */
const runtimeAnswering = (reply: unknown) => {
  const asked = {
    engines: [] as Blob[],
    conversations: [] as LiteRtConversationConfig[],
    messages: [] as string[],
    conversationsEnded: 0,
    enginesReleased: 0,
  };
  const runtime: LiteRtRuntime = {
    createEngine: model => {
      asked.engines.push(model);
      return Promise.resolve({
        createConversation: config => {
          asked.conversations.push(config);
          return Promise.resolve({
            sendMessage: message => {
              asked.messages.push(message);
              return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
            },
            delete: () => {
              asked.conversationsEnded += 1;
              return Promise.resolve();
            },
          });
        },
        delete: () => {
          asked.enginesReleased += 1;
          return Promise.resolve();
        },
      });
    },
  };
  return { runtime, asked };
};

const extractorAnswering = (reply: unknown) => {
  const { runtime, asked } = runtimeAnswering(reply);
  return { extractor: createLiteRtExtractor(runtime, () => Promise.resolve(MODEL)), asked };
};

describe('the LiteRT-LM extractor', () => {
  it('gives the arguments of the screen’s tool call as the raw object', async () => {
    const raw = { meatType: 'brisket', weight: 16, notes: 'Bark is setting.' };
    const { extractor } = extractorAnswering(calling('fill_pre_smoke', raw));

    await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).resolves.toEqual(raw);
  });

  it('asks the model once for a Ramble, with the screen’s request and its one tool', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_smoke', {}));
    const request = extractionRequestFor('smoke', TRANSCRIPT, context);

    await extractor.extract('smoke', TRANSCRIPT, context);

    expect(asked.messages).toEqual([request.user]);
    expect(asked.conversations).toEqual([
      {
        preface: {
          messages: [{ role: 'system', content: request.system }],
          tools: [{ type: 'function', function: request.tool }],
        },
        enableConstrainedDecoding: true,
      },
    ]);
  });

  describe('given a reply that is not one call of the screen’s tool', () => {
    const malformed: [string, unknown][] = [
      ['plain text and no tool call', { role: 'assistant', content: '{"meatType":"brisket"}' }],
      ['an empty list of tool calls', { role: 'assistant', tool_calls: [] }],
      ['nothing at all', undefined],
      ['a call to another tool', calling('fill_smoke', { woodType: 'hickory' })],
      ['a call with no function', { tool_calls: [{ type: 'function' }] }],
      ['arguments that are text', calling('fill_pre_smoke', '{"meatType":"brisket"}')],
      ['arguments that are a list', calling('fill_pre_smoke', ['brisket'])],
      ['no arguments', calling('fill_pre_smoke', undefined)],
      [
        'two calls',
        {
          tool_calls: [
            { type: 'function', function: { name: 'fill_pre_smoke', arguments: { weight: 16 } } },
            { type: 'function', function: { name: 'fill_pre_smoke', arguments: { weight: 12 } } },
          ],
        },
      ],
    ];

    it.each(malformed)('fails on %s, and gives nothing of it', async (_what, reply) => {
      const { extractor, asked } = extractorAnswering(reply);

      await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).rejects.toThrow(
        /fill_pre_smoke/
      );
      // It is not asked a second time, another way: one model call per Ramble.
      expect(asked.messages).toHaveLength(1);
    });
  });

  it('fails when the model does', async () => {
    const { extractor } = extractorAnswering(new Error('Invalid token at state 201'));

    await expect(extractor.extract('preSmoke', TRANSCRIPT, context)).rejects.toThrow(
      'Invalid token at state 201'
    );
  });

  it('ends each conversation once it has answered, or failed to', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_pre_smoke', {}));
    await extractor.extract('preSmoke', TRANSCRIPT, context);
    expect(asked.conversationsEnded).toBe(1);

    await expect(extractor.extract('smoke', TRANSCRIPT, context)).rejects.toThrow();
    expect(asked.conversationsEnded).toBe(2);
  });

  it('loads the model once, however often it is asked to load or to extract', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_pre_smoke', {}));

    await Promise.all([extractor.load(), extractor.load()]);
    await extractor.extract('preSmoke', TRANSCRIPT, context);
    await extractor.extract('preSmoke', TRANSCRIPT, context);

    // Counted, not compared: the file is a Blob, and one is never worth printing.
    expect(asked.engines).toHaveLength(1);
    expect(asked.engines[0] === MODEL).toBe(true);
  });

  it('cannot load a model that is not on the phone, and can once it is', async () => {
    const { runtime, asked } = runtimeAnswering(calling('fill_pre_smoke', {}));
    let onPhone: Blob | undefined;
    const extractor = createLiteRtExtractor(runtime, () => Promise.resolve(onPhone));

    await expect(extractor.load()).rejects.toThrow('not downloaded');
    expect(asked.engines).toHaveLength(0);

    onPhone = MODEL;
    await expect(extractor.load()).resolves.toBeUndefined();
  });

  it('lets the model go when unloaded, and loads it again when next asked', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_pre_smoke', {}));
    await extractor.load();

    await extractor.unload();
    expect(asked.enginesReleased).toBe(1);

    await extractor.extract('preSmoke', TRANSCRIPT, context);
    expect(asked.engines).toHaveLength(2);
  });

  it('has nothing to let go of when it was never loaded', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_pre_smoke', {}));

    await extractor.unload();
    await extractor.unload();

    expect(asked.enginesReleased).toBe(0);
  });

  it('lets go of a model that was still loading when it was unloaded', async () => {
    const { extractor, asked } = extractorAnswering(calling('fill_pre_smoke', {}));

    const loading = extractor.load();
    await extractor.unload();
    await loading;

    expect(asked.enginesReleased).toBe(1);
  });
});

describe('a model run by LiteRT-LM', () => {
  const FILE = { url: 'https://models.example/model.litertlm', size: MODEL.size };

  /** A store holding the whole of the model as its one part, or nothing. */
  const storeHolding = (held: Blob | undefined) => {
    const put = jest.fn((_key: string, _body: ReadableStream<Uint8Array>) => Promise.resolve());
    const store: ModelPartStore = {
      has: () => Promise.resolve(held !== undefined),
      put,
      get: () => Promise.resolve(held),
      delete: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    return { store, put };
  };

  // jsdom's Blob cannot be made of Blobs; the file is given back as it was kept.
  const jsdomBlob = global.Blob;
  beforeAll(() => {
    global.Blob = class {
      constructor(parts: Blob[]) {
        return parts[0];
      }
    } as unknown as typeof Blob;
  });
  afterAll(() => {
    global.Blob = jsdomBlob;
  });

  it('is proven to run by loading it once from the phone, and is then let go', async () => {
    const { runtime, asked } = runtimeAnswering(undefined);
    const { store } = storeHolding(MODEL);

    await expect(createLiteRtModel(runtime).testLoad(FILE, store)).resolves.toBe(true);

    expect(asked.engines).toHaveLength(1);
    expect(asked.engines[0] === MODEL).toBe(true);
    expect(asked.enginesReleased).toBe(1);
  });

  it('did not work on this phone when the runtime cannot load it', async () => {
    const runtime: LiteRtRuntime = {
      createEngine: () => Promise.reject(new Error('No WebGPU adapter')),
    };

    await expect(
      createLiteRtModel(runtime).testLoad(FILE, storeHolding(MODEL).store)
    ).resolves.toBe(false);
  });

  it('did not work when its file is not on the phone', async () => {
    const { runtime } = runtimeAnswering(undefined);

    await expect(
      createLiteRtModel(runtime).testLoad(FILE, storeHolding(undefined).store)
    ).resolves.toBe(false);
  });

  it('reads a Ramble with the file kept on the phone', async () => {
    const { runtime, asked } = runtimeAnswering(calling('fill_post_smoke', { restMinutes: 45 }));
    const extractor = createLiteRtModel(runtime).createExtractor(FILE, storeHolding(MODEL).store);

    await expect(extractor.extract('postSmoke', 'Rested 45 minutes.', context)).resolves.toEqual({
      restMinutes: 45,
    });
    expect(asked.engines[0] === MODEL).toBe(true);
  });

  describe('downloaded', () => {
    const browser = navigator as unknown as { storage?: unknown };
    const persist = jest.fn<Promise<boolean>, []>();
    beforeEach(() => {
      persist.mockResolvedValue(true);
      browser.storage = { persist };
    });
    afterEach(() => {
      delete browser.storage;
    });

    it('is kept by the adapter, which asks the browser not to evict it', async () => {
      const { runtime } = runtimeAnswering(undefined);
      const { store, put } = storeHolding(MODEL);
      const onProgress = jest.fn();

      // Every part is on the phone already, so nothing is fetched.
      await createLiteRtModel(runtime).download(FILE, store, {
        onProgress,
        signal: new AbortController().signal,
      });

      expect(persist).toHaveBeenCalledTimes(1);
      expect(put).not.toHaveBeenCalled();
      expect(onProgress).toHaveBeenLastCalledWith(FILE.size);
    });

    it('goes on where the browser will not promise to keep it, or cannot be asked', async () => {
      const { runtime } = runtimeAnswering(undefined);
      const { store } = storeHolding(MODEL);
      const options = { onProgress: jest.fn(), signal: new AbortController().signal };

      persist.mockRejectedValueOnce(new Error('denied'));
      await expect(
        createLiteRtModel(runtime).download(FILE, store, options)
      ).resolves.toBeUndefined();

      delete browser.storage;
      await expect(
        createLiteRtModel(runtime).download(FILE, store, options)
      ).resolves.toBeUndefined();
    });
  });
});
