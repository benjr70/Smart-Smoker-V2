import type { PreSmoke } from '../api/types';
import { WeightUnits } from '../components/common/interfaces/enums';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import type { ExtractorPort } from './ports';
import type { ScreenBinding } from './session';
import { RELEASE_MS, createVoiceFillSession } from './session';

const TRANSCRIPT = 'Sixteen pound brisket.';

const form: PreSmoke = {
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
};

const binding: ScreenBinding<PreSmoke> = {
  values: () => form,
  apply: () => () => undefined,
};

/** The scripted extractor, with every load and unload asked of it kept in order. */
const watchedExtractor = (unload: () => Promise<void> = () => Promise.resolve()) => {
  const calls: string[] = [];
  const fake = createFakeExtractor({ raw: { meatType: 'brisket', weight: 16 } });
  const extractor: ExtractorPort = {
    load: () => {
      calls.push('load');
      return fake.load();
    },
    extract: fake.extract,
    unload: () => {
      calls.push('unload');
      return unload();
    },
  };
  return { extractor, calls };
};

const sessionOver = (extractor: ExtractorPort) =>
  createVoiceFillSession({
    screen: 'preSmoke',
    speech: createFakeSpeech({ transcript: TRANSCRIPT, wordIntervalMs: 100 }),
    extractor,
    binding,
    now: () => new Date(2026, 9, 3, 12),
  });

/** Lets every promise the session is waiting on settle. */
const settled = async () => {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
};

describe('the extraction model over a Voice Fill session', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('is loaded while the cook is talking, before the Ramble is over', async () => {
    const { extractor, calls } = watchedExtractor();
    const session = sessionOver(extractor);

    session.start();
    await settled();

    expect(session.getState().phase).toBe('listening');
    expect(calls).toEqual(['load']);
  });

  test('is released two minutes after the sheet closes, and not before', async () => {
    const { extractor, calls } = watchedExtractor();
    const session = sessionOver(extractor);
    session.start();
    await settled();

    session.cancel();
    jest.advanceTimersByTime(RELEASE_MS - 1);
    expect(calls).not.toContain('unload');

    jest.advanceTimersByTime(1);
    expect(RELEASE_MS).toBe(120_000);
    expect(calls.filter(call => call === 'unload')).toHaveLength(1);
  });

  test('is kept for as long as the sheet is up, however long that is', async () => {
    const { extractor, calls } = watchedExtractor();
    const session = sessionOver(extractor);
    session.start();
    await settled();
    session.doneTalking();
    await settled();
    expect(session.getState().phase).toBe('review');

    jest.advanceTimersByTime(RELEASE_MS * 3);

    expect(calls).not.toContain('unload');
  });

  test('is released two minutes after a fill closes the sheet', async () => {
    const { extractor, calls } = watchedExtractor();
    const session = sessionOver(extractor);
    session.start();
    await settled();
    session.doneTalking();
    await settled();

    session.fill();
    jest.advanceTimersByTime(RELEASE_MS - 1);
    expect(calls).not.toContain('unload');

    jest.advanceTimersByTime(1);
    expect(calls).toContain('unload');
  });

  test('is kept by a Ramble started within the two minutes, and released after that one', async () => {
    const { extractor, calls } = watchedExtractor();
    const session = sessionOver(extractor);
    session.start();
    await settled();
    session.cancel();
    jest.advanceTimersByTime(RELEASE_MS - 1000);

    session.start();
    await settled();
    jest.advanceTimersByTime(RELEASE_MS);
    expect(calls).not.toContain('unload');

    session.cancel();
    jest.advanceTimersByTime(RELEASE_MS);
    expect(calls.filter(call => call === 'unload')).toHaveLength(1);
  });

  test('is kept by a Ramble started on the next screen, which shares it', async () => {
    const { extractor, calls } = watchedExtractor();
    const first = sessionOver(extractor);
    const next = sessionOver(extractor);
    first.start();
    await settled();
    first.cancel();
    jest.advanceTimersByTime(RELEASE_MS - 1000);

    next.start();
    await settled();
    jest.advanceTimersByTime(RELEASE_MS);

    expect(calls).not.toContain('unload');
  });

  test('that cannot be released is no concern of the next Ramble', async () => {
    const { extractor } = watchedExtractor(() => Promise.reject(new Error('lost the GPU')));
    const session = sessionOver(extractor);
    session.start();
    await settled();
    session.cancel();
    jest.advanceTimersByTime(RELEASE_MS);
    await settled();

    session.start();
    await settled();

    expect(session.getState().phase).toBe('listening');
  });

  test('is never asked to release by a session whose sheet was never up', () => {
    const { extractor, calls } = watchedExtractor();
    sessionOver(extractor);

    jest.advanceTimersByTime(RELEASE_MS * 2);

    expect(calls).toEqual([]);
  });
});
