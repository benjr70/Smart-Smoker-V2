/**
 * Scripted stand-ins for the two models, behind the same ports the real
 * adapters sit behind: a speech adapter that plays a transcript word by word
 * and an extractor that returns one raw object, whatever it is asked. Either
 * can be scripted to go wrong: a refused microphone, a model that fails or
 * takes too long.
 */
import type { ExtractorPort, SpeechPort } from './ports';
import { MICROPHONE_BLOCKED_ERROR } from './ports';

export interface FakeSpeechScript {
  /** The Ramble this adapter hears, however long it is left listening. */
  transcript: string;
  /** How long each word takes to arrive, in ms. */
  wordIntervalMs?: number;
  /** Whether the cook lets the page use the microphone. Allowed unless said. */
  microphone?: 'allowed' | 'blocked';
}

/** A speech adapter that hears its script, one word at a time. */
export const createFakeSpeech = ({
  transcript,
  wordIntervalMs = 140,
  microphone = 'allowed',
}: FakeSpeechScript): SpeechPort => {
  let playing: ReturnType<typeof setInterval> | undefined;
  const halt = (): void => {
    if (playing !== undefined) {
      clearInterval(playing);
      playing = undefined;
    }
  };
  return {
    load: () => Promise.resolve(),
    start: onPartial => {
      halt();
      if (microphone === 'blocked') {
        // Refused the way a browser refuses: by the name of the error.
        return Promise.reject(
          Object.assign(new Error('Permission denied'), { name: MICROPHONE_BLOCKED_ERROR })
        );
      }
      const words = transcript.split(' ');
      let heard = 0;
      playing = setInterval(() => {
        heard += 1;
        onPartial(words.slice(0, heard).join(' '));
        if (heard >= words.length) {
          halt();
        }
      }, wordIntervalMs);
      return Promise.resolve();
    },
    // The final transcript is the whole script, as a recogniser's final pass is
    // the whole Ramble: stopping early does not cut it short, so a flow driven
    // through this adapter ends the same way however fast it is driven.
    stop: () => {
      halt();
      return Promise.resolve(transcript);
    },
  };
};

export interface FakeExtractorScript {
  /** The raw object returned for every Ramble. */
  raw: unknown;
  /** How long the answer takes, in ms. */
  delayMs?: number;
  /** How many of the first answers are failures; `Infinity` for every one. */
  failures?: number;
  /**
   * Raw objects for particular transcripts: one found here by the exact text
   * asked about is the answer in place of `raw`, so a transcript that is fixed
   * and read again can be answered differently from the one that was heard.
   */
  rawByTranscript?: Readonly<Record<string, unknown>>;
}

/**
 * An extractor that answers every Ramble with its scripted raw object, as late
 * as it is scripted to, after failing as often as it is scripted to.
 */
export const createFakeExtractor = ({
  raw,
  delayMs = 0,
  failures = 0,
  rawByTranscript = {},
}: FakeExtractorScript): ExtractorPort => {
  // How many Rambles it has been asked to read so far.
  let extractions = 0;
  return {
    load: () => Promise.resolve(),
    extract: (_screen, transcript) => {
      extractions += 1;
      const fails = extractions <= failures;
      const found = Object.prototype.hasOwnProperty.call(rawByTranscript, transcript)
        ? rawByTranscript[transcript]
        : raw;
      return new Promise((resolve, reject) => {
        const answer = (): void =>
          fails ? reject(new Error('The scripted model failed')) : resolve(found);
        if (delayMs > 0) {
          setTimeout(answer, delayMs);
        } else {
          answer();
        }
      });
    },
  };
};
