/**
 * The models Transformers.js runs, as much of them as the application carries
 * from the start: which repository on Hugging Face each is, where its files
 * are kept on the phone, whether they are still there, and the downloaders
 * and the ports that reach for the rest only when asked.
 *
 * The rest — the adapter and the runtime it drives — is in a chunk of its own,
 * one for all of these models. A download or a test-load of any of them
 * fetches that chunk, and so does the first Ramble with one of them picked;
 * opening the app, asking whether a model is on the phone, or removing it,
 * does not.
 */
import type { ModelDownloader } from './modelLibrary';
import type { ModelPartStore } from './modelParts';
import { createCachePartStore } from './modelParts';
import { createLazyExtractor, createLazySpeech } from './modelPorts';
import type { VoiceFillModel } from './modelRegistry';
import {
  MOONSHINE_BASE,
  QWEN_3_1_7B,
  QWEN_3_5_0_8B,
  QWEN_3_5_2B,
  WHISPER_BASE_EN,
} from './modelRegistry';
import type { ExtractorPort, SpeechPort } from './ports';
import { hasHubFiles } from './transformersFiles';

/** A registered model, as Transformers.js is asked for it. */
export interface TransformersModel {
  model: VoiceFillModel;
  /** The repository on Hugging Face its files are in. */
  repo: string;
  /**
   * How finely its weights are stored: of the whole model, or of each of the
   * files it is made of. It decides which of the repository's files are the
   * model's, and so what the phone downloads.
   */
  dtype: string | Readonly<Record<string, string>>;
  /**
   * A speech model that hears thirty seconds at a time: a longer Ramble is
   * given to it in overlapping pieces.
   */
  chunked?: boolean;
}

export const TRANSFORMERS_MODELS: readonly TransformersModel[] = [
  {
    model: WHISPER_BASE_EN,
    repo: 'onnx-community/whisper-base.en',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    chunked: true,
  },
  { model: MOONSHINE_BASE, repo: 'onnx-community/moonshine-base-ONNX', dtype: 'fp32' },
  { model: QWEN_3_5_2B, repo: 'onnx-community/Qwen3.5-2B-ONNX', dtype: 'q4f16' },
  { model: QWEN_3_1_7B, repo: 'onnx-community/Qwen3-1.7B-ONNX', dtype: 'q4f16' },
  { model: QWEN_3_5_0_8B, repo: 'onnx-community/Qwen3.5-0.8B-ONNX', dtype: 'q4f16' },
];

/**
 * The browser cache a model's files are kept in, a part at a time. Each model
 * has a cache of its own, so removing one deletes nothing of another.
 */
export const transformersCacheOf = ({ model }: TransformersModel): string =>
  `voiceFill.transformers.${model.id}`;

type TransformersAdapter = Pick<
  typeof import('./transformersAdapter'),
  'download' | 'testLoad' | 'createSpeech' | 'createExtractor'
>;

const importAdapter = (): Promise<TransformersAdapter> =>
  import(/* webpackChunkName: "voice-fill-transformers" */ './transformersAdapter');

export interface TransformersOptions {
  /** Where the model's files are kept: the browser's Cache API. */
  store?: ModelPartStore;
  /** Fetches the adapter's chunk. */
  adapter?: () => Promise<TransformersAdapter>;
}

const storeOf = (model: TransformersModel, { store }: TransformersOptions): ModelPartStore =>
  store ?? createCachePartStore(transformersCacheOf(model));

/**
 * Fetches a model's files from Hugging Face into the browser's cache, proves
 * the model loads, and says whether the files are still there.
 */
export const createTransformersDownloader = (
  model: TransformersModel,
  options: TransformersOptions = {}
): ModelDownloader => {
  const store = storeOf(model, options);
  const adapter = options.adapter ?? importAdapter;
  return {
    download: (_model, progress) =>
      adapter().then(transformers => transformers.download(model, store, progress)),
    testLoad: () => adapter().then(transformers => transformers.testLoad(model, store)),
    has: () => hasHubFiles(store).catch(() => false),
    remove: () => store.clear(),
  };
};

/** The speech port a model hears a Ramble through, once its files are on the phone. */
export const createTransformersSpeech = (
  model: TransformersModel,
  options: TransformersOptions = {}
): SpeechPort => {
  const store = storeOf(model, options);
  const adapter = options.adapter ?? importAdapter;
  return createLazySpeech(() =>
    adapter().then(transformers => transformers.createSpeech(model, store))
  );
};

/** The extractor port a model reads a Ramble through, once its files are on the phone. */
export const createTransformersExtractor = (
  model: TransformersModel,
  options: TransformersOptions = {}
): ExtractorPort => {
  const store = storeOf(model, options);
  const adapter = options.adapter ?? importAdapter;
  return createLazyExtractor(() =>
    adapter().then(transformers => transformers.createExtractor(model, store))
  );
};

/** `make` of every Transformers.js model of `role`, under the model's id. */
const ofRole = <Made>(
  role: VoiceFillModel['role'] | undefined,
  make: (model: TransformersModel) => Made
): Record<string, Made> =>
  Object.fromEntries(
    TRANSFORMERS_MODELS.filter(({ model }) => role === undefined || model.role === role).map(
      model => [model.model.id, make(model)]
    )
  );

/** The downloader of every Transformers.js model, under the model's id. */
export const createTransformersDownloaders = (): Record<string, ModelDownloader> =>
  ofRole(undefined, model => createTransformersDownloader(model));

/** The speech port of every Transformers.js speech model, under the model's id. */
export const createTransformersSpeechPorts = (): Record<string, SpeechPort> =>
  ofRole('speech', model => createTransformersSpeech(model));

/** The extractor port of every Transformers.js extraction model, under the model's id. */
export const createTransformersExtractorPorts = (): Record<string, ExtractorPort> =>
  ofRole('extractor', model => createTransformersExtractor(model));
