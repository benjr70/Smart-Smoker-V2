import type { PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import type { SmokeScreenValues } from './extractionContract';
import type { ScreenBinding } from './session';
import { PROBLEM_CAP_MS, TOAST_MS, createVoiceFillSession } from './session';

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

  test('a name built from an unticked meat type is unticked with it, so the count is what is written', async () => {
    const { session, held } = sessionOn(emptyForm);
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.toggle('meatType');

    const review = session.getState();
    expect(review).toMatchObject({ phase: 'review', ticked: ['weight'] });

    session.fill();

    expect(held.values()).toEqual({ ...emptyForm, weight: { weight: 16, unit: WeightUnits.LB } });
    expect(session.getState()).toEqual({ phase: 'applied', count: 1, fields: ['weight'] });
  });

  test('ticking a name built from the meat type ticks the meat type too, and Fill writes both', async () => {
    const { session, held } = sessionOn(emptyForm, { meatType: 'brisket' });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.toggle('meatType');
    expect(session.getState()).toMatchObject({ phase: 'review', ticked: [] });
    session.toggle('name');
    expect(session.getState()).toMatchObject({ phase: 'review', ticked: ['name', 'meatType'] });
    session.fill();

    expect(held.values()).toEqual({ ...emptyForm, name: 'Saturday Brisket', meatType: 'Brisket' });
    expect(session.getState()).toEqual({
      phase: 'applied',
      count: 2,
      fields: ['name', 'meatType'],
    });
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

  describe('a Ramble with nothing in it for this screen', () => {
    test('an extraction with no rows is nothing to fill, with the transcript kept', async () => {
      const { session, held } = sessionOn(emptyForm, {});
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      expect(session.getState()).toEqual({ phase: 'nothing-to-fill', transcript: TRANSCRIPT });
      expect(held.values()).toEqual(emptyForm);
    });

    test('an empty transcript is nothing to fill, and the model is never asked to read it', async () => {
      const extract = jest.fn().mockResolvedValue({ weight: 16 });
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: '  ' }),
        extractor: { load: () => Promise.resolve(), extract },
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      expect(session.getState()).toEqual({ phase: 'nothing-to-fill', transcript: '' });
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('a Ramble the model cannot read', () => {
    /** A speech port that says how often it was asked to listen. */
    const countedSpeech = () => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT });
      const start = jest.fn(speech.start);
      return { port: { ...speech, start }, start };
    };

    test('an extractor failure is a problem, with the transcript kept', async () => {
      const held = screenHolding(emptyForm);
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: TRANSCRIPT }),
        extractor: createFakeExtractor({ raw: { weight: 16 }, failures: 1 }),
        binding: held.binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      expect(session.getState()).toEqual({ phase: 'problem', transcript: TRANSCRIPT });
      expect(held.values()).toEqual(emptyForm);
    });

    test('retry reads the kept transcript again without recording again', async () => {
      const speech = countedSpeech();
      const extract = jest
        .fn()
        .mockRejectedValueOnce(new Error('out of memory'))
        .mockResolvedValue({ weight: 16 });
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: speech.port,
        extractor: { load: () => Promise.resolve(), extract },
        binding: screenHolding({ ...emptyForm, name: 'Mine' }).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      session.retry();
      expect(session.getState()).toEqual({ phase: 'working', transcript: TRANSCRIPT });
      await settled();

      expect(session.getState()).toMatchObject({
        phase: 'review',
        transcript: TRANSCRIPT,
        ticked: ['weight'],
      });
      expect(speech.start).toHaveBeenCalledTimes(1);
      expect(extract).toHaveBeenCalledTimes(2);
      expect(extract.mock.calls[1][1]).toBe(TRANSCRIPT);
    });

    test('thirty seconds without an answer is a problem, and the late answer is dropped', async () => {
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: TRANSCRIPT }),
        extractor: createFakeExtractor({ raw: { weight: 16 }, delayMs: PROBLEM_CAP_MS + 5000 }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      jest.advanceTimersByTime(PROBLEM_CAP_MS - 1);
      await settled();
      expect(session.getState()).toEqual({ phase: 'working', transcript: TRANSCRIPT });

      jest.advanceTimersByTime(1);
      expect(session.getState()).toEqual({ phase: 'problem', transcript: TRANSCRIPT });

      jest.advanceTimersByTime(5000);
      await settled();
      expect(session.getState()).toEqual({ phase: 'problem', transcript: TRANSCRIPT });
    });

    test('the thirty seconds are counted afresh for a retry, and not at all once it is answered', async () => {
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: TRANSCRIPT }),
        extractor: createFakeExtractor({ raw: { weight: 16 }, delayMs: 20_000, failures: 1 }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      jest.advanceTimersByTime(20_000);
      await settled();
      expect(session.getState().phase).toBe('problem');

      session.retry();
      await settled();
      // Twenty seconds into the retry is forty since Done talking.
      jest.advanceTimersByTime(20_000);
      await settled();
      expect(session.getState().phase).toBe('review');

      jest.advanceTimersByTime(PROBLEM_CAP_MS);
      expect(session.getState().phase).toBe('review');
    });

    test('a microphone that will not stop is a problem, with what was heard kept', async () => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 });
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: { ...speech, stop: () => Promise.reject(new Error('recogniser died')) },
        extractor: createFakeExtractor({ raw: { weight: 16 } }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      jest.advanceTimersByTime(200);
      session.doneTalking();
      await settled();

      expect(session.getState()).toEqual({ phase: 'problem', transcript: 'Sixteen pound' });
    });
  });

  describe('a microphone the cook has refused', () => {
    const blockedSession = () => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT, microphone: 'blocked' });
      const stop = jest.fn(speech.stop);
      const held = screenHolding(emptyForm);
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: { ...speech, stop },
        extractor: createFakeExtractor({ raw: { weight: 16 } }),
        binding: held.binding,
        now: () => NOW,
      });
      return { session, held, stop };
    };

    test('is said to be blocked, with nothing heard and nothing changed', async () => {
      const { session, held } = blockedSession();

      session.start();
      await settled();

      expect(session.getState()).toEqual({ phase: 'microphone-blocked' });
      expect(held.values()).toEqual(emptyForm);
    });

    test('closes back to idle, ready to be asked again, with nothing left to stop', async () => {
      const { session, stop } = blockedSession();
      session.start();
      await settled();

      session.cancel();
      await settled();

      expect(session.getState()).toEqual({ phase: 'idle' });
      expect(stop).not.toHaveBeenCalled();
      // The button is still there to be tapped once the microphone is allowed.
      session.start();
      expect(session.getState().phase).toBe('listening');
    });
  });

  describe('a speech model that fails', () => {
    /** A session whose speech port goes wrong the first time `step` is asked of it. */
    const failingOnce = (step: 'load' | 'start') => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 });
      const failing = jest.fn(speech[step] as (...given: unknown[]) => Promise<void>);
      failing.mockImplementationOnce(() => Promise.reject(new Error('no model')));
      const extract = jest.fn(createFakeExtractor({ raw: { weight: 16 } }).extract);
      const held = screenHolding(emptyForm);
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: { ...speech, [step]: failing },
        extractor: { load: () => Promise.resolve(), extract },
        binding: held.binding,
        now: () => NOW,
      });
      return { session, held, extract };
    };

    test.each(['load', 'start'] as const)(
      'to %s is a problem the sheet stays up for, with nothing heard and nothing changed',
      async step => {
        const { session, held } = failingOnce(step);

        session.start();
        await settled();

        expect(session.getState()).toEqual({ phase: 'problem', transcript: '' });
        expect(held.values()).toEqual(emptyForm);
      }
    );

    test('retry listens again, there being nothing heard to read again', async () => {
      const { session, extract } = failingOnce('load');
      session.start();
      await settled();

      session.retry();
      await settled();
      expect(session.getState()).toEqual({ phase: 'listening', transcript: '' });
      expect(extract).not.toHaveBeenCalled();

      jest.advanceTimersByTime(200);
      expect(session.getState()).toEqual({ phase: 'listening', transcript: 'Sixteen pound' });
    });

    test('the text can be typed in place of what could not be heard', async () => {
      const { session } = failingOnce('load');
      session.start();
      await settled();

      session.fixText('Sixteen pound brisket.');
      await settled();

      expect(session.getState().phase).toBe('review');
    });

    test('closes with nothing left listening', async () => {
      const { session } = failingOnce('start');
      session.start();
      await settled();

      session.cancel();
      await settled();

      expect(session.getState()).toEqual({ phase: 'idle' });
    });
  });

  describe('fixing the text', () => {
    const FIXED = 'Sixty pound brisket. Trimmed the fat cap.';

    /** A session whose model misheard the weight, and reads the fixed text right. */
    const misheardSession = (raw: unknown, failures = 0) => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT });
      const start = jest.fn(speech.start);
      const held = screenHolding({ ...emptyForm, name: 'Mine' });
      // The scripted model answers every transcript alike; this one is told
      // apart here, so the fixed text reads differently from the heard one.
      const scripted = createFakeExtractor({ raw, failures });
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: { ...speech, start },
        extractor: {
          ...scripted,
          extract: (screen, transcript, context) =>
            transcript === FIXED
              ? Promise.resolve({ weight: 60 })
              : scripted.extract(screen, transcript, context),
        },
        binding: held.binding,
        now: () => NOW,
      });
      return { session, held, start };
    };

    const weightRow = (session: ReturnType<typeof misheardSession>['session']) => {
      const state = session.getState();
      return state.phase === 'review' ? state.rows.find(row => row.id === 'weight') : undefined;
    };

    test('in review, the edited text is read again and gives new rows, all ticked', async () => {
      const { session, held, start } = misheardSession({ weight: 16 });
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      session.toggle('weight');

      session.fixText(FIXED);
      expect(session.getState()).toEqual({ phase: 'working', transcript: FIXED });
      await settled();

      expect(session.getState()).toMatchObject({
        phase: 'review',
        transcript: FIXED,
        ticked: ['weight'],
      });
      expect(weightRow(session)?.newValue).toEqual({ weight: 60, unit: WeightUnits.LB });
      // Nothing was recorded again, and nothing is written before Fill.
      expect(start).toHaveBeenCalledTimes(1);
      expect(held.values().weight).toEqual({ unit: WeightUnits.LB });
    });

    test('with nothing to fill, the edited text is read and gives rows', async () => {
      const { session } = misheardSession({});
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      expect(session.getState().phase).toBe('nothing-to-fill');

      session.fixText(FIXED);
      await settled();

      expect(weightRow(session)?.newValue).toEqual({ weight: 60, unit: WeightUnits.LB });
    });

    test('after a problem, the edited text is read and gives rows', async () => {
      const { session } = misheardSession({ weight: 16 }, 1);
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      expect(session.getState().phase).toBe('problem');

      session.fixText(FIXED);
      await settled();

      expect(weightRow(session)?.newValue).toEqual({ weight: 60, unit: WeightUnits.LB });
    });

    test('text edited down to nothing is nothing to fill', async () => {
      const { session } = misheardSession({ weight: 16 });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      session.fixText('   ');
      await settled();

      expect(session.getState()).toEqual({ phase: 'nothing-to-fill', transcript: '' });
    });

    test('there is no text to fix while the Ramble is still being heard', async () => {
      const { session } = misheardSession({ weight: 16 });
      session.start();
      await settled();

      session.fixText(FIXED);

      expect(session.getState().phase).toBe('listening');
    });
  });

  describe('recording again', () => {
    const recordedSession = (raw: unknown) => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 });
      const start = jest.fn(speech.start);
      const held = screenHolding(emptyForm);
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: { ...speech, start },
        extractor: createFakeExtractor({ raw }),
        binding: held.binding,
        now: () => NOW,
      });
      return { session, held, start };
    };

    test('redo in review listens again from the start, with nothing written', async () => {
      const { session, held, start } = recordedSession({ weight: 16 });
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      expect(session.getState().phase).toBe('review');

      session.redo();
      await settled();

      expect(session.getState()).toEqual({ phase: 'listening', transcript: '' });
      expect(start).toHaveBeenCalledTimes(2);
      expect(held.values()).toEqual(emptyForm);
      jest.advanceTimersByTime(100);
      expect(session.getState()).toEqual({ phase: 'listening', transcript: 'Sixteen' });
    });

    test('try again with nothing to fill listens again from the start', async () => {
      const { session, start } = recordedSession({});
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      expect(session.getState().phase).toBe('nothing-to-fill');

      session.redo();
      await settled();

      expect(session.getState()).toEqual({ phase: 'listening', transcript: '' });
      expect(start).toHaveBeenCalledTimes(2);
    });

    test('there is nothing to redo while the model is still reading', async () => {
      const speech = createFakeSpeech({ transcript: TRANSCRIPT });
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech,
        extractor: createFakeExtractor({ raw: { weight: 16 }, delayMs: 500 }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      session.redo();

      expect(session.getState().phase).toBe('working');
    });
  });

  describe('closing the sheet', () => {
    test.each([
      ['with nothing to fill', {}, 0, 'nothing-to-fill'],
      ['after a problem', { weight: 16 }, 1, 'problem'],
      ['in review', { weight: 16 }, 0, 'review'],
    ])('%s changes nothing and keeps no transcript', async (_when, raw, failures, phase) => {
      const held = screenHolding(emptyForm);
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: TRANSCRIPT }),
        extractor: createFakeExtractor({ raw, failures }),
        binding: held.binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();
      expect(session.getState().phase).toBe(phase);

      session.cancel();

      expect(session.getState()).toEqual({ phase: 'idle' });
      expect(held.values()).toEqual(emptyForm);
    });

    test('while the model works, the thirty seconds stop being counted', async () => {
      const session = createVoiceFillSession({
        screen: 'preSmoke',
        speech: createFakeSpeech({ transcript: TRANSCRIPT }),
        extractor: createFakeExtractor({ raw: { weight: 16 }, delayMs: 60_000 }),
        binding: screenHolding(emptyForm).binding,
        now: () => NOW,
      });
      session.start();
      await settled();
      session.doneTalking();
      await settled();

      session.cancel();
      jest.advanceTimersByTime(PROBLEM_CAP_MS);

      expect(session.getState()).toEqual({ phase: 'idle' });
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

  test('reads a Ramble on the smoke screen against the smoke screen, not another one', async () => {
    const target = { target: 203, enabled: false, targetSource: 'default' as const };
    const smokeScreen: SmokeScreenValues = {
      chamberName: '',
      probe1Name: '',
      probe2Name: '',
      probe3Name: '',
      woodType: 'Cherry',
      notes: '',
      probe1Target: target,
      probe2Target: target,
      probe3Target: target,
      serveAt: null,
      restMinutes: null,
      stamps: [],
    };
    const session = createVoiceFillSession({
      screen: 'smoke',
      speech: createFakeSpeech({ transcript: 'Post oak, an hour of rest.' }),
      // A rest is a value of the post-smoke screen too, where it is `restTime`.
      extractor: createFakeExtractor({ raw: { woodType: 'post oak', restMinutes: 60 } }),
      binding: { values: () => smokeScreen, apply: () => () => undefined },
      now: () => NOW,
    });
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    const state = session.getState();
    expect(state.phase === 'review' && state.rows.map(row => row.field)).toEqual([
      'woodType',
      'restMinutes',
    ]);
  });
});
