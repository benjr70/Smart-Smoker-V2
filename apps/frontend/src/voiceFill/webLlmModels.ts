/**
 * The models WebLLM runs, as much of them as the application carries from the
 * start: what WebLLM itself calls each, and the downloaders and the extractor
 * ports that reach for the rest only when asked.
 *
 * The rest — the adapter and the WebLLM runtime it drives — is in a chunk of
 * its own, fetched only for a model of WebLLM's that is picked: by its
 * download or its test-load, by the first Ramble read with it, and — since it
 * is WebLLM that keeps a model's files — by asking whether the picked model is
 * still on the phone. A phone whose picked model is not one of WebLLM's
 * fetches nothing, whatever it downloaded before: only removing a model of
 * WebLLM's reaches for the chunk then, to have WebLLM delete it.
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

export interface WebLlmDownloaderOptions extends WebLlmOptions {
  /**
   * Whether the model the Model library records under `id` is the picked
   * extraction model. Where nothing says, every model is taken as picked.
   */
  isPicked?: (id: string) => boolean;
}

/**
 * For each of WebLLM's models, what has WebLLM fetch it, proves it loads, and
 * says whether it is still on the phone.
 *
 * Whether it is still there is WebLLM's to say, and WebLLM is not fetched to
 * say it of a model that is not picked: nothing is answered, and the model's
 * status stays as it was until it is picked and asked after again. Nothing is
 * answered either where WebLLM cannot be reached to be asked — the phone is
 * offline; where it cannot read what it keeps, the model is not there.
 */
export const createWebLlmDownloaders = ({
  adapter = importAdapter,
  isPicked = () => true,
}: WebLlmDownloaderOptions = {}): Record<string, ModelDownloader> =>
  Object.fromEntries(
    Object.entries(WEB_LLM_MODEL_IDS).map(([id, modelId]): [string, ModelDownloader] => [
      id,
      {
        download: (model, options) =>
          adapter().then(webLlm => webLlm.download(modelId, model.sizeBytes, options)),
        testLoad: () => adapter().then(webLlm => webLlm.testLoad(modelId)),
        has: () =>
          isPicked(id)
            ? adapter().then(webLlm => webLlm.has(modelId).catch(() => false))
            : Promise.reject(new Error('WebLLM is not fetched for a model that is not picked.')),
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
