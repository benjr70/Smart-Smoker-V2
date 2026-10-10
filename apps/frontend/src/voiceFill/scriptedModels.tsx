import React, { useMemo } from 'react';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import { createFakeDownloader } from './fakeDownloader';
import { createGemmaDownloader, createGemmaExtractor } from './gemmaModel';
import type { ModelLibrary } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { ModelLibraryProvider } from './ModelLibraryProvider';
import { createModelDownloader, createPickedExtractor, createPickedSpeech } from './modelPorts';
import type { VoiceFillModel } from './modelRegistry';
import { GEMMA_4_E2B, MOONSHINE_SMALL_STREAMING, createModelRegistry } from './modelRegistry';
import { createMoonshineDownloader, createMoonshineSpeech } from './moonshineModel';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';
import type { ExtractorPort, SpeechPort } from './ports';
import { createRealModelLibrary, createRealPorts } from './realModels';
import type { VoiceFillPorts } from './VoiceFillPortsProvider';
import { VoiceFillPortsProvider } from './VoiceFillPortsProvider';

/**
 * The one Ramble the scripted models hear, and what they make of it: enough to
 * walk a screen through listening, working, review, fill and Undo with no model
 * downloaded and no microphone.
 */
export const SCRIPTED_RAMBLE = {
  transcript: 'Sixteen pound brisket. Trimmed the fat cap, then mustard binder.',
  raw: {
    meatType: 'brisket',
    weight: 16,
    steps: ['trimmed the fat cap', 'mustard binder'],
  },
  /**
   * What they make of it on the smoke screen, which has other fields to fill: a
   * probe name, the wood, a target, the Serve Plan, a stamp and Notes — one of
   * each kind of thing that screen writes.
   */
  smokeRaw: {
    probe1Name: 'Flat',
    woodType: 'hickory',
    probeTargets: [{ probe: 'probe one', target: 203 }],
    serveInMinutes: 240,
    restMinutes: 45,
    stamps: [{ stamp: 'wrap' }],
    notes: 'Bark is setting nicely.',
  },
  /** Long enough for the working state to be seen before the review list. */
  extractDelayMs: 1200,
} as const;

/**
 * What the Model library lists where the scripted models are on: two of each
 * role, sized like the real default pair, so the settings card and the grey
 * pill can be walked through every download state with nothing fetched.
 */
export const SCRIPTED_MODELS: readonly VoiceFillModel[] = [
  { id: 'scripted-speech', role: 'speech', name: 'Scripted speech', sizeBytes: 158_000_000 },
  { id: 'scripted-speech-b', role: 'speech', name: 'Scripted speech B', sizeBytes: 64_000_000 },
  {
    id: 'scripted-extractor',
    role: 'extractor',
    name: 'Scripted extractor',
    sizeBytes: 1_900_000_000,
  },
  {
    id: 'scripted-extractor-b',
    role: 'extractor',
    name: 'Scripted extractor B',
    sizeBytes: 1_100_000_000,
  },
];

/**
 * What the scripted Model library's record is kept under: not the key a
 * library over real models uses, so what a scripted run leaves on a phone is
 * never read as the state of real downloads.
 */
export const SCRIPTED_MODEL_LIBRARY_STORAGE_KEY = 'voiceFill.scriptedModelLibrary';

/** What the page's address carries to ask for the scripted models. */
export const SCRIPTED_MODELS_QUERY = 'voiceFill=scripted';

/**
 * What the page's address carries, beside {@link SCRIPTED_MODELS_QUERY}, to
 * have the phone taken as able to run Voice Fill without being checked.
 */
export const SCRIPTED_PHONE_QUERY = 'voiceFillPhone=capable';

/**
 * Whether a scripted run asked for the phone to be taken as able to run Voice
 * Fill. The scripted models themselves need no WebGPU, so a journey driven in
 * a browser that has none — a headless one — can say so and still be walked
 * through. It is a part of the scripted run only: nothing reads it where the
 * scripted models are off, and a run that does not ask is checked for real.
 */
export const scriptedPhoneIsCapable = (search: string = window.location.search): boolean =>
  new URLSearchParams(search).get('voiceFillPhone') === 'capable';

/**
 * The phone's Model library where the scripted models are on: the real library
 * and the browser's own storage and connection, over the scripted models and,
 * after them, the real speech model and the real extraction model. The
 * scripted ones stay the pair a fresh phone gets, with a downloader that
 * fetches nothing; the real ones are there to be picked, and are then
 * downloaded and run for real, each beside a scripted model of the other role
 * or beside the other real one.
 *
 * The phone is checked as it is for real models, with `canRunVoiceFill`: with
 * no microphone API, no WebGPU adapter or a page that is not cross-origin
 * isolated there is no button, no pill and no settings card, and nothing
 * starts downloading. Only a run that says {@link SCRIPTED_PHONE_QUERY} skips
 * the check.
 */
const createScriptedModelLibrary = (): ModelLibrary =>
  createModelLibrary({
    registry: createModelRegistry([...SCRIPTED_MODELS, MOONSHINE_SMALL_STREAMING, GEMMA_4_E2B]),
    downloader: createModelDownloader(
      {
        [MOONSHINE_SMALL_STREAMING.id]: createMoonshineDownloader(),
        [GEMMA_4_E2B.id]: createGemmaDownloader(),
      },
      createFakeDownloader({ storage: window.localStorage })
    ),
    storage: window.localStorage,
    storageKey: SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
    connection: browserConnection(),
    capabilities: () => (scriptedPhoneIsCapable() ? Promise.resolve(true) : canRunVoiceFill()),
  });

/**
 * The two ports where the scripted models are on. The Ramble is heard by
 * whichever speech model `library` has picked: the scripted one, which plays
 * its script, or the real one, which listens to the microphone. It is read by
 * whichever extraction model `library` has picked: the scripted one, which
 * answers with its script, or the real one, which reads what it is given.
 */
const createScriptedPorts = (library: ModelLibrary): VoiceFillPorts => {
  const scriptedSpeech = createFakeSpeech({ transcript: SCRIPTED_RAMBLE.transcript });
  const speechOf: Record<string, SpeechPort> = {
    [MOONSHINE_SMALL_STREAMING.id]: createMoonshineSpeech(),
  };
  SCRIPTED_MODELS.filter(model => model.role === 'speech').forEach(model => {
    speechOf[model.id] = scriptedSpeech;
  });
  const scriptedExtractor = createFakeExtractor({
    raw: SCRIPTED_RAMBLE.raw,
    rawByScreen: { smoke: SCRIPTED_RAMBLE.smokeRaw },
    delayMs: SCRIPTED_RAMBLE.extractDelayMs,
  });
  const extractorOf: Record<string, ExtractorPort> = {
    [GEMMA_4_E2B.id]: createGemmaExtractor(),
  };
  SCRIPTED_MODELS.filter(model => model.role === 'extractor').forEach(model => {
    extractorOf[model.id] = scriptedExtractor;
  });
  return {
    speech: createPickedSpeech(() => library.getState().picked.speech, speechOf),
    extractor: createPickedExtractor(() => library.getState().picked.extractor, extractorOf),
  };
};

/**
 * Whether this page runs Voice Fill on the scripted models, and not on the
 * registered ones every other page gets. Two things have to be true, and a
 * production build can only ever have the second:
 *
 * - the bundle was built with `REACT_APP_VOICE_FILL_SCRIPTED=true` in the env
 *   file webpack bakes in. The published images are built from an env file the
 *   publish workflow writes itself, which does not carry it; the hermetic e2e
 *   stack's (`e2e/docker/frontend.e2e.env`) does.
 * - the page was opened with `?voiceFill=scripted`, so a build that allows the
 *   scripted models still runs the real ones for a journey that did not ask
 *   for them.
 */
export const scriptedModelsAreOn = (search: string = window.location.search): boolean =>
  process.env.REACT_APP_VOICE_FILL_SCRIPTED === 'true' &&
  new URLSearchParams(search).get('voiceFill') === 'scripted';

export interface VoiceFillModelsProps {
  /** Shows the settings screen: where the grey pill sends the user. */
  onOpenSettings?: () => void;
  children: React.ReactNode;
}

/**
 * The models Voice Fill runs on, and the phone's Model library of them, for
 * every screen under the application root. The library is opened here, so the
 * download a first opening of the app starts does not wait for any one screen.
 *
 * Everywhere but where {@link scriptedModelsAreOn} it is the real models that
 * are handed out — see `realModels.ts`: the real speech model and the real
 * extraction model. Both are downloaded the first time the app is opened on a
 * phone that can run them, the settings card shows a dropdown for each, the
 * button appears once the pair is ready, and a Ramble is heard live and then
 * read.
 *
 * Where the scripted models are on, it is those, with the real speech model
 * and the real extraction model beside them.
 */
export function VoiceFillModels({ onOpenSettings, children }: VoiceFillModelsProps): JSX.Element {
  const { library, ports } = useMemo<{ library: ModelLibrary; ports: VoiceFillPorts }>(() => {
    if (scriptedModelsAreOn()) {
      const scripted = createScriptedModelLibrary();
      return { library: scripted, ports: createScriptedPorts(scripted) };
    }
    const real = createRealModelLibrary();
    return { library: real, ports: createRealPorts(real) };
  }, []);
  return (
    <ModelLibraryProvider library={library} onOpenSettings={onOpenSettings}>
      <VoiceFillPortsProvider {...ports}>{children}</VoiceFillPortsProvider>
    </ModelLibraryProvider>
  );
}
