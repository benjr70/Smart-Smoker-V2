import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';

describe('the fake speech adapter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('plays its scripted transcript a word at a time, each partial the whole so far', async () => {
    const speech = createFakeSpeech({ transcript: 'one two three', wordIntervalMs: 100 });
    const partials: string[] = [];

    await speech.load();
    await speech.start(partial => partials.push(partial));
    expect(partials).toEqual([]);

    jest.advanceTimersByTime(250);
    expect(partials).toEqual(['one', 'one two']);

    jest.advanceTimersByTime(1000);
    expect(partials).toEqual(['one', 'one two', 'one two three']);
  });

  test('stops with the whole scripted transcript, and hears nothing after', async () => {
    const speech = createFakeSpeech({ transcript: 'one two three', wordIntervalMs: 100 });
    const partials: string[] = [];
    await speech.start(partial => partials.push(partial));
    jest.advanceTimersByTime(100);

    await expect(speech.stop()).resolves.toBe('one two three');

    jest.advanceTimersByTime(1000);
    expect(partials).toEqual(['one']);
  });

  test('starts each Ramble from its first word', async () => {
    const speech = createFakeSpeech({ transcript: 'one two three', wordIntervalMs: 100 });
    await speech.start(() => undefined);
    jest.advanceTimersByTime(200);
    await speech.stop();

    const partials: string[] = [];
    await speech.start(partial => partials.push(partial));
    jest.advanceTimersByTime(100);

    expect(partials).toEqual(['one']);
  });

  test('refuses to listen when its microphone is scripted as blocked, the way a browser refuses', async () => {
    const speech = createFakeSpeech({ transcript: 'one two three', microphone: 'blocked' });
    const partials: string[] = [];

    await speech.load();
    await expect(speech.start(partial => partials.push(partial))).rejects.toMatchObject({
      name: 'NotAllowedError',
    });

    jest.advanceTimersByTime(1000);
    expect(partials).toEqual([]);
  });
});

describe('the fake extractor adapter', () => {
  const context = { now: new Date(2026, 9, 3) };

  test('answers every Ramble with its scripted raw object', async () => {
    const raw = { weight: 16 };
    const extractor = createFakeExtractor({ raw });

    await extractor.load();

    await expect(extractor.extract('preSmoke', 'anything', context)).resolves.toBe(raw);
    await expect(extractor.extract('postSmoke', 'anything else', context)).resolves.toBe(raw);
  });

  test('fails as many of its first answers as it is scripted to, then answers', async () => {
    const extractor = createFakeExtractor({ raw: { weight: 16 }, failures: 1 });

    await expect(extractor.extract('preSmoke', 'anything', context)).rejects.toThrow();
    await expect(extractor.extract('preSmoke', 'anything', context)).resolves.toEqual({
      weight: 16,
    });
  });

  test('answers a Ramble on a screen scripted its own answer with that one', async () => {
    const raw = { weight: 16 };
    const smoke = { woodType: 'hickory' };
    const extractor = createFakeExtractor({ raw, rawByScreen: { smoke } });

    await expect(extractor.extract('smoke', 'anything', context)).resolves.toBe(smoke);
    await expect(extractor.extract('preSmoke', 'anything', context)).resolves.toBe(raw);
  });

  test('takes as long to answer as it is scripted to', async () => {
    jest.useFakeTimers();
    try {
      const extractor = createFakeExtractor({ raw: {}, delayMs: 500 });
      const answered = jest.fn();
      extractor.extract('preSmoke', 'anything', context).then(answered);

      jest.advanceTimersByTime(499);
      await Promise.resolve();
      expect(answered).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await Promise.resolve();
      expect(answered).toHaveBeenCalledWith({});
    } finally {
      jest.useRealTimers();
    }
  });
});
