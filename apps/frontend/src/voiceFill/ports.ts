/**
 * The two ports Voice Fill hears and reads a Ramble through.
 *
 * Each model runtime sits behind one of these in an adapter of its own, so the
 * session and the screens never know which model is picked — and a scripted
 * fake behind the same port exercises the whole flow with no model at all.
 */
import type { VoiceFillContext, VoiceFillScreen } from './fieldDefinition';

/** Speech-to-text: turns what the microphone hears into a transcript. */
export interface SpeechPort {
  /** Makes the model ready to listen. Safe to call again once it is. */
  load(): Promise<void>;
  /**
   * Starts listening. `onPartial` is given the transcript so far — the whole of
   * it, not the words since the last call — each time more is heard.
   *
   * `keyTerms` are the words this Ramble is likely to hold that a model would
   * otherwise be unlikely to write: the screen's suggestion lists and the names
   * its probes go by. A model that can lean towards them does; one that cannot
   * ignores them.
   *
   * Rejects when it cannot listen. A microphone the cook has refused is told
   * apart from every other failure by {@link isMicrophoneBlocked}: an adapter
   * lets the browser's own refusal through as it is.
   */
  start(onPartial: (transcript: string) => void, keyTerms?: readonly string[]): Promise<void>;
  /** Stops listening and gives the final transcript of the Ramble. */
  stop(): Promise<string>;
  /**
   * Lets the model go, and the memory it holds with it. Safe to call when it is
   * not loaded; `load` makes it ready again.
   */
  unload(): Promise<void>;
}

/** What a browser names the error it refuses a microphone with. */
export const MICROPHONE_BLOCKED_ERROR = 'NotAllowedError';

/** Whether `error` is the microphone being refused, and not a model failing. */
export const isMicrophoneBlocked = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === MICROPHONE_BLOCKED_ERROR;

/**
 * What an extractor is told besides the transcript: when the Ramble was spoken
 * and, on the smoke screen, the names its probes go by and the stamps its cook
 * log offers.
 */
export interface ExtractionContext extends VoiceFillContext {
  /**
   * The screen's Notes, given only when they are short enough to be merged
   * with the Ramble's summary into one text.
   */
  existingNotes?: string;
}

/** Field extraction: turns a transcript into the raw object of a screen's fields. */
export interface ExtractorPort {
  /** Makes the model ready to extract. Safe to call again once it is. */
  load(): Promise<void>;
  /**
   * The raw object the model returns for a Ramble spoken on `screen`: plain
   * values under the screen's field keys, with what was not said left out. It
   * is trusted for nothing — the extraction contract decides what it fills.
   */
  extract(
    screen: VoiceFillScreen,
    transcript: string,
    context: ExtractionContext
  ): Promise<unknown>;
  /**
   * Lets the model go, and the memory it holds with it. Safe to call when it is
   * not loaded; `load` makes it ready again.
   */
  unload(): Promise<void>;
}
