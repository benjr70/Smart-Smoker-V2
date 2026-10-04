/**
 * Scripted stand-ins for the two models, behind the same ports the real
 * adapters sit behind: a speech adapter that plays a transcript word by word
 * and an extractor that returns one raw object, whatever it is asked.
 */
import type { ExtractorPort, SpeechPort } from './ports';

export interface FakeSpeechScript {
  /** The Ramble this adapter hears, however long it is left listening. */
  transcript: string;
  /** How long each word takes to arrive, in ms. */
  wordIntervalMs?: number;
}

/** A speech adapter that hears its script, one word at a time. */
export const createFakeSpeech = ({
  transcript,
  wordIntervalMs = 140,
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
}

/** An extractor that answers every Ramble with its scripted raw object. */
export const createFakeExtractor = ({ raw, delayMs = 0 }: FakeExtractorScript): ExtractorPort => ({
  load: () => Promise.resolve(),
  extract: () =>
    delayMs > 0
      ? new Promise(resolve => {
          setTimeout(() => resolve(raw), delayMs);
        })
      : Promise.resolve(raw),
});
