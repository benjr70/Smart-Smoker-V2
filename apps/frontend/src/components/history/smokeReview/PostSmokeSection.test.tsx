/**
 * Section 3 of the history detail: what happened after the cook. The rest is
 * humanized from the wizard's HH:MM — "1h 30m", never "01:30" — with the post
 * steps and notes below it.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PostSmoke } from '../../../api/types';
import { DesignSurface, appTheme } from '../../../theme';
import { PostSmokeSection } from './PostSmokeSection';

const showSection = (postSmoke: PostSmoke) =>
  render(
    <CssVarsProvider theme={appTheme} defaultMode="light">
      <DesignSurface>
        <PostSmokeSection postSmoke={postSmoke} />
      </DesignSurface>
    </CssVarsProvider>
  );

describe('the post-smoke section', () => {
  it('humanizes the rest and lists what was done', () => {
    showSection({
      restTime: '01:30',
      steps: ['Wrap in towels', 'Rest in cooler'],
      notes: 'Sliced like butter.',
    });

    const rest = screen
      .getAllByTestId('field-grid-field')
      .find(field => field.textContent?.includes('Rest Time'));
    expect(rest).toHaveTextContent('1h 30m');
    expect(rest).not.toHaveTextContent('01:30');

    const steps = screen.getAllByTestId('step-list-step');
    expect(steps[0]).toHaveTextContent('Wrap in towels');
    expect(steps[1]).toHaveTextContent('Rest in cooler');
    expect(screen.getByTestId('note-block')).toHaveTextContent('Sliced like butter.');
  });

  it('admits a record with no rest as an em-dash', () => {
    showSection({ restTime: '', steps: [] });

    const rest = screen
      .getAllByTestId('field-grid-field')
      .find(field => field.textContent?.includes('Rest Time'));
    expect(rest).toHaveTextContent('—');
  });
});
