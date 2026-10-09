/**
 * The Moonshine adapter: Moonshine Small Streaming behind the speech port,
 * through its WebAssembly binding.
 *
 * Everything that touches the binding is here and nowhere else, and this
 * module is only ever imported lazily (see `moonshineModel.ts`), so the binding
 * stays out of the main bundle.
 *
 * It has no unit test: it needs the real model. It is proven on a real phone.
 */
import type { Stream } from '@moonshine-ai/moonshine-wasm';
import { ModelArch, Transcriber, loadMoonshineModule } from '@moonshine-ai/moonshine-wasm';
import type { ModelFile, ModelFileStore } from './modelFiles';
import { fetchModelFiles } from './modelFiles';
import { keepFileList, keptFileList } from './moonshineModel';
import type { SpeechPort } from './ports';

const ARCH = ModelArch.SmallStreaming;
const LANGUAGE = 'en';

/** The rate the model hears at, in samples a second. */
const SAMPLE_RATE = 16_000;

/** How many samples the microphone hands over at a time: a quarter of a second. */
const CAPTURE_SAMPLES = 4096;

interface Manifest {
  groups?: { base_url?: string; files?: { name: string; url?: string; size: number }[] }[];
}

/**
 * The model's files as its publisher lists them. The list is the binding's to
 * give, so where the files live is never written down a second time here.
 */
const publishedFiles = async (): Promise<ModelFile[]> => {
  const binding = await loadMoonshineModule();
  const manifest = JSON.parse(binding.sttDependencies(LANGUAGE, String(ARCH), false)) as Manifest;
  const files = (manifest.groups ?? []).flatMap(group =>
    (group.files ?? []).map(file => ({
      name: file.name,
      url: file.url ?? `${(group.base_url ?? '').replace(/\/+$/, '')}/${file.name}`,
      size: file.size,
    }))
  );
  if (files.length === 0) {
    throw new Error('Moonshine lists no files for its model.');
  }
  return files;
};

/**
 * Fetches what the phone does not yet hold of the model from the Moonshine
 * CDN. The browser is asked to keep what is downloaded: without that it may
 * evict the model whenever the phone runs short of storage.
 */
export const download = async (
  store: ModelFileStore,
  options: { onProgress: (receivedBytes: number) => void; signal: AbortSignal }
): Promise<void> => {
  navigator.storage?.persist?.().catch(() => undefined);
  const files = await publishedFiles();
  await fetchModelFiles(files, { store, ...options });
  await keepFileList(store, files);
};

/** The model, loaded from the files on the phone. */
const loadTranscriber = async (store: ModelFileStore): Promise<Transcriber> => {
  const listed = await keptFileList(store);
  if (!listed) {
    throw new Error('Moonshine is not downloaded.');
  }
  const files = new Map<string, Uint8Array>();
  for (const file of listed) {
    const bytes = await store.get(file.url);
    if (!bytes) {
      throw new Error(`Moonshine is missing ${file.name}.`);
    }
    files.set(file.name, bytes);
  }
  return Transcriber.load({ files, modelArch: ARCH });
};

/** Loads the downloaded model once and lets it go: whether it runs on this phone. */
export const testLoad = async (store: ModelFileStore): Promise<boolean> => {
  const transcriber = await loadTranscriber(store);
  transcriber.close();
  return true;
};

/** A term as the model takes one: the binding joins its terms with commas. */
const asKeyTerm = (term: string): string => term.replace(/,/g, ' ').trim();

/** The microphone, and the stream of the model it feeds, for one Ramble. */
interface Capture {
  media: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  node: ScriptProcessorNode;
  stream: Stream;
  /** The lines heard so far, in the order they were started. */
  lines: Map<string, string>;
}

const heard = (lines: Map<string, string>): string =>
  Array.from(lines.values())
    .map(line => line.trim())
    .filter(line => line !== '')
    .join(' ');

const release = (capture: Capture): void => {
  capture.node.onaudioprocess = null;
  capture.node.disconnect();
  capture.source.disconnect();
  capture.media.getTracks().forEach(track => track.stop());
  capture.context.close().catch(() => undefined);
};

export const createSpeech = (store: ModelFileStore): SpeechPort => {
  let loading: Promise<Transcriber> | undefined;
  let capture: Capture | undefined;

  const transcriber = (): Promise<Transcriber> => {
    if (!loading) {
      const attempt = loadTranscriber(store);
      loading = attempt;
      // A load that failed is tried again by the next Ramble.
      attempt.catch(() => {
        if (loading === attempt) {
          loading = undefined;
        }
      });
    }
    return loading;
  };

  /** Ends the Ramble being heard, if one is: its transcript, or nothing. */
  const finish = (): string => {
    const ending = capture;
    capture = undefined;
    if (!ending) {
      return '';
    }
    release(ending);
    try {
      // Stopping the stream has the model read what it has not read yet, so
      // the last words spoken are in the transcript.
      ending.stream.stop();
      return heard(ending.lines);
    } finally {
      ending.stream.close();
    }
  };

  return {
    load: () => transcriber().then(() => undefined),

    start: async (onPartial, keyTerms = []) => {
      finish();
      // The microphone first: where the cook has refused it the browser's own
      // error is what is thrown, which is how the sheet knows to say so.
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true },
      });
      let stream: Stream | undefined;
      try {
        const model = await transcriber();
        model.setKeyterms(keyTerms.map(asKeyTerm).filter(term => term !== ''));

        const lines = new Map<string, string>();
        const opened = model.createStream();
        stream = opened;
        const changed = ({ line }: { line: { id: string; text: string } }): void => {
          lines.set(line.id, line.text);
          onPartial(heard(lines));
        };
        opened.addListener({ onLineTextChanged: changed, onLineCompleted: changed });
        opened.start();

        const context = new AudioContext({ sampleRate: SAMPLE_RATE });
        await context.resume();
        const source = context.createMediaStreamSource(media);
        const node = context.createScriptProcessor(CAPTURE_SAMPLES, 1, 1);
        const listening: Capture = { media, context, source, node, stream: opened, lines };
        node.onaudioprocess = event => {
          if (capture !== listening) {
            return;
          }
          try {
            // The buffer is the browser's to reuse: the model is given a copy.
            opened.addAudio(new Float32Array(event.inputBuffer.getChannelData(0)), SAMPLE_RATE);
            // The stream itself decides whether there is enough new audio to
            // be worth another pass.
            opened.transcribe();
          } catch {
            // A pass that failed is made again when more audio arrives, and at
            // the latest when the Ramble ends.
          }
        };
        source.connect(node);
        node.connect(context.destination);
        capture = listening;
      } catch (error) {
        media.getTracks().forEach(track => track.stop());
        stream?.close();
        throw error;
      }
    },

    stop: async () => finish(),

    unload: async () => {
      finish();
      const loaded = loading;
      loading = undefined;
      if (loaded) {
        await loaded.then(
          model => model.close(),
          () => undefined
        );
      }
    },
  };
};
