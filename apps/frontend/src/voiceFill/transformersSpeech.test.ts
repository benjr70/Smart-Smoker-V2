import { isMicrophoneBlocked } from './ports';
import type { BatchTranscriber, Recorder } from './transformersSpeech';
import { createBatchSpeech } from './transformersSpeech';

const AUDIO = Float32Array.from([0.1, -0.2, 0.3]);

/** A microphone that records `audio` each time it is opened, and says what was done to it. */
const microphone = (audio: Float32Array = AUDIO) => {
  const stops: jest.Mock[] = [];
  const recorder: Recorder & { open: jest.Mock } = {
    open: jest.fn(() => {
      const stop = jest.fn(() => audio);
      stops.push(stop);
      return Promise.resolve({ stop });
    }),
  };
  return { recorder, stops };
};

/** A model that transcribes whatever it is given as `said`. */
const model = (said = ' Sixteen pound brisket. ') => {
  const transcriber: BatchTranscriber & { transcribe: jest.Mock; dispose: jest.Mock } = {
    transcribe: jest.fn(() => Promise.resolve(said)),
    dispose: jest.fn(() => Promise.resolve()),
  };
  const load = jest.fn(() => Promise.resolve<BatchTranscriber>(transcriber));
  return { transcriber, load };
};

describe('a speech model that hears a Ramble all at once', () => {
  it('loads the model once, however often it is asked to', async () => {
    const { load } = model();
    const speech = createBatchSpeech(microphone().recorder, load);

    await speech.load();
    await speech.load();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('records while the cook talks and writes nothing until they are done', async () => {
    const { recorder } = microphone();
    const { transcriber, load } = model();
    const speech = createBatchSpeech(recorder, load);
    const onPartial = jest.fn();

    await speech.load();
    await speech.start(onPartial, ['brisket']);

    expect(recorder.open).toHaveBeenCalledTimes(1);
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(onPartial).not.toHaveBeenCalled();
  });

  it('transcribes the whole recording when the cook is done talking', async () => {
    const { recorder, stops } = microphone();
    const { transcriber, load } = model();
    const speech = createBatchSpeech(recorder, load);

    await speech.start(jest.fn());
    const transcript = await speech.stop();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(transcriber.transcribe).toHaveBeenCalledWith(AUDIO);
    expect(transcript).toBe('Sixteen pound brisket.');
  });

  it('gives nothing, and asks the model nothing, for a Ramble with nothing recorded', async () => {
    const { transcriber, load } = model();
    const speech = createBatchSpeech(microphone(new Float32Array(0)).recorder, load);

    await speech.start(jest.fn());

    expect(await speech.stop()).toBe('');
    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });

  it('gives nothing when it is stopped without having been started', async () => {
    const { load } = model();
    const speech = createBatchSpeech(microphone().recorder, load);

    expect(await speech.stop()).toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it('lets a refused microphone through as the browser refused it, loading no model', async () => {
    const refused = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const { load } = model();
    const speech = createBatchSpeech({ open: () => Promise.reject(refused) }, load);

    const failed = await speech.start(jest.fn()).catch(error => error);

    expect(failed).toBe(refused);
    expect(isMicrophoneBlocked(failed)).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('lets the microphone go when the model cannot be loaded, and tries the load again', async () => {
    const { recorder, stops } = microphone();
    const { transcriber } = model();
    const load = jest
      .fn<Promise<BatchTranscriber>, []>()
      .mockRejectedValueOnce(new Error('no GPU'))
      .mockResolvedValue(transcriber);
    const speech = createBatchSpeech(recorder, load);

    await expect(speech.start(jest.fn())).rejects.toThrow('no GPU');
    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(await speech.stop()).toBe('');

    await speech.start(jest.fn());
    expect(await speech.stop()).toBe('Sixteen pound brisket.');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ends a Ramble still being recorded when another is started', async () => {
    const { recorder, stops } = microphone();
    const speech = createBatchSpeech(recorder, model().load);

    await speech.start(jest.fn());
    await speech.start(jest.fn());

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(stops[1]).not.toHaveBeenCalled();
  });

  it('lets the microphone and the model go when it is unloaded, and loads again after', async () => {
    const { recorder, stops } = microphone();
    const { transcriber, load } = model();
    const speech = createBatchSpeech(recorder, load);

    await speech.start(jest.fn());
    await speech.unload();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(transcriber.dispose).toHaveBeenCalledTimes(1);
    expect(await speech.stop()).toBe('');

    await speech.load();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('has nothing to let go of when it was never loaded', async () => {
    const { load } = model();

    await createBatchSpeech(microphone().recorder, load).unload();

    expect(load).not.toHaveBeenCalled();
  });
});
