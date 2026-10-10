import '@testing-library/jest-dom';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import type { PreSmoke } from '../api/types';
import { DesignSurface, appTheme } from '../theme';
import type { VoiceFillState } from './session';
import { VoiceFillSheet } from './VoiceFillSheet';

const renderSheet = (state: VoiceFillState<PreSmoke>) =>
  render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <VoiceFillSheet
          screen="preSmoke"
          state={state}
          onDoneTalking={() => undefined}
          onToggle={() => undefined}
          onFill={() => undefined}
          onRetry={() => undefined}
          onFixText={() => undefined}
          onRedo={() => undefined}
          onClose={() => undefined}
        />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('the Voice Fill sheet before the microphone is open', () => {
  test('says it is getting ready, and does not ask the cook to talk', () => {
    renderSheet({ phase: 'listening', transcript: '', gettingReady: true });

    const sheet = screen.getByRole('dialog', { name: 'Voice fill Pre-smoke' });
    expect(within(sheet).getByRole('heading', { name: 'Getting ready…' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('heading', { name: 'Listening…' })).not.toBeInTheDocument();
    expect(within(sheet).queryByText('Start talking…')).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId('voice-fill-level-bars')).not.toBeInTheDocument();
    // Nothing has been said that could be done with.
    expect(within(sheet).getByRole('button', { name: 'Done talking' })).toBeDisabled();
    // The way out is still there.
    expect(within(sheet).getByTestId('voice-fill-close')).toBeEnabled();
  });

  test('says it is listening once the microphone is open', () => {
    renderSheet({ phase: 'listening', transcript: '' });

    const sheet = screen.getByRole('dialog', { name: 'Voice fill Pre-smoke' });
    expect(within(sheet).getByRole('heading', { name: 'Listening…' })).toBeInTheDocument();
    expect(within(sheet).getByText('Start talking…')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Done talking' })).toBeEnabled();
  });
});
