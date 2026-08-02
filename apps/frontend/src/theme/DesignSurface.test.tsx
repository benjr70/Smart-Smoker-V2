/**
 * The design's paint has to stop at the screens that have been restyled.
 *
 * The application theme carries the design tokens for every screen but paints
 * with none of them (AC 6); a restyled screen wraps itself in a `DesignSurface`
 * and is painted (AC 1, AC 4). These render both sides of that boundary in one
 * tree so the boundary itself is what is under test.
 */
import { Button, ThemeProvider, createTheme } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface } from './DesignSurface';
import { appTheme } from './index';

/**
 * Both sides of the boundary, plus the same control under Material-UI's own
 * default theme — which is how the screens this slice does not restyle are
 * painted today, and so what the unrestyled side has to still match.
 */
const bothSidesOfTheBoundary = (): void => {
  render(
    <>
      <ThemeProvider theme={appTheme}>
        <Button variant="contained" data-testid="unrestyled-screen">
          Next
        </Button>
        <DesignSurface>
          <Button variant="contained" data-testid="restyled-screen">
            Save
          </Button>
        </DesignSurface>
      </ThemeProvider>
      <ThemeProvider theme={createTheme()}>
        <Button variant="contained" data-testid="material-ui-default">
          Next
        </Button>
      </ThemeProvider>
    </>
  );
};

describe('a screen that opts into the design palette', () => {
  it('is painted and typed in the design tokens', () => {
    bothSidesOfTheBoundary();

    const restyled = screen.getByTestId('restyled-screen');
    expect(restyled).toHaveStyle({ backgroundColor: '#DA4A2E' });
    expect(getComputedStyle(restyled).fontFamily).toContain('Plus Jakarta Sans');
  });

  it('leaves the screens around it exactly as Material-UI paints them', () => {
    bothSidesOfTheBoundary();

    const untouched = getComputedStyle(screen.getByTestId('material-ui-default'));
    const unrestyled = getComputedStyle(screen.getByTestId('unrestyled-screen'));

    expect(unrestyled.backgroundColor).toBe(untouched.backgroundColor);
    expect(unrestyled.fontFamily).toBe(untouched.fontFamily);
  });

  it('still inherits everything the application theme gave it', () => {
    const marked = createTheme(appTheme, {
      components: { MuiButton: { defaultProps: { 'data-marked': 'yes' } as never } },
    });

    render(
      <ThemeProvider theme={marked}>
        <DesignSurface>
          <Button variant="contained" data-testid="restyled-screen">
            Save
          </Button>
        </DesignSurface>
      </ThemeProvider>
    );

    expect(screen.getByTestId('restyled-screen')).toHaveAttribute('data-marked', 'yes');
  });
});
