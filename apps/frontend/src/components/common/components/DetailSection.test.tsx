/**
 * One numbered section of the history detail: the design's card with an
 * accent-tinted number badge and an uppercase title, holding whatever the
 * section is about.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface, appTheme } from '../../../theme';
import { DetailSection } from './DetailSection';

describe('a numbered detail section', () => {
  it('shows its number badge, its title and its content', () => {
    render(
      <CssVarsProvider theme={appTheme} defaultMode="light">
        <DesignSurface>
          <DetailSection number="2" title="Smoke" testId="smoke-section">
            <p>the cook itself</p>
          </DetailSection>
        </DesignSurface>
      </CssVarsProvider>
    );

    const section = screen.getByTestId('smoke-section');
    expect(screen.getByTestId('detail-section-number')).toHaveTextContent('2');
    // A heading, so the detail reads as a document to assistive technology.
    expect(screen.getByRole('heading', { name: 'Smoke' })).toBeVisible();
    expect(section).toHaveTextContent('the cook itself');
  });
});
