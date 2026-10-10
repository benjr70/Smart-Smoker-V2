/**
 * The real models Voice Fill runs on, and the phone's Model library of them:
 * what every page is handed but one that asked for the scripted models.
 *
 * Both models of the default pair have landed: Moonshine Small Streaming hears
 * a Ramble and Gemma 4 E2B reads it. Both download the first time the app is
 * opened on a phone that can run them, each through the downloader of its own
 * adapter. A phone that opened the app while the speech model was the only one
 * registered has had its first opening, so the extraction model is not
 * downloaded by itself there: it is asked for on the settings card.
 *
 * Nothing of a model's runtime is reached from here but through its lazy
 * import, so a phone that downloads no model fetches no runtime either.
 */
import { createGemmaDownloader, createGemmaExtractor } from './gemmaModel';
import type { ModelDownloader, ModelLibrary } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { createModelDownloader, createPickedExtractor, createPickedSpeech } from './modelPorts';
import {
  GEMMA_4_E2B,
  MOONSHINE_SMALL_STREAMING,
  REGISTERED_MODELS,
  createModelRegistry,
} from './modelRegistry';
import { createMoonshineDownloader, createMoonshineSpeech } from './moonshineModel';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';
import type { VoiceFillPorts } from './VoiceFillPortsProvider';

/**
 * What a registered model with no downloader of its own is fetched through:
 * nothing. Every adapter Slice lists its downloader beside its model, so this
 * is reached only by a model registered without one, which then never arrives.
 */
const NO_DOWNLOADER: ModelDownloader = {
  download: () => Promise.reject(new Error('This model has no downloader.')),
  testLoad: () => Promise.resolve(false),
  has: () => Promise.resolve(false),
  remove: () => Promise.resolve(),
};

/**
 * The phone's Model library over the registered models, in the browser's own
 * storage, each model fetched and proven by the downloader of its own adapter.
 * The phone is checked with `canRunVoiceFill`: where it cannot run Voice Fill
 * there is no button, no pill and no settings card, and nothing is downloaded.
 */
export const createRealModelLibrary = (): ModelLibrary =>
  createModelLibrary({
    registry: createModelRegistry(REGISTERED_MODELS),
    downloader: createModelDownloader(
      {
        [MOONSHINE_SMALL_STREAMING.id]: createMoonshineDownloader(),
        [GEMMA_4_E2B.id]: createGemmaDownloader(),
      },
      NO_DOWNLOADER
    ),
    storage: window.localStorage,
    connection: browserConnection(),
    capabilities: () => canRunVoiceFill(),
  });

/**
 * The two ports over whichever models `library` has picked: a Ramble is heard
 * by the picked speech model and read by the picked extraction model.
 */
export const createRealPorts = (library: ModelLibrary): VoiceFillPorts => ({
  speech: createPickedSpeech(() => library.getState().picked.speech, {
    [MOONSHINE_SMALL_STREAMING.id]: createMoonshineSpeech(),
  }),
  extractor: createPickedExtractor(() => library.getState().picked.extractor, {
    [GEMMA_4_E2B.id]: createGemmaExtractor(),
  }),
});
