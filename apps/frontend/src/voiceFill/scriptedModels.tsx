import React, { useMemo } from 'react';
import { createFakeExtractor, createFakeSpeech } from './fakeAdapters';
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

/** What the page's address carries to ask for the scripted models. */
export const SCRIPTED_MODELS_QUERY = 'voiceFill=scripted';

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
  children: React.ReactNode;
}

/**
 * The models Voice Fill runs on, for every screen under the application root.
 *
 * Until the real adapters land there is one set to hand out: the scripted
 * ones, and only where {@link scriptedModelsAreOn}. Anywhere else nothing is
 * provided, and so no screen offers Voice Fill.
 */
export function VoiceFillModels({ children }: VoiceFillModelsProps): JSX.Element {
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
  return ports ? (
    <VoiceFillPortsProvider {...ports}>{children}</VoiceFillPortsProvider>
  ) : (
    <>{children}</>
  );
}
