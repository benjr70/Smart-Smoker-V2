/**
 * The two ports Voice Fill hears and reads a Ramble through.
 *
 * Each model runtime sits behind one of these in an adapter of its own, so the
 * session and the screens never know which model is picked — and a scripted
 * fake behind the same port exercises the whole flow with no model at all.
 */
import type { VoiceFillScreen } from './fieldDefinition';

/** Speech-to-text: turns what the microphone hears into a transcript. */
export interface SpeechPort {
  /** Makes the model ready to listen. Safe to call again once it is. */
  load(): Promise<void>;
  /**
   * Starts listening. `onPartial` is given the transcript so far — the whole of
   * it, not the words since the last call — each time more is heard.
   */
  start(onPartial: (transcript: string) => void): Promise<void>;
  /** Stops listening and gives the final transcript of the Ramble. */
  stop(): Promise<string>;
}

/** What an extractor is told besides the transcript. */
export interface ExtractionContext {
  /** When the Ramble was spoken. */
  now: Date;
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
}
