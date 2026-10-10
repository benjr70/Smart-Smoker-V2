/**
 * The real models Voice Fill runs on, and the phone's Model library of them:
 * what every page is handed but one that asked for the scripted models.
 *
 * The speech model has landed and the extraction model has not. Until it has,
 * Voice Fill is offered with speech alone: Moonshine downloads the first time
 * the app is opened on a phone that can run it, and a Ramble is heard, live,
 * and then cannot be read — the sheet says Voice Fill hit a problem. A phone
 * that opened the app in that time has had its first opening, so the
 * extraction model is not downloaded by itself when it is registered: it is
 * asked for on the settings card.
 */
import type { ModelLibrary } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { createPickedExtractor, createPickedSpeech } from './modelPorts';
import { MOONSHINE_SMALL_STREAMING, REGISTERED_MODELS, createModelRegistry } from './modelRegistry';
import { createMoonshineDownloader, createMoonshineSpeech } from './moonshineModel';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';
import type { VoiceFillPorts } from './VoiceFillPortsProvider';

/**
 * The phone's Model library over the registered models, in the browser's own
 * storage. The phone is checked with `canRunVoiceFill`: where it cannot run
 * Voice Fill there is no button, no pill and no settings card, and nothing is
 * downloaded.
 */
export const createRealModelLibrary = (): ModelLibrary =>
  createModelLibrary({
    registry: createModelRegistry(REGISTERED_MODELS),
    // The one registered model is Moonshine's: its downloader is the library's.
    // The extraction model brings its own, and `createModelDownloader` with it.
    downloader: createMoonshineDownloader(),
    storage: window.localStorage,
    connection: browserConnection(),
    capabilities: () => canRunVoiceFill(),
  });

/**
 * The two ports over whichever models `library` has picked. No extraction
 * model has an adapter yet, so the extractor port has none to pick from and
 * fails to load.
 */
export const createRealPorts = (library: ModelLibrary): VoiceFillPorts => ({
  speech: createPickedSpeech(() => library.getState().picked.speech, {
    [MOONSHINE_SMALL_STREAMING.id]: createMoonshineSpeech(),
  }),
  extractor: createPickedExtractor(() => library.getState().picked.extractor, {}),
});
