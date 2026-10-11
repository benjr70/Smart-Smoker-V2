/**
 * The models WebLLM runs, as much of them as the application carries from the
 * start: what WebLLM itself calls each, and the downloaders and the extractor
 * ports that reach for the rest only when asked.
 *
 * The rest — the adapter and the WebLLM runtime it drives — is in a chunk of
 * its own, fetched only for a model of WebLLM's that was picked: by its
 * download or its test-load, by the first Ramble read with it, and — since it
 * is WebLLM that keeps a model's files — by asking whether the model is still
 * on the phone, or removing it. A phone that never picked one fetches nothing.
 */
import type { ModelDownloader } from './modelLibrary';
import { createLazyExtractor } from './modelPorts';
import { QWEN3_1_7B, QWEN3_5_0_8B, QWEN3_5_2B } from './modelRegistry';
import type { ExtractorPort } from './ports';

/**
 * What WebLLM calls each of its models, by what the Model library records it
 * under: the builds WebLLM lists itself, so it knows where each one's files
 * and compiled code are hosted.
 */
export const WEB_LLM_MODEL_IDS: Readonly<Record<string, string>> = {
  [QWEN3_1_7B.id]: 'Qwen3-1.7B-q4f16_1-MLC',
  [QWEN3_5_2B.id]: 'Qwen3.5-2B-q4f16_1-MLC',
  [QWEN3_5_0_8B.id]: 'Qwen3.5-0.8B-q4f16_1-MLC',
};

type WebLlmAdapter = Pick<
  typeof import('./webLlmAdapter'),
  'download' | 'testLoad' | 'has' | 'remove' | 'createExtractor'
>;

const importAdapter = (): Promise<WebLlmAdapter> =>
  import(/* webpackChunkName: "voice-fill-webllm" */ './webLlmAdapter');

export interface WebLlmOptions {
  /** Fetches the adapter's chunk. */
  adapter?: () => Promise<WebLlmAdapter>;
}

/**
 * For each of WebLLM's models, what has WebLLM fetch it, proves it loads, and
 * says whether it is still on the phone.
 *
 * Whether it is still there is WebLLM's to say. Where WebLLM cannot be reached
 * to be asked — the phone is offline — nothing is answered, and the model's
 * status stays as it was; where it cannot read what it keeps, the model is not
 * there.
 */
export const createWebLlmDownloaders = ({ adapter = importAdapter }: WebLlmOptions = {}): Record<
  string,
  ModelDownloader
> =>
  Object.fromEntries(
    Object.entries(WEB_LLM_MODEL_IDS).map(([id, modelId]): [string, ModelDownloader] => [
      id,
      {
        download: (model, options) =>
          adapter().then(webLlm => webLlm.download(modelId, model.sizeBytes, options)),
        testLoad: () => adapter().then(webLlm => webLlm.testLoad(modelId)),
        has: () => adapter().then(webLlm => webLlm.has(modelId).catch(() => false)),
        remove: () => adapter().then(webLlm => webLlm.remove(modelId)),
      },
    ])
  );

/** For each of WebLLM's models, the extractor port it reads a Ramble through. */
export const createWebLlmExtractors = ({ adapter = importAdapter }: WebLlmOptions = {}): Record<
  string,
  ExtractorPort
> =>
  Object.fromEntries(
    Object.entries(WEB_LLM_MODEL_IDS).map(([id, modelId]): [string, ExtractorPort] => [
      id,
      createLazyExtractor(() => adapter().then(webLlm => webLlm.createExtractor(modelId))),
    ])
  );
