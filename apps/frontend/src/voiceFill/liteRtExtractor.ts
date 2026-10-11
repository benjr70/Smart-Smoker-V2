/**
 * The extractor port over LiteRT-LM: one constrained tool call per Ramble.
 *
 * LiteRT-LM constrains what a model writes only where it is calling a tool, so
 * the screen's fields are declared as the parameters of one tool and the
 * arguments the model calls it with are the raw object. The Notes text is one
 * of those arguments: the Ramble is answered by a single call to the model.
 *
 * The runtime itself is behind {@link LiteRtRuntime}, which says only as much
 * of it as is used here. Nothing in this module imports it, so all of this is
 * run in tests against a runtime that runs no model.
 */
import { extractionRequestFor } from './extractionRequest';
import type { VoiceFillToolSchema } from './fieldDefinition';
import type { ModelPartStore, PartedFile } from './modelParts';
import { fetchInParts, wholeFile } from './modelParts';
import type { ExtractorPort } from './ports';

/** What a conversation is opened with: what the model is told, and its one tool. */
export interface LiteRtConversationConfig {
  preface: {
    messages: { role: 'system'; content: string }[];
    tools: { type: 'function'; function: VoiceFillToolSchema }[];
  };
  /** Holds what the model writes for a tool call to the tool's parameters. */
  enableConstrainedDecoding: true;
}

export interface LiteRtConversation {
  /** Sends one message and gives the model's whole reply to it. */
  sendMessage(message: string): Promise<unknown>;
  delete(): Promise<void>;
}

/** A model, loaded. */
export interface LiteRtEngine {
  createConversation(config: LiteRtConversationConfig): Promise<LiteRtConversation>;
  /** Lets the model go, and the memory it holds with it. */
  delete(): Promise<void>;
}

/** As much of LiteRT-LM as the extractor drives. */
export interface LiteRtRuntime {
  /**
   * Fetches the runtime's own code, where the page does not hold it yet.
   * Rejects where it cannot be reached; the next call tries again.
   */
  fetchRuntime(): Promise<void>;
  /** Loads the model whose file is `model`. */
  createEngine(model: Blob): Promise<LiteRtEngine>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The arguments `reply` calls the tool `name` with.
 *
 * Throws unless the reply is exactly that: one call, of that tool, with an
 * object for its arguments. A reply that is anything else — plain text, a call
 * to something else, two calls, arguments that are not an object — is a model
 * that did not do what it was asked, and nothing of it is used.
 */
export const toolCallArguments = (reply: unknown, name: string): Record<string, unknown> => {
  const calls = isRecord(reply) ? reply.tool_calls : undefined;
  if (!Array.isArray(calls) || calls.length !== 1) {
    throw new Error(`The model did not answer with one call to ${name}.`);
  }
  const called: unknown = isRecord(calls[0]) ? calls[0].function : undefined;
  if (!isRecord(called) || called.name !== name) {
    throw new Error(`The model did not call ${name}.`);
  }
  if (!isRecord(called.arguments)) {
    throw new Error(`The model called ${name} with arguments that are not an object.`);
  }
  return called.arguments;
};

/**
 * An extractor that reads a Ramble with the model `runtime` loads from what
 * `file` gives: nothing where the model's file is not on the phone.
 */
export const createLiteRtExtractor = (
  runtime: LiteRtRuntime,
  file: () => Promise<Blob | undefined>
): ExtractorPort => {
  // The model as it is loading or loaded; nothing once it has been let go.
  let loaded: Promise<LiteRtEngine> | undefined;
  const engine = (): Promise<LiteRtEngine> => {
    if (!loaded) {
      const loading = file().then(onPhone => {
        if (!onPhone) {
          throw new Error('The extraction model is not downloaded.');
        }
        return runtime.createEngine(onPhone);
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
      const { system, user, tool } = extractionRequestFor(screen, transcript, context);
      const model = await engine();
      const conversation = await model.createConversation({
        preface: {
          messages: [{ role: 'system', content: system }],
          tools: [{ type: 'function', function: tool }],
        },
        enableConstrainedDecoding: true,
      });
      try {
        // The one call to the model this Ramble gets: a reply that is not the
        // tool call is a failure, and is not asked for again another way.
        return toolCallArguments(await conversation.sendMessage(user), tool.name);
      } finally {
        // A conversation holds the model's memory of the Ramble; none is kept.
        await conversation.delete().catch(() => undefined);
      }
    },
    unload: async () => {
      const loading = loaded;
      loaded = undefined;
      // One that never loaded holds nothing to let go of.
      const held = await loading?.catch(() => undefined);
      await held?.delete();
    },
  };
};

/** Everything that is done with a model LiteRT-LM runs, over one runtime. */
export interface LiteRtModel {
  /**
   * Fetches what the phone does not yet hold of `file` into `store`. LiteRT-LM
   * keeps nothing of a model it is given, so the adapter keeps it; and the
   * browser is asked to keep what is downloaded, since without that it may
   * evict the model whenever the phone runs short of storage.
   *
   * The runtime's own code is fetched with it, and a model whose runtime could
   * not be reached has not arrived: the download breaks and is tried again,
   * with the file kept. That leaves the test-load nothing to fetch, so a phone
   * that drops offline as the file completes is not told the model does not
   * run on it.
   */
  download(
    file: PartedFile,
    store: ModelPartStore,
    options: { onProgress: (receivedBytes: number) => void; signal: AbortSignal }
  ): Promise<void>;
  /** Loads the model once from `store` and lets it go: whether it runs on this phone. */
  testLoad(file: PartedFile, store: ModelPartStore): Promise<boolean>;
  /** The extractor that reads with the model kept in `store`. */
  createExtractor(file: PartedFile, store: ModelPartStore): ExtractorPort;
}

export const createLiteRtModel = (runtime: LiteRtRuntime): LiteRtModel => {
  const createExtractor: LiteRtModel['createExtractor'] = (file, store) =>
    createLiteRtExtractor(runtime, () => wholeFile(file, store));
  return {
    download: (file, store, options) => {
      navigator.storage?.persist?.().catch(() => undefined);
      return fetchInParts(file, { store, ...options }).then(() => runtime.fetchRuntime());
    },
    testLoad: async (file, store) => {
      const extractor = createExtractor(file, store);
      try {
        await extractor.load();
        return true;
      } catch {
        return false;
      } finally {
        await extractor.unload().catch(() => undefined);
      }
    },
    createExtractor,
  };
};
