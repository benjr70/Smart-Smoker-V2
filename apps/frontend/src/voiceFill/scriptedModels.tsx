import React, { useMemo } from 'react';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
import { createFakeDownloader } from './fakeDownloader';
import type { ModelLibrary } from './modelLibrary';
import { createModelLibrary } from './modelLibrary';
import { ModelLibraryProvider } from './ModelLibraryProvider';
import type { VoiceFillModel } from './modelRegistry';
import { createModelRegistry } from './modelRegistry';
import { browserConnection, canRunVoiceFill } from './phoneEnvironment';
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
 * The phone's Model library over the scripted models: the real library and the
 * browser's own storage and connection, with a downloader that fetches nothing.
 *
 * The phone is checked as it is for real models, with `canRunVoiceFill`: with
 * no microphone API, no WebGPU adapter or a page that is not cross-origin
 * isolated there is no button, no pill and no settings card, and nothing
 * starts downloading. Only a run that says {@link SCRIPTED_PHONE_QUERY} skips
 * the check.
 */
const createScriptedModelLibrary = (): ModelLibrary =>
  createModelLibrary({
    registry: createModelRegistry(SCRIPTED_MODELS),
    downloader: createFakeDownloader({ storage: window.localStorage }),
    storage: window.localStorage,
    storageKey: SCRIPTED_MODEL_LIBRARY_STORAGE_KEY,
    connection: browserConnection(),
    capabilities: () => (scriptedPhoneIsCapable() ? Promise.resolve(true) : canRunVoiceFill()),
  });

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
 * Until the real adapters land there is one set to hand out: the scripted
 * ones, and only where {@link scriptedModelsAreOn}. Anywhere else nothing is
 * provided, and so no screen offers Voice Fill.
 */
export function VoiceFillModels({ onOpenSettings, children }: VoiceFillModelsProps): JSX.Element {
  const ports = useMemo<VoiceFillPorts | null>(
    () =>
      scriptedModelsAreOn()
        ? {
            speech: createFakeSpeech({ transcript: SCRIPTED_RAMBLE.transcript }),
            extractor: createFakeExtractor({
              raw: SCRIPTED_RAMBLE.raw,
              delayMs: SCRIPTED_RAMBLE.extractDelayMs,
            }),
          }
        : null,
    []
  );
  const library = useMemo(() => (ports ? createScriptedModelLibrary() : null), [ports]);
  return ports && library ? (
    <ModelLibraryProvider library={library} onOpenSettings={onOpenSettings}>
      <VoiceFillPortsProvider {...ports}>{children}</VoiceFillPortsProvider>
    </ModelLibraryProvider>
  ) : (
    <>{children}</>
  );
}
