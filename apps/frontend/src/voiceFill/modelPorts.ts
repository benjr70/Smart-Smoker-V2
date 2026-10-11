/**
 * What joins the Model library to the ports a Ramble runs through: the speech
 * port that hears, and the extractor port that reads, with whichever model is
 * picked, the port that does not load its adapter's code until it is asked to,
 * and the downloader that fetches each model through the one that knows where
 * its files are.
 */
import type { ModelDownloader } from './modelLibrary';
import type { ExtractorPort, SpeechPort } from './ports';

/**
 * A speech port over an adapter that is not imported until the port is first
 * asked to load: what keeps a model's runtime in a chunk of its own, fetched
 * only by a cook who taps the button with that model picked.
 */
export const createLazySpeech = (adapter: () => Promise<SpeechPort>): SpeechPort => {
  let imported: Promise<SpeechPort> | undefined;
  const port = (): Promise<SpeechPort> => {
    if (!imported) {
      const importing = adapter();
      imported = importing;
      // An import that failed — the phone was offline — is tried again.
      importing.catch(() => {
        if (imported === importing) {
          imported = undefined;
        }
      });
    }
    return imported;
  };
  return {
    load: () => port().then(speech => speech.load()),
    start: (onPartial, keyTerms) => port().then(speech => speech.start(onPartial, keyTerms)),
    // An adapter that was never imported is neither listening nor loaded.
    stop: () => (imported ? imported.then(speech => speech.stop()) : Promise.resolve('')),
    unload: () =>
      imported
        ? imported.then(
            speech => speech.unload(),
            () => undefined
          )
        : Promise.resolve(),
  };
};

/**
 * An extractor port over an adapter that is not imported until the port is
 * first asked to load or to extract: what keeps a model's runtime in a chunk
 * of its own, fetched only by a cook who taps the button with that model
 * picked.
 */
export const createLazyExtractor = (adapter: () => Promise<ExtractorPort>): ExtractorPort => {
  let imported: Promise<ExtractorPort> | undefined;
  const port = (): Promise<ExtractorPort> => {
    if (!imported) {
      const importing = adapter();
      imported = importing;
      // An import that failed — the phone was offline — is tried again.
      importing.catch(() => {
        if (imported === importing) {
          imported = undefined;
        }
      });
    }
    return imported;
  };
  return {
    load: () => port().then(extractor => extractor.load()),
    extract: (screen, transcript, context) =>
      port().then(extractor => extractor.extract(screen, transcript, context)),
    // An adapter that was never imported has loaded nothing.
    unload: () =>
      imported
        ? imported.then(
            extractor => extractor.unload(),
            () => undefined
          )
        : Promise.resolve(),
  };
};

/**
 * The speech port of whichever model the Model library has picked: `picked`
 * is asked each time the port is loaded, so the next Ramble after a change of
 * model in Settings is heard by the new one. The model a Ramble started with
 * hears the whole of it.
 */
export const createPickedSpeech = (
  picked: () => string | null,
  adapters: Readonly<Record<string, SpeechPort>>
): SpeechPort => {
  let inUse: SpeechPort | undefined;
  return {
    load: async () => {
      const id = picked();
      const wanted =
        id !== null && Object.prototype.hasOwnProperty.call(adapters, id)
          ? adapters[id]
          : undefined;
      if (!wanted) {
        throw new Error('No speech model that can be run is picked.');
      }
      if (inUse && inUse !== wanted) {
        // The model picked before is not kept in memory beside the new one.
        await inUse.unload().catch(() => undefined);
      }
      inUse = wanted;
      return wanted.load();
    },
    start: (onPartial, keyTerms) =>
      inUse
        ? inUse.start(onPartial, keyTerms)
        : Promise.reject(new Error('The speech model was not loaded.')),
    stop: () => (inUse ? inUse.stop() : Promise.resolve('')),
    unload: () => (inUse ? inUse.unload() : Promise.resolve()),
  };
};

/**
 * The extractor port of whichever model the Model library has picked, asked
 * each time the port is loaded as {@link createPickedSpeech} is.
 *
 * Where the picked extraction model has no adapter the port fails to load: a
 * Ramble that was heard cannot be read, which the session shows as a problem
 * with what was heard kept.
 */
export const createPickedExtractor = (
  picked: () => string | null,
  adapters: Readonly<Record<string, ExtractorPort>>
): ExtractorPort => {
  let inUse: ExtractorPort | undefined;
  return {
    load: async () => {
      const id = picked();
      const wanted =
        id !== null && Object.prototype.hasOwnProperty.call(adapters, id)
          ? adapters[id]
          : undefined;
      if (!wanted) {
        throw new Error('No extraction model that can be run is picked.');
      }
      if (inUse && inUse !== wanted) {
        // The model picked before is not kept in memory beside the new one.
        await inUse.unload().catch(() => undefined);
      }
      inUse = wanted;
      return wanted.load();
    },
    extract: (screen, transcript, context) =>
      inUse
        ? inUse.extract(screen, transcript, context)
        : Promise.reject(new Error('The extraction model was not loaded.')),
    unload: () => (inUse ? inUse.unload() : Promise.resolve()),
  };
};

/**
 * One downloader over several: each model is fetched, proven and deleted
 * through the downloader listed under its id, and through `fallback` where
 * none is.
 */
export const createModelDownloader = (
  downloaders: Readonly<Record<string, ModelDownloader>>,
  fallback: ModelDownloader
): ModelDownloader => {
  const of = (id: string): ModelDownloader =>
    Object.prototype.hasOwnProperty.call(downloaders, id) ? downloaders[id] : fallback;
  return {
    download: (model, options) => of(model.id).download(model, options),
    testLoad: model => of(model.id).testLoad(model),
    has: model => of(model.id).has(model),
    remove: model => of(model.id).remove(model),
  };
};
