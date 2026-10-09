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
 * The models the application offers: the adapter Slices add theirs here, the
 * default pair's first so that it is the pair a fresh phone gets. There is no
 * extraction model yet, and until there is one no screen offers Voice Fill.
 */
export const REGISTERED_MODELS: readonly VoiceFillModel[] = [MOONSHINE_SMALL_STREAMING];

/** `158 MB`, `1.9 GB`: a model's size, or how much of it has arrived. */
export const formatBytes = (bytes: number): string => {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${Math.round(megabytes)} MB`;
};
