/**
 * As much of Transformers.js as the adapter drives (see
 * `transformersAdapter.ts`), declared here because the package's own
 * declarations are written for a later TypeScript than this application is
 * built with and cannot be read by it. `tsconfig.json` points the compiler at
 * this file for both packages; webpack resolves the packages themselves.
 */

/** A file the runtime's cache is asked for or given, as the Cache API has them. */
export interface RuntimeCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

export const env: {
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  useCustomCache: boolean;
  customCache: RuntimeCache | null;
};

/** Which build of a model is asked for: where it runs, and how its weights are stored. */
export interface ModelOptions {
  device: string;
  dtype: string | Readonly<Record<string, string>>;
}

export const ModelRegistry: {
  /** The files of the repository a pipeline of `task` over `model` is made of. */
  get_pipeline_files(task: string, model: string, options: ModelOptions): Promise<string[]>;
  get_file_metadata(model: string, file: string): Promise<{ exists: boolean; size?: number }>;
};

/** A speech pipeline, loaded. */
export interface SpeechPipeline {
  (
    audio: Float32Array,
    options?: { chunk_length_s?: number; stride_length_s?: number }
  ): Promise<{ text: string }>;
  dispose(): Promise<unknown>;
}

export function pipeline(
  task: 'automatic-speech-recognition',
  model: string,
  options: ModelOptions
): Promise<SpeechPipeline>;

export interface Tensor {
  dims: number[];
  slice(...ranges: (null | [number | null, number | null])[]): Tensor;
}

export interface Tokenizer {
  apply_chat_template(
    messages: { role: 'system' | 'user'; content: string }[],
    options: { add_generation_prompt: true; return_dict: true; enable_thinking: false }
  ): { input_ids: Tensor; attention_mask: Tensor };
  batch_decode(tokens: Tensor, options: { skip_special_tokens: boolean }): string[];
}

export const AutoTokenizer: {
  from_pretrained(model: string): Promise<Tokenizer>;
};

/** What holds the tokens a model writes to a form. */
export class LogitsProcessorList {}

export interface CausalLanguageModel {
  generate(options: {
    input_ids: Tensor;
    attention_mask: Tensor;
    max_new_tokens: number;
    do_sample: boolean;
    logits_processor: LogitsProcessorList;
  }): Promise<Tensor>;
  dispose(): Promise<unknown>;
}

export const AutoModelForCausalLM: {
  from_pretrained(model: string, options: ModelOptions): Promise<CausalLanguageModel>;
};

/** `@huggingface/transformers-structured-output`: holds an answer to a JSON Schema. */
export class StructuredOutputProcessor extends LogitsProcessorList {
  constructor(tokenizer: Tokenizer, format: { type: 'json_schema'; json_schema: object });
}
