/**
 * Test support for the smoke wizard and its steps: the one place the provider
 * tower the application root mounts them under is rebuilt for a suite, so a
 * provider the root gains is added here once rather than in every suite.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { RenderResult, render } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { FakeBackend } from '../../api/fakeBackend';
import { DesignSurface, appTheme } from '../../theme';
import {
  ExtractorPort,
  VoiceFillPortsProvider,
  createFakeExtractor,
  createFakeSpeech,
} from '../../voiceFill';

/** What Voice Fill's two scripted models hear and answer. */
export interface VoiceFillScript {
  /** What the scripted speech model hears. */
  transcript: string;
  /** What the scripted extractor makes of it. */
  raw: unknown;
  /** How long each scripted word takes to arrive, in ms. */
  wordIntervalMs?: number;
  /** How long the scripted model takes to answer, in ms. */
  delayMs?: number;
  /** How many of the scripted model's first answers are failures. */
  failures?: number;
  /** What the scripted model makes of particular transcripts, in place of `raw`. */
  rawByTranscript?: Record<string, unknown>;
  /** Whether the cook lets the page use the microphone. */
  microphone?: 'allowed' | 'blocked';
}

/**
 * The scripted extractor. It answers every transcript alike; the ones a suite
 * wants read differently are told apart here, in front of it.
 */
const scriptedExtractor = ({
  raw,
  delayMs,
  failures,
  rawByTranscript = {},
}: VoiceFillScript): ExtractorPort => {
  const scripted = createFakeExtractor({ raw, delayMs, failures });
  return {
    ...scripted,
    extract: (asked, transcript, context) =>
      Object.prototype.hasOwnProperty.call(rawByTranscript, transcript)
        ? Promise.resolve(rawByTranscript[transcript])
        : scripted.extract(asked, transcript, context),
  };
};

export interface SmokeScreenRenderOptions {
  /** The backend the screen reads and writes. */
  backend: FakeBackend;
  /**
   * Voice Fill's models, as scripted ones behind the same ports. Left out, no
   * models are provided, which is a screen with no Voice Fill.
   */
  voiceFill?: VoiceFillScript;
}

/** Renders `ui` as the application root mounts the smoke screens. */
export const renderSmokeScreen = (
  ui: JSX.Element,
  { backend, voiceFill }: SmokeScreenRenderOptions
): RenderResult =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={createApiClient(backend)}>
          <SnackbarProvider>
            {voiceFill ? (
              <VoiceFillPortsProvider
                speech={createFakeSpeech({
                  transcript: voiceFill.transcript,
                  wordIntervalMs: voiceFill.wordIntervalMs,
                  microphone: voiceFill.microphone,
                })}
                extractor={scriptedExtractor(voiceFill)}
              >
                {ui}
              </VoiceFillPortsProvider>
            ) : (
              ui
            )}
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
