/**
 * The Transformers.js adapter: a model behind the speech port or the extractor
 * port, run by Transformers.js on the phone's GPU.
 *
 * Everything that touches the runtime is here and nowhere else, and this
 * module is only ever imported lazily (see `transformersModels.ts`), so the
 * runtime stays out of the main bundle. What is done around the runtime — the
 * download, the recording that is transcribed when the cook is done, the one
 * JSON answer a Ramble is read by — is in `transformersFiles.ts`,
 * `transformersSpeech.ts` and `transformersExtractor.ts`, which are tested
 * against stand-ins that run no model.
 *
 * This module has no unit test: it needs the real models, and a WebGPU adapter
 * to run them on. It is proven on a real phone.
 */
import type { ModelOptions } from '@huggingface/transformers';
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  ModelRegistry,
  env,
  pipeline,
} from '@huggingface/transformers';
import { StructuredOutputProcessor } from '@huggingface/transformers-structured-output';
import type { ModelPartStore } from './modelParts';
import type { ExtractorPort, SpeechPort } from './ports';
import type { JsonGenerator } from './transformersExtractor';
import { createJsonExtractor } from './transformersExtractor';
import type { HubFile } from './transformersFiles';
import { downloadHubFiles, hasHubFiles, hubFileUrl, keptHubFile } from './transformersFiles';
import type { TransformersModel } from './transformersModels';
import type { BatchTranscriber, Recorder } from './transformersSpeech';
import { createBatchSpeech } from './transformersSpeech';

/** Every model here runs on the GPU: the capability check has found one. */
const DEVICE = 'webgpu';

/** The rate the speech models hear at, in samples a second. */
const SAMPLE_RATE = 16_000;

/** How many samples the microphone hands over at a time: a quarter of a second. */
const CAPTURE_SAMPLES = 4096;

/**
 * The most tokens an answer may be: every field of the longest screen, and
 * Notes of the hundred and fifty words they are summarised to.
 */
const MAX_NEW_TOKENS = 768;

/** What the runtime calls the job each role's models do. */
const TASK = { speech: 'automatic-speech-recognition', extractor: 'text-generation' } as const;

/** The stores of every model this page has asked anything of. */
const stores = new Set<ModelPartStore>();

// The runtime keeps what it fetches in a cache, and reads a model from there
// before it asks the network. It is given the Model library's own: what was
// downloaded through the library is what a model is loaded from, and the
// runtime keeps nothing beside it.
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  match: async request => {
    const kept = await keptHubFile(Array.from(stores), request);
    return kept
      ? new Response(kept, { headers: { 'Content-Length': String(kept.size) } })
      : undefined;
  },
  put: () => Promise.resolve(),
};

/** What the runtime is told of a model whenever it is asked anything of it. */
const asked = ({ dtype }: TransformersModel): ModelOptions => ({ device: DEVICE, dtype });

/**
 * The model's files as its runtime lists them, each with the size its
 * repository hosts it at. The list is the runtime's to give, so which files a
 * model is made of is never written down a second time here.
 */
const publishedFiles = async (model: TransformersModel): Promise<HubFile[]> => {
  const names = await ModelRegistry.get_pipeline_files(
    TASK[model.model.role],
    model.repo,
    asked(model)
  );
  const listed = await Promise.all(
    names.map(async (name): Promise<HubFile | undefined> => {
      const hosted = await ModelRegistry.get_file_metadata(model.repo, name);
      // A file the runtime would take but the repository has none of is one
      // the model does without.
      if (!hosted.exists) {
        return undefined;
      }
      if (hosted.size === undefined) {
        throw new Error(`Hugging Face gives no size for ${name}.`);
      }
      return { name, url: hubFileUrl(model.repo, name), size: hosted.size };
    })
  );
  const files = listed.filter((file): file is HubFile => file !== undefined);
  if (files.length === 0) {
    throw new Error(`Transformers.js lists no files for ${model.repo}.`);
  }
  return files;
};

/**
 * Fetches what the phone does not yet hold of the model from Hugging Face. The
 * browser is asked to keep what is downloaded: without that it may evict the
 * model whenever the phone runs short of storage.
 */
export const download = async (
  model: TransformersModel,
  store: ModelPartStore,
  options: { onProgress: (receivedBytes: number) => void; signal: AbortSignal }
): Promise<void> => {
  stores.add(store);
  navigator.storage?.persist?.().catch(() => undefined);
  await downloadHubFiles(await publishedFiles(model), { store, ...options });
};

/**
 * Makes sure the model is on the phone before the runtime is asked for it. The
 * runtime fetches what its cache does not hold, so a model that was never
 * downloaded would otherwise be run straight off the network, kept nowhere.
 */
const onPhone = async (model: TransformersModel, store: ModelPartStore): Promise<void> => {
  stores.add(store);
  if (!(await hasHubFiles(store))) {
    throw new Error(`${model.model.name} is not downloaded.`);
  }
};

const loadTranscriber = async (
  model: TransformersModel,
  store: ModelPartStore
): Promise<BatchTranscriber> => {
  await onPhone(model, store);
  const heard = await pipeline(TASK.speech, model.repo, asked(model));
  return {
    transcribe: async audio =>
      (await heard(audio, model.chunked ? { chunk_length_s: 30, stride_length_s: 5 } : {})).text,
    dispose: () => heard.dispose().then(() => undefined),
  };
};

/** The microphone, recorded at the rate the models hear at. */
const recorder: Recorder = {
  open: async () => {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true },
    });
    try {
      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      await context.resume();
      const source = context.createMediaStreamSource(media);
      const node = context.createScriptProcessor(CAPTURE_SAMPLES, 1, 1);
      const heard: Float32Array[] = [];
      node.onaudioprocess = event => {
        // The buffer is the browser's to reuse: what is kept is a copy.
        heard.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      node.connect(context.destination);
      return {
        stop: () => {
          node.onaudioprocess = null;
          node.disconnect();
          source.disconnect();
          media.getTracks().forEach(track => track.stop());
          context.close().catch(() => undefined);
          const audio = new Float32Array(heard.reduce((length, part) => length + part.length, 0));
          let offset = 0;
          heard.forEach(part => {
            audio.set(part, offset);
            offset += part.length;
          });
          return audio;
        },
      };
    } catch (error) {
      media.getTracks().forEach(track => track.stop());
      throw error;
    }
  },
};

const loadGenerator = async (
  model: TransformersModel,
  store: ModelPartStore
): Promise<JsonGenerator> => {
  await onPhone(model, store);
  const tokenizer = await AutoTokenizer.from_pretrained(model.repo);
  const network = await AutoModelForCausalLM.from_pretrained(model.repo, asked(model));
  return {
    generate: async ({ system, user, schema }) => {
      const inputs = tokenizer.apply_chat_template(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // The answer is the JSON object alone: a model that can think aloud
        // first is asked not to.
        { add_generation_prompt: true, return_dict: true, enable_thinking: false }
      );
      const askedTokens = inputs.input_ids.dims[1];
      const written = await network.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        do_sample: false,
        // What holds every token the model writes to the screen's schema.
        logits_processor: new StructuredOutputProcessor(tokenizer, {
          type: 'json_schema',
          json_schema: schema,
        }),
      });
      // What the model wrote comes back after what it was asked.
      const answer = written.slice(null, [askedTokens, null]);
      return tokenizer.batch_decode(answer, { skip_special_tokens: true })[0];
    },
    dispose: () => network.dispose().then(() => undefined),
  };
};

/** Loads the downloaded model once and lets it go: whether it runs on this phone. */
export const testLoad = async (
  model: TransformersModel,
  store: ModelPartStore
): Promise<boolean> => {
  try {
    const loaded = await (model.model.role === 'speech'
      ? loadTranscriber(model, store)
      : loadGenerator(model, store));
    await loaded.dispose().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
};

/** The speech port that hears with the model kept in `store`. */
export const createSpeech = (model: TransformersModel, store: ModelPartStore): SpeechPort =>
  createBatchSpeech(recorder, () => loadTranscriber(model, store));

/** The extractor port that reads with the model kept in `store`. */
export const createExtractor = (model: TransformersModel, store: ModelPartStore): ExtractorPort =>
  createJsonExtractor(() => loadGenerator(model, store));
