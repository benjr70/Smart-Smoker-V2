/**
 * The Model registry: every model Voice Fill can be run on, which is what the
 * two dropdowns of its settings card list.
 *
 * A model is listed only once the adapter that runs it exists, so each adapter
 * Slice adds its models to {@link REGISTERED_MODELS} as it lands.
 */

/** Which of the two jobs a model does: hearing a Ramble, or reading one. */
export type ModelRole = 'speech' | 'extractor';

export const MODEL_ROLES: readonly ModelRole[] = ['speech', 'extractor'];

export interface VoiceFillModel {
  /** What the Model library records the model under. Never shown, never reused. */
  id: string;
  role: ModelRole;
  /** What the dropdown calls it. */
  name: string;
  /** How much the phone downloads to have it. Shown, never enforced. */
  sizeBytes: number;
}

/** One model for each role: `null` where no model of that role is registered. */
export type ModelPair = Record<ModelRole, string | null>;

export interface ModelRegistry {
  /** Every registered model, in the order the dropdowns list them. */
  readonly models: readonly VoiceFillModel[];
  /** The registered models of one role, in the order its dropdown lists them. */
  ofRole(role: ModelRole): readonly VoiceFillModel[];
  /** The model registered under `id`, if one is. */
  find(id: string | null): VoiceFillModel | undefined;
  /** The pair a phone that has never picked gets: the first model of each role. */
  readonly defaultPair: ModelPair;
}

export const createModelRegistry = (models: readonly VoiceFillModel[]): ModelRegistry => {
  const ofRole = (role: ModelRole): readonly VoiceFillModel[] =>
    models.filter(model => model.role === role);
  return {
    models,
    ofRole,
    find: id => models.find(model => model.id === id),
    defaultPair: {
      speech: ofRole('speech')[0]?.id ?? null,
      extractor: ofRole('extractor')[0]?.id ?? null,
    },
  };
};

/**
 * Moonshine Small Streaming: the speech model a fresh phone gets. It writes the
 * Ramble out while the cook is still talking, on the CPU through WebAssembly.
 * Its size is the sum of the files its publisher lists for it.
 */
export const MOONSHINE_SMALL_STREAMING: VoiceFillModel = {
  id: 'moonshine-small-streaming',
  role: 'speech',
  name: 'Moonshine Small Streaming',
  sizeBytes: 165_489_086,
};

/**
 * Gemma 4 E2B, run by LiteRT-LM JS on the phone's GPU: the extraction model a
 * fresh phone gets. Its size is that of the one file its publisher hosts.
 */
export const GEMMA_4_E2B: VoiceFillModel = {
  id: 'gemma-4-e2b-litert',
  role: 'extractor',
  name: 'Gemma 4 E2B',
  sizeBytes: 2_008_432_640,
};

/**
 * The models Transformers.js runs, on the phone's GPU: further choices for both
 * dropdowns, through one runtime. Each is several files in a repository on
 * Hugging Face, and its size is the sum of the ones its runtime asks for.
 *
 * The two speech models hear a Ramble all at once: nothing is written while
 * the cook talks, and the whole of it is transcribed when they are done.
 */
export const WHISPER_BASE_EN: VoiceFillModel = {
  id: 'whisper-base-en-transformers',
  role: 'speech',
  name: 'Whisper base.en',
  sizeBytes: 208_760_882,
};

export const MOONSHINE_BASE: VoiceFillModel = {
  id: 'moonshine-base-transformers',
  role: 'speech',
  name: 'Moonshine Base',
  sizeBytes: 250_928_812,
};

export const QWEN_3_5_2B: VoiceFillModel = {
  id: 'qwen3.5-2b-transformers',
  role: 'extractor',
  name: 'Qwen3.5-2B',
  sizeBytes: 1_404_075_458,
};

export const QWEN_3_1_7B: VoiceFillModel = {
  id: 'qwen3-1.7b-transformers',
  role: 'extractor',
  name: 'Qwen3-1.7B',
  sizeBytes: 1_435_197_660,
};

export const QWEN_3_5_0_8B: VoiceFillModel = {
  id: 'qwen3.5-0.8b-transformers',
  role: 'extractor',
  name: 'Qwen3.5-0.8B',
  sizeBytes: 603_944_942,
};

/**
 * The models WebLLM runs on the phone's GPU, each the build its publisher
 * lists for the browser. A size is what WebLLM fetches of the model: its
 * weights, its tokenizer, its configuration and the compiled code that runs it.
 */
export const QWEN3_1_7B: VoiceFillModel = {
  id: 'qwen3-1.7b-webllm',
  role: 'extractor',
  name: 'Qwen3 1.7B (WebLLM)',
  sizeBytes: 985_947_479,
};

export const QWEN3_5_2B: VoiceFillModel = {
  id: 'qwen3.5-2b-webllm',
  role: 'extractor',
  name: 'Qwen3.5 2B (WebLLM)',
  sizeBytes: 1_079_474_163,
};

export const QWEN3_5_0_8B: VoiceFillModel = {
  id: 'qwen3.5-0.8b-webllm',
  role: 'extractor',
  name: 'Qwen3.5 0.8B (WebLLM)',
  sizeBytes: 444_074_373,
};

/**
 * The models the application offers: the adapter Slices add theirs here, the
 * default pair's first so that it is the pair a fresh phone gets. They are what
 * the Model library of every production build lists (see `realModels.ts`).
 * Both models of the default pair are registered: a Ramble is heard by the
 * speech model and read by the extraction model. The models after them are the
 * alternatives a cook can pick instead.
 */
export const REGISTERED_MODELS: readonly VoiceFillModel[] = [
  MOONSHINE_SMALL_STREAMING,
  GEMMA_4_E2B,
  WHISPER_BASE_EN,
  MOONSHINE_BASE,
  QWEN_3_5_2B,
  QWEN_3_1_7B,
  QWEN_3_5_0_8B,
  QWEN3_1_7B,
  QWEN3_5_2B,
  QWEN3_5_0_8B,
];

/** `158 MB`, `1.9 GB`: a model's size, or how much of it has arrived. */
export const formatBytes = (bytes: number): string => {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${Math.round(megabytes)} MB`;
};
