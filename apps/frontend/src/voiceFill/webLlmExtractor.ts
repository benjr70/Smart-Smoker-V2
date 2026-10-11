/**
 * The extractor port over WebLLM: one answer per Ramble, held to a JSON Schema.
 *
 * WebLLM holds what a model writes to a JSON Schema it is handed, so the
 * screen's fields are that schema and the object the model writes is the raw
 * object. The Notes text is one of its keys: the Ramble is answered by a single
 * call to the model.
 *
 * WebLLM fetches and keeps a model's files itself, and does so only as it loads
 * the model onto the GPU: it has no download that stops short of loading. So a
 * download here is a load that is let go of, and a load that fails is told
 * apart by what it left behind — see {@link createWebLlmModel}.
 *
 * The runtime itself is behind {@link WebLlmRuntime}, which says only as much
 * of it as is used here. Nothing in this module imports it, so all of this is
 * run in tests against a runtime that runs no model.
 */
import { jsonExtractionRequestFor } from './extractionRequest';
import type { ExtractorPort } from './ports';

/** What the model is asked once for a Ramble, and what its answer is held to. */
export interface WebLlmRequest {
  messages: [{ role: 'system'; content: string }, { role: 'user'; content: string }];
  /** Holds what the model writes to `schema`: a JSON Schema, written out. */
  response_format: { type: 'json_object'; schema: string };
}

/** A model, loaded. */
export interface WebLlmEngine {
  /** Asks the model once and gives the whole text of its answer. */
  complete(request: WebLlmRequest): Promise<string>;
  /** Lets the model go, and the memory it holds with it. */
  unload(): Promise<void>;
}

/** As much of WebLLM as the extractor drives. `modelId` is WebLLM's own name for a model. */
export interface WebLlmRuntime {
  /**
   * Fetches what the phone does not yet hold of the model, keeps it, and loads
   * the model onto the GPU. `onProgress` is told how much of the model is on
   * the phone, from 0 to 1. Rejects when `signal` stops it, with
   * {@link CannotRunHereError} where the phone cannot run the model whatever
   * it downloads, and with anything else where the load broke.
   */
  createEngine(
    modelId: string,
    options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal }
  ): Promise<WebLlmEngine>;
  /** Whether the whole of the model is on the phone. */
  has(modelId: string): Promise<boolean>;
  /** Deletes whatever the phone holds of the model. */
  remove(modelId: string): Promise<void>;
}

/**
 * The phone cannot run the model, and no download changes that: its GPU is
 * missing something the model needs. Not a download that broke, which the next
 * try may get past.
 */
export class CannotRunHereError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotRunHereError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The object `reply` is the JSON of.
 *
 * Throws unless the reply is exactly that. A reply that is anything else —
 * plain text, JSON cut short, a list — is a model that did not do what it was
 * asked, and nothing of it is used.
 */
export const jsonObject = (reply: string): Record<string, unknown> => {
  let answered: unknown;
  try {
    answered = JSON.parse(reply);
  } catch {
    throw new Error('The model did not answer in JSON.');
  }
  if (!isRecord(answered)) {
    throw new Error('The model did not answer with one JSON object.');
  }
  return answered;
};

/**
 * An extractor that reads a Ramble with the model `runtime` knows as
 * `modelId`, once the whole of that model is on the phone.
 */
export const createWebLlmExtractor = (runtime: WebLlmRuntime, modelId: string): ExtractorPort => {
  // The model as it is loading or loaded; nothing once it has been let go.
  let loaded: Promise<WebLlmEngine> | undefined;
  const engine = (): Promise<WebLlmEngine> => {
    if (!loaded) {
      // WebLLM fetches what it does not find. A Ramble is never what starts a
      // download: that is the Model library's to start, and to show.
      const loading = runtime.has(modelId).then(onPhone => {
        if (!onPhone) {
          throw new Error('The extraction model is not downloaded.');
        }
        return runtime.createEngine(modelId);
      });
      loaded = loading;
      // A load that failed is tried again by the next thing that asks.
      loading.catch(() => {
        if (loaded === loading) {
          loaded = undefined;
        }
      });
    }
    return loaded;
  };
  return {
    load: () => engine().then(() => undefined),
    extract: async (screen, transcript, context) => {
      const { system, user, schema } = jsonExtractionRequestFor(screen, transcript, context);
      const model = await engine();
      // The one call to the model this Ramble gets: a reply that is not the
      // JSON object is a failure, and is not asked for again another way.
      return jsonObject(
        await model.complete({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object', schema: JSON.stringify(schema) },
        })
      );
    },
    unload: async () => {
      const loading = loaded;
      loaded = undefined;
      // One that never loaded holds nothing to let go of.
      const held = await loading?.catch(() => undefined);
      await held?.unload();
    },
  };
};

/** Everything that is done with a model WebLLM runs, over one runtime. */
export interface WebLlmModel {
  /**
   * Has WebLLM fetch what the phone does not yet hold of the model, and asks
   * the browser to keep it. `sizeBytes` is what the model is listed as, which
   * the progress is told in.
   *
   * WebLLM fetches a model only by loading it, so a model that fails to
   * initialise fails here first. That is not a download that broke, and must
   * not be tried again for ever as one: where the load failed with the whole
   * model on the phone, or on a phone that cannot run it at all, the download
   * is over and the test-load that follows is what says the model did not
   * work. Only a load that failed with the model still part-way is a download
   * to pick up again.
   */
  download(
    modelId: string,
    sizeBytes: number,
    options: { onProgress: (receivedBytes: number) => void; signal: AbortSignal }
  ): Promise<void>;
  /** Loads the model once from the phone and lets it go: whether it runs on this phone. */
  testLoad(modelId: string): Promise<boolean>;
  has(modelId: string): Promise<boolean>;
  remove(modelId: string): Promise<void>;
  /** The extractor that reads with the model kept on the phone. */
  createExtractor(modelId: string): ExtractorPort;
}

export const createWebLlmModel = (runtime: WebLlmRuntime): WebLlmModel => {
  const createExtractor: WebLlmModel['createExtractor'] = modelId =>
    createWebLlmExtractor(runtime, modelId);
  /** Whether a load that failed with `error` left nothing more to download. */
  const downloadIsOver = (error: unknown, modelId: string): Promise<boolean> =>
    error instanceof CannotRunHereError
      ? Promise.resolve(true)
      : runtime.has(modelId).catch(() => false);
  return {
    download: async (modelId, sizeBytes, { onProgress, signal }) => {
      navigator.storage?.persist?.().catch(() => undefined);
      // WebLLM counts what it fetches and then what it loads: only ever forward here.
      let reached = 0;
      let engine: WebLlmEngine;
      try {
        engine = await runtime.createEngine(modelId, {
          signal,
          onProgress: fraction => {
            reached = Math.max(reached, fraction);
            onProgress(Math.round(reached * sizeBytes));
          },
        });
      } catch (error) {
        if (signal.aborted || !(await downloadIsOver(error, modelId))) {
          throw error;
        }
        return;
      }
      await engine.unload().catch(() => undefined);
    },
    testLoad: async modelId => {
      const extractor = createExtractor(modelId);
      try {
        await extractor.load();
        return true;
      } catch {
        return false;
      } finally {
        await extractor.unload().catch(() => undefined);
      }
    },
    has: modelId => runtime.has(modelId),
    remove: modelId => runtime.remove(modelId),
    createExtractor,
  };
};
