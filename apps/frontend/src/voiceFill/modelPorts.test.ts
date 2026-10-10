import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import { createFakeDownloader } from './fakeDownloader';
import type { ModelDownloader } from './modelLibrary';
import {
  createLazySpeech,
  createModelDownloader,
  createPickedExtractor,
  createPickedSpeech,
} from './modelPorts';
import type { VoiceFillModel } from './modelRegistry';
import type { ExtractorPort, SpeechPort } from './ports';

/** A speech port that says what was asked of it. */
const spiedSpeech = (transcript = 'Sixteen pound brisket.') => {
  const fake = createFakeSpeech({ transcript, wordIntervalMs: 100 });
  const port = {
    load: jest.fn(fake.load),
    start: jest.fn(fake.start),
    stop: jest.fn(fake.stop),
    unload: jest.fn(fake.unload),
  };
  return port;
};

describe('a speech port whose adapter is loaded only when needed', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('the adapter is not imported until the port is asked to load', async () => {
    const adapter = jest.fn(() => Promise.resolve<SpeechPort>(spiedSpeech()));
    const speech = createLazySpeech(adapter);
    expect(adapter).not.toHaveBeenCalled();

    await speech.load();

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  test('it is imported once, however often the port is used', async () => {
    const inner = spiedSpeech();
    const adapter = jest.fn(() => Promise.resolve<SpeechPort>(inner));
    const speech = createLazySpeech(adapter);
    const onPartial = jest.fn();

    await speech.load();
    await speech.start(onPartial, ['Brisket']);
    jest.advanceTimersByTime(100);
    const transcript = await speech.stop();
    await speech.load();
    await speech.unload();

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(inner.start).toHaveBeenCalledWith(onPartial, ['Brisket']);
    expect(onPartial).toHaveBeenCalledWith('Sixteen');
    expect(transcript).toBe('Sixteen pound brisket.');
    expect(inner.unload).toHaveBeenCalledTimes(1);
  });

  test('stopping or letting go of one that was never loaded imports nothing', async () => {
    const adapter = jest.fn(() => Promise.resolve<SpeechPort>(spiedSpeech()));
    const speech = createLazySpeech(adapter);

    expect(await speech.stop()).toBe('');
    await speech.unload();

    expect(adapter).not.toHaveBeenCalled();
  });

  test('an import that failed is a failed load, and is tried again by the next', async () => {
    const inner = spiedSpeech();
    const adapter = jest
      .fn<Promise<SpeechPort>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(inner);
    const speech = createLazySpeech(adapter);

    await expect(speech.load()).rejects.toThrow('offline');
    await expect(speech.unload()).resolves.toBeUndefined();
    await speech.load();

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(inner.load).toHaveBeenCalledTimes(1);
  });
});

describe('the speech port of the picked model', () => {
  test('hears with the model that is picked when it is loaded', async () => {
    const first = spiedSpeech();
    const second = spiedSpeech('Post oak.');
    let picked: string | null = 'first';
    const speech = createPickedSpeech(() => picked, { first, second });

    await speech.load();
    await speech.start(() => undefined, ['Flat']);
    expect(await speech.stop()).toBe('Sixteen pound brisket.');
    expect(first.start).toHaveBeenCalledWith(expect.any(Function), ['Flat']);
    expect(second.load).not.toHaveBeenCalled();

    picked = 'second';
    await speech.load();
    await speech.start(() => undefined);
    expect(await speech.stop()).toBe('Post oak.');
  });

  test('the model picked before is let go when another is loaded', async () => {
    const first = spiedSpeech();
    const second = spiedSpeech();
    let picked = 'first';
    const speech = createPickedSpeech(() => picked, { first, second });
    await speech.load();

    picked = 'second';
    await speech.load();

    expect(first.unload).toHaveBeenCalledTimes(1);
    expect(second.unload).not.toHaveBeenCalled();

    await speech.unload();
    expect(second.unload).toHaveBeenCalledTimes(1);
  });

  test('a pick that changes mid-Ramble does not change who is listening', async () => {
    const first = spiedSpeech();
    const second = spiedSpeech('Post oak.');
    let picked = 'first';
    const speech = createPickedSpeech(() => picked, { first, second });
    await speech.load();
    await speech.start(() => undefined);

    picked = 'second';

    expect(await speech.stop()).toBe('Sixteen pound brisket.');
    expect(second.stop).not.toHaveBeenCalled();
  });

  test.each([
    ['no model is picked', null],
    ['the picked model has no adapter', 'unknown'],
    ['the picked id is not a model at all', 'toString'],
  ])('fails to load when %s', async (_why, picked) => {
    const speech = createPickedSpeech(() => picked, { first: spiedSpeech() });

    await expect(speech.load()).rejects.toThrow('No speech model');
  });

  test('before anything was loaded it cannot listen, and has nothing to stop or let go', async () => {
    const first = spiedSpeech();
    const speech = createPickedSpeech(() => 'first', { first });

    await expect(speech.start(() => undefined)).rejects.toThrow('not loaded');
    expect(await speech.stop()).toBe('');
    await speech.unload();
    expect(first.unload).not.toHaveBeenCalled();
  });
});

describe('the extractor port of the picked model', () => {
  const NOW = { now: new Date('2026-10-09T12:00:00Z') };
  const spiedExtractor = (raw: Record<string, unknown>): jest.Mocked<ExtractorPort> => {
    const fake = createFakeExtractor({ raw });
    return {
      load: jest.fn(fake.load),
      extract: jest.fn(fake.extract),
      unload: jest.fn(fake.unload),
    };
  };

  test('reads with the model that is picked when it is loaded', async () => {
    const first = spiedExtractor({ weight: 16 });
    const second = spiedExtractor({ weight: 9 });
    let picked: string | null = 'first';
    const extractor = createPickedExtractor(() => picked, { first, second });

    await extractor.load();
    expect(await extractor.extract('preSmoke', 'Sixteen pounds.', NOW)).toEqual({ weight: 16 });
    expect(first.extract).toHaveBeenCalledWith('preSmoke', 'Sixteen pounds.', NOW);
    expect(second.load).not.toHaveBeenCalled();

    picked = 'second';
    await extractor.load();
    expect(await extractor.extract('preSmoke', 'Nine pounds.', NOW)).toEqual({ weight: 9 });
    // The model picked before is not kept in memory beside the new one.
    expect(first.unload).toHaveBeenCalledTimes(1);

    await extractor.unload();
    expect(second.unload).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['no extraction model is registered, so none is picked', null],
    ['the picked model has no adapter', 'unknown'],
    ['the picked id is not a model at all', 'toString'],
  ])('fails to load when %s', async (_why, picked) => {
    const extractor = createPickedExtractor(() => picked, {});

    await expect(extractor.load()).rejects.toThrow('No extraction model');
  });

  test('before anything was loaded it cannot read, and has nothing to let go', async () => {
    const first = spiedExtractor({ weight: 16 });
    const extractor = createPickedExtractor(() => 'first', { first });

    await expect(extractor.extract('preSmoke', 'Sixteen pounds.', NOW)).rejects.toThrow(
      'not loaded'
    );
    await expect(extractor.unload()).resolves.toBeUndefined();
    expect(first.unload).not.toHaveBeenCalled();
  });
});

describe('one downloader over several', () => {
  const REAL: VoiceFillModel = { id: 'real', role: 'speech', name: 'Real', sizeBytes: 10 };
  const SCRIPTED: VoiceFillModel = { id: 'scripted', role: 'speech', name: 'S', sizeBytes: 10 };
  const spied = (): jest.Mocked<ModelDownloader> => {
    const fake = createFakeDownloader();
    return {
      download: jest.fn(fake.download),
      testLoad: jest.fn(fake.testLoad),
      has: jest.fn(fake.has),
      remove: jest.fn(fake.remove),
    };
  };

  test('each model goes through the downloader listed for it, and the rest through the fallback', async () => {
    const real = spied();
    const fallback = spied();
    const downloader = createModelDownloader({ real }, fallback);

    await downloader.testLoad(REAL);
    await downloader.has(REAL);
    await downloader.remove(REAL);
    await downloader.testLoad(SCRIPTED);
    await downloader.has(SCRIPTED);
    await downloader.remove(SCRIPTED);

    expect(real.testLoad).toHaveBeenCalledWith(REAL);
    expect(real.has).toHaveBeenCalledWith(REAL);
    expect(real.remove).toHaveBeenCalledWith(REAL);
    expect(fallback.testLoad).toHaveBeenCalledWith(SCRIPTED);
    expect(fallback.has).toHaveBeenCalledWith(SCRIPTED);
    expect(fallback.remove).toHaveBeenCalledWith(SCRIPTED);
    expect(real.testLoad).toHaveBeenCalledTimes(1);
    expect(fallback.testLoad).toHaveBeenCalledTimes(1);
  });

  test('a download is handed on with its progress and its stop', async () => {
    const real = spied();
    real.download.mockResolvedValue(undefined);
    const downloader = createModelDownloader({ real }, spied());
    const options = { onProgress: jest.fn(), signal: new AbortController().signal };

    await downloader.download(REAL, options);

    expect(real.download).toHaveBeenCalledWith(REAL, options);
  });
});
