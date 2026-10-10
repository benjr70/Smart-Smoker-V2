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
import type { ReviewRow, SmokeScreenValues, VoiceFillScreenValues } from './extractionContract';
import { fillFor, notesAreMerged, reviewRows, tickedAfterToggle } from './extractionContract';
import type { VoiceFillContext, VoiceFillScreen } from './fieldDefinition';
import { keyTermsFor } from './fieldDefinition';
import type { ExtractorPort, SpeechPort } from './ports';
import { isMicrophoneBlocked } from './ports';

/** How long the toast, and with it the offer to Undo, stays up. */
export const TOAST_MS = 6000;

/**
 * How long a Ramble may go unread after "Done talking" — or after a retry, or
 * a re-read — before the session stops waiting and calls it a problem.
 */
export const PROBLEM_CAP_MS = 30_000;

/**
 * How long the models are kept after the sheet closes before they are let go:
 * long enough that a second Ramble does not wait for them again, short enough
 * that the phone is not held hot by a cook who has gone back to watching
 * temperatures.
 */
export const RELEASE_MS = 120_000;

/** A model that can be let go: either of the two ports. */
type Releasable = Pick<SpeechPort, 'unload'>;

/**
 * The models waiting to be let go, each with the clock it is waiting on. The
 * clock is kept by model and not by session because the screens share their
 * models: a Ramble started on the next screen has to stop the clock the screen
 * before it started, or its model would be let go under it.
 */
const releases = new WeakMap<Releasable, ReturnType<typeof setTimeout>>();

/** Stops the clock on `model`, if one is running: it is wanted again. */
const keep = (model: Releasable): void => {
  clearTimeout(releases.get(model));
  releases.delete(model);
};

/** Starts the clock on `model` afresh: `release` it once {@link RELEASE_MS} have gone by. */
const releaseLater = (model: Releasable, release: () => void): void => {
  keep(model);
  releases.set(
    model,
    setTimeout(() => {
      releases.delete(model);
      release();
    }, RELEASE_MS)
  );
};

/** The phases the sheet is up in: every one but idle and the toast's. */
const sheetIsUp = (phase: VoiceFillState<unknown>['phase']): boolean =>
  phase !== 'idle' && phase !== 'applied';

/**
 * What a fillable screen gives Voice Fill: the values it holds now, and a
 * setter that writes a set of changes and gives back the undo of exactly those.
 */
export interface ScreenBinding<Values> {
  values(): Values;
  apply(write: Partial<Values>): () => void;
  /**
   * What a Ramble on this screen is read against beside its values, as it
   * stands at the moment of asking: the names its probes go by and the stamps
   * its cook log offers. A screen that has neither has no need of it.
   */
  context?(): Omit<VoiceFillContext, 'now'>;
}

export type VoiceFillState<Values> =
  | { phase: 'idle' }
  /**
   * The sheet is up for a Ramble to be heard. `gettingReady` is there, and
   * true, from the tap until the microphone is open — while the speech model
   * loads and the port starts — and gone once it is: nothing said before then
   * is heard, and the sheet must not say it is listening.
   */
  | { phase: 'listening'; transcript: string; gettingReady?: true }
  /** The Ramble is over and the model is reading it. */
  | { phase: 'working'; transcript: string }
  /** The changes the Ramble proposes, and the ids of the rows still ticked. */
  | { phase: 'review'; transcript: string; rows: ReviewRow<Values>[]; ticked: string[] }
  /** The Ramble had no words in it, or none this screen has a field for. */
  | { phase: 'nothing-to-fill'; transcript: string }
  /**
   * A model failed, or took longer than the cap. What was heard is kept, so
   * it can be read again without being spoken again; where the failure was in
   * the hearing itself, nothing was, and the transcript is empty.
   */
  | { phase: 'problem'; transcript: string }
  /** The cook has refused the page the microphone: nothing can be heard. */
  | { phase: 'microphone-blocked' }
  /** The ticked rows are written: how many, and to which fields. */
  | { phase: 'applied'; count: number; fields: (keyof Values & string)[] };

/** The phases whose transcript the cook can correct and have read again. */
const FIXABLE_PHASES = ['review', 'nothing-to-fill', 'problem'] as const;

/** A state the sheet offers "Fix the text" in, and the session takes it in. */
export type FixableState<Values> = Extract<
  VoiceFillState<Values>,
  { phase: (typeof FIXABLE_PHASES)[number] }
>;

/**
 * Whether the transcript of `state` can be fixed: the one answer both the
 * sheet, for whether to offer it, and the session, for whether to take it, go by.
 */
export const isFixable = <Values>(state: VoiceFillState<Values>): state is FixableState<Values> =>
  (FIXABLE_PHASES as readonly string[]).includes(state.phase);

export interface VoiceFillSession<Values> {
  getState(): VoiceFillState<Values>;
  /** Calls `listener` after every change of state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Opens the sheet and starts listening. */
  start(): void;
  /** Ends the Ramble and has it read. */
  doneTalking(): void;
  /**
   * Reads the transcript a problem kept again; nothing is recorded again.
   * Where the problem was that nothing could be heard, listens again instead.
   */
  retry(): void;
  /**
   * Reads `transcript` — the one on the sheet, as the cook has corrected it —
   * in place of the one that was heard. Nothing is recorded again.
   */
  fixText(transcript: string): void;
  /** Throws the Ramble away and listens to a new one from the start. */
  redo(): void;
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

/**
 * The contract's rows for whichever screen the session is on: every screen is
 * named, so one added to {@link VoiceFillScreen} fails to compile here rather
 * than being read as another screen's values.
 */
const rowsFor = <Screen extends VoiceFillScreen>(
  screen: Screen,
  raw: unknown,
  current: VoiceFillScreenValues[Screen],
  context: VoiceFillContext
): ReviewRow<VoiceFillScreenValues[Screen]>[] => {
  const on: VoiceFillScreen = screen;
  const rows = ():
    | ReviewRow<PreSmoke>[]
    | ReviewRow<SmokeScreenValues>[]
    | ReviewRow<PostSmoke>[] => {
    switch (on) {
      case 'preSmoke':
        return reviewRows('preSmoke', raw, current as PreSmoke, context);
      case 'smoke':
        return reviewRows('smoke', raw, current as SmokeScreenValues, context);
      case 'postSmoke':
        return reviewRows('postSmoke', raw, current as PostSmoke, context);
      default: {
        const unnamed: never = on;
        return unnamed;
      }
    }
  };
  return rows() as ReviewRow<VoiceFillScreenValues[Screen]>[];
};

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
  /** Whether an answer asked for in generation `askedIn` is still wanted. */
  const isCurrent = (askedIn: number): boolean => askedIn === generation;
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
  let capTimer: ReturnType<typeof setTimeout> | undefined;

  // A model that will not be let go is no concern of the Ramble's. The speech
  // port is let go after whatever it is still being asked, so never from under
  // a stop that has not settled.
  const releaseSpeech = (): void => {
    queued(() => {
      live = false;
      return speech.unload();
    }).catch(() => undefined);
  };
  const releaseExtractor = (): void => {
    extractor.unload().catch(() => undefined);
  };

  const set = (next: VoiceFillState<Values>): void => {
    const wasUp = sheetIsUp(state.phase);
    state = next;
    // The models are wanted for as long as the sheet is up, and for two
    // minutes after it closes.
    if (sheetIsUp(next.phase)) {
      keep(speech);
      keep(extractor);
    } else if (wasUp) {
      releaseLater(speech, releaseSpeech);
      releaseLater(extractor, releaseExtractor);
    }
    listeners.forEach(listener => listener());
  };

  const endToast = (): void => {
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
  };

  const endCap = (): void => {
    if (capTimer !== undefined) {
      clearTimeout(capTimer);
      capTimer = undefined;
    }
  };

  const toIdle = (): void => {
    generation += 1;
    endToast();
    endCap();
    undoFill = undefined;
    set({ phase: 'idle' });
  };

  /** Stops waiting on a model: the problem state, over the `transcript` kept. */
  const toProblem = (transcript: string): void => {
    // Whatever a model answers from here on is an answer to nothing.
    generation += 1;
    endCap();
    set({ phase: 'problem', transcript });
  };

  /** The transcript on the sheet while the model reads; what a problem keeps. */
  const transcriptBeingRead = (): string => (state.phase === 'working' ? state.transcript : '');

  /**
   * The one way a transcript is read. Shows the working state over `shown`,
   * waits for the transcript `transcriptOf` gives, has the model extract from
   * it, and shows what was found: the rows for review, or that there was
   * nothing in it for this screen. A transcript with no words in it is not
   * worth the model's time.
   *
   * The whole of it — the wait for the transcript and the extraction — runs
   * under the cap: a failure, or `PROBLEM_CAP_MS` without an answer, ends in
   * the problem state.
   */
  const readUnderCap = (shown: string, transcriptOf: () => Promise<string>): void => {
    const askedIn = generation;
    set({ phase: 'working', transcript: shown });
    endCap();
    capTimer = setTimeout(() => {
      if (isCurrent(askedIn)) {
        toProblem(transcriptBeingRead());
      }
    }, PROBLEM_CAP_MS);
    transcriptOf()
      .then(transcript => {
        if (!isCurrent(askedIn)) {
          return undefined;
        }
        if (transcript.trim() === '') {
          endCap();
          set({ phase: 'nothing-to-fill', transcript: '' });
          return undefined;
        }
        set({ phase: 'working', transcript });
        // What the Ramble is read against is what the screen held as it was
        // spoken: the model is told it, and its answer is checked against
        // that same telling.
        const spoken: VoiceFillContext = { ...binding.context?.(), now: now() };
        const notes = (binding.values().notes ?? '').trim();
        return extractor
          .load()
          .then(() =>
            extractor.extract(screen, transcript, {
              ...spoken,
              ...(notes && notesAreMerged(notes) && { existingNotes: notes }),
            })
          )
          .then(raw => {
            if (!isCurrent(askedIn)) {
              return;
            }
            endCap();
            const rows = rowsFor(screen, raw, binding.values(), spoken);
            set(
              rows.length === 0
                ? { phase: 'nothing-to-fill', transcript }
                : { phase: 'review', transcript, rows, ticked: rows.map(row => row.id) }
            );
          });
      })
      .catch(() => {
        if (isCurrent(askedIn)) {
          toProblem(transcriptBeingRead());
        }
      });
  };

  /**
   * Reads a transcript already in hand — one a problem kept, or one the cook
   * has fixed — with nothing recorded again.
   */
  const readInHand = (transcript: string): void => {
    generation += 1;
    readUnderCap(transcript, () => Promise.resolve(transcript));
  };

  /** Puts the sheet up listening, to a Ramble that starts from nothing. */
  const listen = (): void => {
    generation += 1;
    const askedIn = generation;
    // Not listening yet: the microphone is opened only once the model is
    // loaded, and what is said until then is heard by nothing. The sheet is
    // told so, and says so, until the port has started.
    set({ phase: 'listening', transcript: '', gettingReady: true });
    queued(() => {
      const loaded = speech.load();
      // Speech first; the extractor is made ready behind it, while the cook
      // talks. A failure to is met again, and handled, when it is asked to
      // extract.
      extractor.load().catch(() => undefined);
      return loaded.then(() => {
        // Ended before its model was ready: there is nothing to listen to.
        if (!isCurrent(askedIn)) {
          return undefined;
        }
        return speech
          .start(
            transcript => {
              if (isCurrent(askedIn) && state.phase === 'listening') {
                set({ phase: 'listening', transcript });
              }
            },
            keyTermsFor(screen, binding.context?.())
          )
          .then(() => {
            // Only a port that did start is one there is anything to stop.
            live = true;
            // The microphone is open: from here on the cook is heard.
            if (isCurrent(askedIn) && state.phase === 'listening' && state.gettingReady) {
              set({ phase: 'listening', transcript: state.transcript });
            }
          });
      });
    }).catch(error => {
      if (!isCurrent(askedIn)) {
        return;
      }
      if (isMicrophoneBlocked(error)) {
        generation += 1;
        endCap();
        set({ phase: 'microphone-blocked' });
      } else {
        // A speech model that will not load or start is a problem the cook is
        // told of, with nothing heard to keep: the sheet stays up with a way on.
        toProblem('');
      }
    });
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
      if (state.phase === 'idle') {
        listen();
      }
    },

    doneTalking: () => {
      if (state.phase !== 'listening') {
        return;
      }
      // Stopped whether or not the Ramble is still in hand by then: a sheet
      // closed while the port was starting must not leave it listening.
      readUnderCap(state.transcript, stopSpeech);
    },

    retry: () => {
      if (state.phase !== 'problem') {
        return;
      }
      if (state.transcript === '') {
        // Nothing was heard, so there is nothing to read again: the retry is
        // of the hearing.
        listen();
      } else {
        readInHand(state.transcript);
      }
    },

    fixText: transcript => {
      if (isFixable(state)) {
        readInHand(transcript.trim());
      }
    },

    redo: () => {
      if (state.phase === 'review' || state.phase === 'nothing-to-fill') {
        listen();
      }
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
