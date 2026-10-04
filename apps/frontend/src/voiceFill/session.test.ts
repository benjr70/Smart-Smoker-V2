import type { PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import type { ScreenBinding } from './session';
import { TOAST_MS, createVoiceFillSession } from './session';

const TRANSCRIPT = 'Sixteen pound brisket. Trimmed the fat cap.';
// A Saturday, so the name built for a nameless cook is "Saturday Brisket".
const NOW = new Date(2026, 9, 3, 12, 0, 0);

const emptyForm: PreSmoke = {
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
};

/** A screen holding `initial`, written to the way a real screen's binding is. */
const screenHolding = (initial: PreSmoke) => {
  let values = initial;
  const binding: ScreenBinding<PreSmoke> = {
    values: () => values,
    apply: write => {
      const before = values;
      values = { ...values, ...write };
      return () => {
        values = before;
      };
    },
  };
  return { binding, values: () => values };
};

const sessionOn = (initial: PreSmoke, raw: unknown = { meatType: 'brisket', weight: 16 }) => {
  const held = screenHolding(initial);
  const session = createVoiceFillSession({
    screen: 'preSmoke',
    speech: createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 }),
    extractor: createFakeExtractor({ raw }),
    binding: held.binding,
    now: () => NOW,
  });
  return { session, held };
};

/** Lets every promise the session is waiting on settle. */
const settled = async () => {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
};

describe('Voice Fill session', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('starts idle, and listens with a live transcript once started', async () => {
    const { session } = sessionOn(emptyForm);
    expect(session.getState()).toEqual({ phase: 'idle' });

    session.start();
    await settled();
    expect(session.getState()).toEqual({ phase: 'listening', transcript: '' });

    jest.advanceTimersByTime(200);
    expect(session.getState()).toEqual({ phase: 'listening', transcript: 'Sixteen pound' });
  });

  test('done talking shows the transcript while working, then every row ticked for review', async () => {
    const held = screenHolding(emptyForm);
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 }),
      extractor: createFakeExtractor({ raw: { meatType: 'brisket', weight: 16 }, delayMs: 500 }),
      binding: held.binding,
      now: () => NOW,
    });
    session.start();
    await settled();

    session.doneTalking();
    await settled();
    expect(session.getState()).toEqual({ phase: 'working', transcript: TRANSCRIPT });

    jest.advanceTimersByTime(500);
    await settled();
    const state = session.getState();
    expect(state.phase).toBe('review');
    if (state.phase !== 'review') {
      return;
    }
    expect(state.transcript).toBe(TRANSCRIPT);
    expect(state.rows.map(row => row.id)).toEqual(['name', 'meatType', 'weight']);
    expect(state.ticked).toEqual(['name', 'meatType', 'weight']);
    // Nothing is written before Fill.
    expect(held.values()).toEqual(emptyForm);
  });

  test('fill writes the ticked rows through the binding and reports what it filled', async () => {
    const { session, held } = sessionOn(emptyForm);
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.fill();

    expect(held.values()).toEqual({
      ...emptyForm,
      name: 'Saturday Brisket',
      meatType: 'Brisket',
      weight: { weight: 16, unit: WeightUnits.LB },
    });
    expect(session.getState()).toEqual({
      phase: 'applied',
      count: 3,
      fields: ['name', 'meatType', 'weight'],
    });
  });

  test('an unticked row is not written', async () => {
    const { session, held } = sessionOn({ ...emptyForm, name: 'Mine' });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.toggle('weight');
    session.fill();

    expect(held.values()).toEqual({ ...emptyForm, name: 'Mine', meatType: 'Brisket' });
    expect(session.getState()).toEqual({ phase: 'applied', count: 1, fields: ['meatType'] });
  });

  test('a row unticked and ticked again is written', async () => {
    const { session, held } = sessionOn({ ...emptyForm, name: 'Mine' });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.toggle('weight');
    session.toggle('weight');
    session.fill();

    expect(held.values().weight).toEqual({ weight: 16, unit: WeightUnits.LB });
  });

  test('undo restores every value the Ramble changed and ends the session', async () => {
    const before: PreSmoke = { ...emptyForm, name: 'Mine', meatType: 'Ribs', notes: 'Old notes' };
    const { session, held } = sessionOn(before, {
      meatType: 'brisket',
      weight: 16,
      steps: ['trim the fat cap'],
      notes: 'Dry brined overnight.',
    });
    session.start();
    await settled();
    session.doneTalking();
    await settled();
    session.fill();
    expect(held.values()).not.toEqual(before);

    session.undo();

    expect(held.values()).toEqual(before);
    expect(session.getState()).toEqual({ phase: 'idle' });
  });

  test('the applied state ends by itself once the toast has had its time', async () => {
    const { session, held } = sessionOn(emptyForm);
    session.start();
    await settled();
    session.doneTalking();
    await settled();
    session.fill();

    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(session.getState().phase).toBe('applied');
    jest.advanceTimersByTime(1);
    expect(session.getState()).toEqual({ phase: 'idle' });
    // The fill stands: only Undo takes it back.
    expect(held.values().meatType).toBe('Brisket');
  });

  test('cancelling while listening changes nothing and keeps no transcript', async () => {
    const { session, held } = sessionOn(emptyForm);
    session.start();
    await settled();
    jest.advanceTimersByTime(300);

    session.cancel();

    expect(session.getState()).toEqual({ phase: 'idle' });
    expect(held.values()).toEqual(emptyForm);
    // The Ramble that was cancelled is not carried into the next one.
    session.start();
    await settled();
    expect(session.getState()).toEqual({ phase: 'listening', transcript: '' });
  });

  test('cancelling while the model works drops its answer', async () => {
    const held = screenHolding(emptyForm);
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: createFakeSpeech({ transcript: TRANSCRIPT }),
      extractor: createFakeExtractor({ raw: { weight: 16 }, delayMs: 500 }),
      binding: held.binding,
      now: () => NOW,
    });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.cancel();
    jest.advanceTimersByTime(500);
    await settled();

    expect(session.getState()).toEqual({ phase: 'idle' });
  });

  test('done talking before the speech model is ready still ends with the microphone stopped', async () => {
    const calls: string[] = [];
    let loaded: () => void = () => undefined;
    const held = screenHolding(emptyForm);
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: {
        load: () =>
          new Promise<void>(resolve => {
            calls.push('load');
            loaded = resolve;
          }),
        start: () => {
          calls.push('start');
          return Promise.resolve();
        },
        stop: () => {
          calls.push('stop');
          return Promise.resolve(TRANSCRIPT);
        },
      },
      extractor: createFakeExtractor({ raw: { weight: 16 } }),
      binding: held.binding,
      now: () => NOW,
    });

    session.start();
    await settled();
    session.doneTalking();
    await settled();
    expect(session.getState().phase).toBe('working');

    loaded();
    await settled();

    // Whatever was started is stopped after it: nothing is left listening.
    expect(calls).toEqual(['load', 'start', 'stop']);
    expect(session.getState().phase).toBe('review');
  });

  test('closing the sheet while the model works, before the speech model was ready, leaves nothing listening', async () => {
    const calls: string[] = [];
    let loaded: () => void = () => undefined;
    const held = screenHolding(emptyForm);
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: {
        load: () =>
          new Promise<void>(resolve => {
            calls.push('load');
            loaded = resolve;
          }),
        start: () => {
          calls.push('start');
          return Promise.resolve();
        },
        stop: () => {
          calls.push('stop');
          return Promise.resolve(TRANSCRIPT);
        },
      },
      extractor: createFakeExtractor({ raw: { weight: 16 } }),
      binding: held.binding,
      now: () => NOW,
    });

    session.start();
    await settled();
    session.doneTalking();
    session.cancel();
    loaded();
    await settled();

    // The port was never started, so there is nothing to stop.
    expect(calls).toEqual(['load']);
    expect(session.getState()).toEqual({ phase: 'idle' });
    expect(held.values()).toEqual(emptyForm);
  });

  test('cancelling before the speech model is ready never starts the microphone', async () => {
    const calls: string[] = [];
    let loaded: () => void = () => undefined;
    const held = screenHolding(emptyForm);
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: {
        load: () =>
          new Promise<void>(resolve => {
            calls.push('load');
            loaded = resolve;
          }),
        start: () => {
          calls.push('start');
          return Promise.resolve();
        },
        stop: () => {
          calls.push('stop');
          return Promise.resolve('');
        },
      },
      extractor: createFakeExtractor({ raw: {} }),
      binding: held.binding,
      now: () => NOW,
    });

    session.start();
    await settled();
    session.cancel();
    loaded();
    await settled();

    expect(calls).not.toContain('start');
    expect(session.getState()).toEqual({ phase: 'idle' });
  });

  describe('restarted while the speech model is still loading', () => {
    /** A speech port whose every load waits to be let through, and says what it was asked. */
    const slowSpeech = () => {
      const calls: string[] = [];
      const pending: (() => void)[] = [];
      let heard: (transcript: string) => void = () => undefined;
      return {
        calls,
        /** Lets every load asked for so far, and any asked for because of it, finish. */
        ready: async () => {
          for (let round = 0; round < 5; round += 1) {
            pending.splice(0).forEach(finish => finish());
            await settled();
          }
        },
        hear: (transcript: string) => heard(transcript),
        port: {
          load: () =>
            new Promise<void>(resolve => {
              calls.push('load');
              pending.push(resolve);
            }),
          start: (onPartial: (transcript: string) => void) => {
            calls.push('start');
            heard = onPartial;
            return Promise.resolve();
          },
          stop: () => {
            calls.push('stop');
            return Promise.resolve(TRANSCRIPT);
          },
        },
      };
    };

    const sessionWith = (speech: ReturnType<typeof slowSpeech>) =>
      createVoiceFillSession({
        screen: 'preSmoke',
        speech: speech.port,
        extractor: createFakeExtractor({ raw: { weight: 16 } }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });

    test('a Ramble started after a cancelled one is the one left listening', async () => {
      const speech = slowSpeech();
      const session = sessionWith(speech);

      session.start();
      session.cancel();
      session.start();
      await speech.ready();

      // The cancelled Ramble's ending never lands on the one that followed it.
      expect(speech.calls.lastIndexOf('stop')).toBeLessThan(speech.calls.lastIndexOf('start'));
      expect(speech.calls.filter(call => call === 'start')).toHaveLength(1);
      speech.hear('Sixteen pound');
      expect(session.getState()).toEqual({ phase: 'listening', transcript: 'Sixteen pound' });
    });

    test('a Ramble started after one ended and closed is the one left listening', async () => {
      const speech = slowSpeech();
      const session = sessionWith(speech);

      session.start();
      session.doneTalking();
      session.cancel();
      session.start();
      await speech.ready();

      expect(speech.calls.lastIndexOf('stop')).toBeLessThan(speech.calls.lastIndexOf('start'));
      speech.hear('Sixteen pound');
      expect(session.getState()).toEqual({ phase: 'listening', transcript: 'Sixteen pound' });
    });
  });

  test('tells its subscribers of every change until they unsubscribe', async () => {
    const { session } = sessionOn(emptyForm);
    const seen: string[] = [];
    const unsubscribe = session.subscribe(() => seen.push(session.getState().phase));

    session.start();
    await settled();
    unsubscribe();
    session.cancel();

    expect(seen).toContain('listening');
    expect(seen).not.toContain('idle');
  });

  test('gives the extractor the screen, the transcript and the Notes short enough to merge', async () => {
    const extract = jest.fn().mockResolvedValue({});
    const held = screenHolding({ ...emptyForm, notes: 'Old notes' });
    const session = createVoiceFillSession({
      screen: 'preSmoke',
      speech: createFakeSpeech({ transcript: TRANSCRIPT }),
      extractor: { load: () => Promise.resolve(), extract },
      binding: held.binding,
      now: () => NOW,
    });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    expect(extract).toHaveBeenCalledWith('preSmoke', TRANSCRIPT, {
      now: NOW,
      existingNotes: 'Old notes',
    });
  });
});
