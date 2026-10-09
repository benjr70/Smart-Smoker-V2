import React, { useMemo } from 'react';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibrary } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { ModelLibraryProvider } from './ModelLibraryProvider';
import { createModelDownloader, createPickedSpeech } from './modelPorts';
import type { VoiceFillModel } from './modelRegistry';
import { MOONSHINE_SMALL_STREAMING, createModelRegistry } from './modelRegistry';
import { createMoonshineDownloader, createMoonshineSpeech } from './moonshineModel';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';
import type { SpeechPort } from './ports';
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
 * after them, the real speech model. The scripted ones stay the pair a fresh
 * phone gets, with a downloader that fetches nothing; the real one is there to
 * be picked, and is then downloaded and run for real, so it can be heard
 * working in a build that has no real extraction model to pair it with.
 *
 * The phone is checked as it is for real models, with `canRunVoiceFill`: with
 * no microphone API, no WebGPU adapter or a page that is not cross-origin
 * isolated there is no button, no pill and no settings card, and nothing
 * starts downloading. Only a run that says {@link SCRIPTED_PHONE_QUERY} skips
 * the check.
 */
const createScriptedModelLibrary = (): ModelLibrary =>
  createModelLibrary({
    registry: createModelRegistry([...SCRIPTED_MODELS, MOONSHINE_SMALL_STREAMING]),
    downloader: createModelDownloader(
      { [MOONSHINE_SMALL_STREAMING.id]: createMoonshineDownloader() },
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
 * its script, or the real one, which listens to the microphone. Whatever was
 * heard, it is the scripted extractor that reads it.
 */
const createScriptedPorts = (library: ModelLibrary): VoiceFillPorts => {
  const scriptedSpeech = createFakeSpeech({ transcript: SCRIPTED_RAMBLE.transcript });
  const speechOf: Record<string, SpeechPort> = {
    [MOONSHINE_SMALL_STREAMING.id]: createMoonshineSpeech(),
  };
  SCRIPTED_MODELS.filter(model => model.role === 'speech').forEach(model => {
    speechOf[model.id] = scriptedSpeech;
  });
  return {
    speech: createPickedSpeech(() => library.getState().picked.speech, speechOf),
    extractor: createFakeExtractor({
      raw: SCRIPTED_RAMBLE.raw,
      rawByScreen: { smoke: SCRIPTED_RAMBLE.smokeRaw },
      delayMs: SCRIPTED_RAMBLE.extractDelayMs,
    }),
  };
};

/**
 * Whether this page runs Voice Fill on the scripted models. Two things have to
 * be true, and a production build can only ever have the second:
 *
 * - the bundle was built with `REACT_APP_VOICE_FILL_SCRIPTED=true` in the env
 *   file webpack bakes in. The published images are built from an env file the
 *   publish workflow writes itself, which does not carry it; the hermetic e2e
 *   stack's (`e2e/docker/frontend.e2e.env`) does.
 * - the page was opened with `?voiceFill=scripted`, so a build that allows the
 *   scripted models still shows nothing of Voice Fill to a journey that did
 *   not ask for it.
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
 * The real speech model has landed and the real extraction model has not, so
 * there is still one set to hand out: the scripted ones, with the real speech
 * model beside them, and only where {@link scriptedModelsAreOn}. Anywhere else
 * nothing is provided, and so no screen offers Voice Fill.
 */
export function VoiceFillModels({ onOpenSettings, children }: VoiceFillModelsProps): JSX.Element {
  const library = useMemo(() => (scriptedModelsAreOn() ? createScriptedModelLibrary() : null), []);
  const ports = useMemo<VoiceFillPorts | null>(
    () => (library ? createScriptedPorts(library) : null),
    [library]
  );
  return ports && library ? (
    <ModelLibraryProvider library={library} onOpenSettings={onOpenSettings}>
      <VoiceFillPortsProvider {...ports}>{children}</VoiceFillPortsProvider>
    </ModelLibraryProvider>
  ) : (
    <>{children}</>
  );
}
