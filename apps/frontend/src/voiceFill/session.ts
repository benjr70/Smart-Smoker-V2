/**
 * The Voice Fill session: one Ramble, from the tap that starts it to the toast
 * that offers to undo it.
 *
 * It holds the state the sheet and the toast draw and nothing of how they are
 * drawn. What a Ramble fills is the extraction contract's decision; how the
 * screen is written is its binding's. The transcript lives in the states the
 * sheet is up for and in none of the others, so it is gone when the sheet is.
 */
import type { PostSmoke, PreSmoke } from '../api/types';
import type { ReviewRow, VoiceFillScreenValues } from './extractionContract';
import { fillFor, notesAreMerged, reviewRows, tickedAfterToggle } from './extractionContract';
import type { VoiceFillScreen } from './fieldDefinition';
import type { ExtractorPort, SpeechPort } from './ports';

/** How long the toast, and with it the offer to Undo, stays up. */
export const TOAST_MS = 6000;

/**
 * What a fillable screen gives Voice Fill: the values it holds now, and a
 * setter that writes a set of changes and gives back the undo of exactly those.
 */
export interface ScreenBinding<Values> {
  values(): Values;
  apply(write: Partial<Values>): () => void;
}

export type VoiceFillState<Values> =
  | { phase: 'idle' }
  /** The sheet is up and the Ramble is being heard. */
  | { phase: 'listening'; transcript: string }
  /** The Ramble is over and the model is reading it. */
  | { phase: 'working'; transcript: string }
  /** The changes the Ramble proposes, and the ids of the rows still ticked. */
  | { phase: 'review'; transcript: string; rows: ReviewRow<Values>[]; ticked: string[] }
  /** The ticked rows are written: how many, and to which fields. */
  | { phase: 'applied'; count: number; fields: (keyof Values & string)[] };

export interface VoiceFillSession<Values> {
  getState(): VoiceFillState<Values>;
  /** Calls `listener` after every change of state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Opens the sheet and starts listening. */
  start(): void;
  /** Ends the Ramble and has it read. */
  doneTalking(): void;
  /** Ticks or unticks a Review row. */
  toggle(rowId: string): void;
  /** Writes the ticked rows to the screen. */
  fill(): void;
  /** Takes back everything the last fill wrote. */
  undo(): void;
  /** Closes the sheet with nothing changed. */
  cancel(): void;
  /** Ends the applied state before its time is up, leaving the fill in place. */
  dismiss(): void;
}

export interface VoiceFillSessionOptions<Screen extends VoiceFillScreen> {
  screen: Screen;
  speech: SpeechPort;
  extractor: ExtractorPort;
  binding: ScreenBinding<VoiceFillScreenValues[Screen]>;
  /** The clock a Ramble is timed by. */
  now?: () => Date;
}

/** The contract's rows for whichever screen the session is on. */
const rowsFor = <Screen extends VoiceFillScreen>(
  screen: Screen,
  raw: unknown,
  current: VoiceFillScreenValues[Screen],
  now: Date
): ReviewRow<VoiceFillScreenValues[Screen]>[] =>
  (screen === 'preSmoke'
    ? reviewRows('preSmoke', raw, current as PreSmoke, now)
    : reviewRows('postSmoke', raw, current as PostSmoke, now)) as ReviewRow<
    VoiceFillScreenValues[Screen]
  >[];

export const createVoiceFillSession = <Screen extends VoiceFillScreen>({
  screen,
  speech,
  extractor,
  binding,
  now = () => new Date(),
}: VoiceFillSessionOptions<Screen>): VoiceFillSession<VoiceFillScreenValues[Screen]> => {
  type Values = VoiceFillScreenValues[Screen];

  let state: VoiceFillState<Values> = { phase: 'idle' };
  const listeners = new Set<() => void>();
  // Goes up each time a Ramble is started or ended. What a port answers is
  // only acted on while the generation it was asked in is still the current
  // one: an answer to a cancelled Ramble, or a word heard after it ended,
  // changes nothing.
  let generation = 0;
  // The speech port is asked for one thing at a time, in the order the cook
  // asked: every load, start and stop waits for the one before it. A Ramble
  // ended while its model was still loading is therefore settled before the
  // next one is started, and never ends that one instead of itself.
  let speechQueue: Promise<unknown> = Promise.resolve();
  const queued = <Answer>(ask: () => Promise<Answer> | Answer): Promise<Answer> => {
    const answer = speechQueue.then(ask);
    speechQueue = answer.catch(() => undefined);
    return answer;
  };
  // Whether the speech port is listening: started, and not stopped since.
  let live = false;
  /** Stops the port if it is listening; the transcript, or nothing if it was not. */
  const stopSpeech = (): Promise<string> =>
    queued(() => {
      if (!live) {
        return '';
      }
      live = false;
      return speech.stop();
    });
  let undoFill: (() => void) | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: VoiceFillState<Values>): void => {
    state = next;
    listeners.forEach(listener => listener());
  };

  const endToast = (): void => {
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
  };

  const toIdle = (): void => {
    generation += 1;
    endToast();
    undoFill = undefined;
    set({ phase: 'idle' });
  };

  return {
    getState: () => state,

    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start: () => {
      if (state.phase !== 'idle') {
        return;
      }
      generation += 1;
      const asked = generation;
      set({ phase: 'listening', transcript: '' });
      queued(() =>
        speech.load().then(() => {
          // Ended before its model was ready: there is nothing to listen to.
          if (asked !== generation) {
            return undefined;
          }
          live = true;
          return speech.start(transcript => {
            if (asked === generation && state.phase === 'listening') {
              set({ phase: 'listening', transcript });
            }
          });
        })
      )
        // A Ramble that cannot be heard is one that fills nothing.
        .catch(() => {
          if (asked === generation) {
            toIdle();
          }
        });
      // The extractor is made ready while the cook talks; a failure to is met
      // again, and handled, when it is asked to extract.
      extractor.load().catch(() => undefined);
    },

    doneTalking: () => {
      if (state.phase !== 'listening') {
        return;
      }
      const asked = generation;
      set({ phase: 'working', transcript: state.transcript });
      // Stopped whether or not the Ramble is still in hand by then: a sheet
      // closed while the port was starting must not leave it listening.
      stopSpeech()
        .then(transcript => {
          if (asked !== generation) {
            return undefined;
          }
          set({ phase: 'working', transcript });
          const spokenAt = now();
          const notes = (binding.values().notes ?? '').trim();
          return extractor
            .load()
            .then(() =>
              extractor.extract(screen, transcript, {
                now: spokenAt,
                ...(notes && notesAreMerged(notes) && { existingNotes: notes }),
              })
            )
            .then(raw => {
              if (asked !== generation) {
                return;
              }
              const rows = rowsFor(screen, raw, binding.values(), spokenAt);
              set({ phase: 'review', transcript, rows, ticked: rows.map(row => row.id) });
            });
        })
        // A Ramble that cannot be read is one that fills nothing.
        .catch(() => {
          if (asked === generation) {
            toIdle();
          }
        });
    },

    toggle: rowId => {
      if (state.phase !== 'review') {
        return;
      }
      // Which rows a tap leaves ticked is the contract's to say: a row built
      // from another goes with it, so what is ticked is what a fill writes.
      set({ ...state, ticked: tickedAfterToggle(state.rows, state.ticked, rowId) });
    },

    fill: () => {
      if (state.phase !== 'review') {
        return;
      }
      const { write } = fillFor(state.rows, state.ticked);
      const fields = Object.keys(write) as (keyof Values & string)[];
      if (fields.length === 0) {
        return;
      }
      undoFill = binding.apply(write);
      set({ phase: 'applied', count: fields.length, fields });
      toastTimer = setTimeout(toIdle, TOAST_MS);
    },

    undo: () => {
      if (state.phase !== 'applied') {
        return;
      }
      undoFill?.();
      toIdle();
    },

    cancel: () => {
      if (state.phase === 'idle' || state.phase === 'applied') {
        return;
      }
      // Ending the Ramble first is what keeps a speech port still loading from
      // being started at all; one already started is stopped once it has been.
      toIdle();
      stopSpeech().catch(() => undefined);
    },

    dismiss: () => {
      if (state.phase === 'applied') {
        toIdle();
      }
    },
  };
};
