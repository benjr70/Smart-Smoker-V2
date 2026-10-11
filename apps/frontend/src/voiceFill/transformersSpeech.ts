/**
 * The speech port over a model that hears a Ramble all at once: nothing is
 * written while the cook talks, and the whole of what was recorded is
 * transcribed when they are done.
 *
 * The microphone and the model are behind {@link Recorder} and
 * {@link BatchTranscriber}, which say only as much of each as is used here.
 * Nothing in this module imports a runtime, so all of it is run in tests.
 */
import type { SpeechPort } from './ports';

/** The microphone, open and recording one Ramble. */
export interface Recording {
  /** Lets the microphone go and gives everything it heard, at the model's rate. */
  stop(): Float32Array;
}

export interface Recorder {
  /**
   * Opens the microphone and starts recording. Where the cook has refused it
   * the browser's own error is what it rejects with.
   */
  open(): Promise<Recording>;
}

/** A speech model, loaded. */
export interface BatchTranscriber {
  /** What was said in `audio`. */
  transcribe(audio: Float32Array): Promise<string>;
  /** Lets the model go, and the memory it holds with it. */
  dispose(): Promise<void>;
}

export const createBatchSpeech = (
  recorder: Recorder,
  loadTranscriber: () => Promise<BatchTranscriber>
): SpeechPort => {
  // The model as it is loading or loaded; nothing once it has been let go.
  let loaded: Promise<BatchTranscriber> | undefined;
  let recording: Recording | undefined;

  const transcriber = (): Promise<BatchTranscriber> => {
    if (!loaded) {
      const loading = loadTranscriber();
      loaded = loading;
      // A load that failed is tried again by the next Ramble.
      loading.catch(() => {
        if (loaded === loading) {
          loaded = undefined;
        }
      });
    }
    return loaded;
  };

  /** Ends the Ramble being recorded, if one is: what was heard of it. */
  const finish = (): Float32Array | undefined => {
    const ending = recording;
    recording = undefined;
    return ending?.stop();
  };

  return {
    load: () => transcriber().then(() => undefined),

    // Nothing is transcribed until the Ramble ends, so `onPartial` is never
    // told anything; and a model that hears a recording has no key terms.
    start: async () => {
      finish();
      // The microphone first: where the cook has refused it the browser's own
      // error is what is thrown, which is how the sheet knows to say so.
      const opened = await recorder.open();
      try {
        await transcriber();
      } catch (error) {
        opened.stop();
        throw error;
      }
      recording = opened;
    },

    stop: async () => {
      const audio = finish();
      // A Ramble with nothing recorded is not worth the model's time.
      if (!audio || audio.length === 0) {
        return '';
      }
      const model = await transcriber();
      return (await model.transcribe(audio)).trim();
    },

    unload: async () => {
      finish();
      const loading = loaded;
      loaded = undefined;
      // One that never loaded holds nothing to let go of.
      const held = await loading?.catch(() => undefined);
      await held?.dispose();
    },
  };
};
