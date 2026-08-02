/**
 * AC 1, 2: the theme the application provides carries both halves of the Carbon
 * palette as colour schemes, so which one paints is a question of the scheme in
 * effect rather than of which theme object someone swapped in.
 */
import {
  Card,
  Experimental_CssVarsProvider as CssVarsProvider,
  ScopedCssBaseline,
  Typography,
} from '@mui/material';
import { SupportedColorScheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface } from './DesignSurface';
import { DesignPalette, createColorSchemeTheme } from './appTheme';
import { appTheme } from './index';
import { stubSystemColorScheme } from './testing/systemColorScheme';

/** The design tokens one colour scheme of the application theme carries. */
const tokensOf = (scheme: SupportedColorScheme): DesignPalette =>
  createColorSchemeTheme().colorSchemes[scheme].design;

describe('the theme the application provides — the Carbon dark tokens', () => {
  it('carries the page background and the surface colours', () => {
    expect(tokensOf('dark')).toMatchObject({
      background: '#0C0C0C',
      surface: '#161616',
      surfaceAlt: '#202020',
    });
  });

  /**
   * The navigation bar is its own surface in the mock — darker than a card, so
   * that the bar reads as the edge of the app rather than as another panel.
   */
  it('carries a navigation surface distinct from the cards it sits below', () => {
    expect(tokensOf('dark').navigation).toBe('#111111');
    expect(tokensOf('dark').navigation).not.toBe(tokensOf('dark').surface);
  });

  it('carries the hairline and text colours', () => {
    expect(tokensOf('dark')).toMatchObject({
      border: '#2C2C2C',
      inputBorder: '#3A3A3A',
      text: '#F0EFED',
      textSecondary: '#8E8E8A',
    });
  });

  it('carries the accent, danger and success colours', () => {
    expect(tokensOf('dark')).toMatchObject({
      accent: '#FF6247',
      danger: '#F0503C',
      success: '#4EA85C',
    });
  });

  it('tints accent backgrounds at 12% of the dark accent', () => {
    expect(tokensOf('dark').accentTint).toBe('rgba(255, 98, 71, 0.12)');
  });

  /**
   * The accent is not one colour reused across the schemes: the light accent is
   * too dark to read against a near-black surface.
   */
  it('gives the dark scheme its own accent rather than the light one', () => {
    expect(tokensOf('dark').accent).not.toBe(tokensOf('light').accent);
  });
});

describe('the theme the application provides — the Carbon light tokens', () => {
  it('still carries the light palette it shipped with', () => {
    expect(tokensOf('light')).toMatchObject({
      background: '#F6F6F5',
      surface: '#FFFFFF',
      text: '#121212',
      accent: '#DA4A2E',
    });
  });
});

/**
 * The point of carrying both schemes: a restyled screen is painted by whichever
 * one is in effect. The application theme is provided through the colour-scheme
 * provider, exactly as the application root provides it, and the same screen is
 * rendered under each scheme.
 */
describe('a restyled screen under the colour-scheme provider', () => {
  let system: ReturnType<typeof stubSystemColorScheme>;

  beforeEach(() => {
    system = stubSystemColorScheme();
    localStorage.clear();
  });
  afterEach(() => system.restore());

  const renderUnder = (scheme: SupportedColorScheme): void => {
    render(
      <CssVarsProvider theme={appTheme} defaultMode={scheme}>
        <DesignSurface>
          <ScopedCssBaseline data-testid="page">
            <Card data-testid="card">
              <Typography>Chamber 225</Typography>
            </Card>
          </ScopedCssBaseline>
        </DesignSurface>
      </CssVarsProvider>
    );
  };

  it('paints it in the Carbon dark tokens when the dark scheme is in effect', () => {
    renderUnder('dark');

    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: '#161616',
      borderColor: '#2C2C2C',
    });
    expect(screen.getByTestId('page')).toHaveStyle({
      backgroundColor: '#0C0C0C',
      color: '#F0EFED',
    });
  });

  it('paints it in the Carbon light tokens when the light scheme is in effect', () => {
    renderUnder('light');

    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: '#FFFFFF',
      borderColor: '#E2E2DF',
    });
    expect(screen.getByTestId('page')).toHaveStyle({
      backgroundColor: '#F6F6F5',
      color: '#121212',
    });
  });
});
