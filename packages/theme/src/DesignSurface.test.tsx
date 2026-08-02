/**
 * The design's paint has to stop at the screens that have been restyled.
 *
 * The application theme carries the design tokens for every screen but paints
 * with none of them; a restyled screen wraps itself in a `DesignSurface` and is
 * painted. These render both sides of that boundary — with the application
 * theme mounted the way the application root mounts it, through the
 * colour-scheme provider — so the boundary itself is what is under test.
 */
import {
  Button,
  Experimental_CssVarsProvider as CssVarsProvider,
  ThemeProvider,
} from '@mui/material';
import { createTheme, experimental_extendTheme as extendTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DesignSurface } from './DesignSurface';
import { appTheme } from './index';
import { stubSystemColorScheme } from './testing/systemColorScheme';

let system: ReturnType<typeof stubSystemColorScheme>;

beforeEach(() => {
  system = stubSystemColorScheme();
  localStorage.clear();
});
afterEach(() => system.restore());

/** Both sides of the boundary, under the application theme. */
const bothSidesOfTheBoundary = (): void => {
  render(
    <CssVarsProvider theme={appTheme}>
      <Button variant="contained" data-testid="unrestyled-screen">
        Next
      </Button>
      <DesignSurface>
        <Button variant="contained" data-testid="restyled-screen">
          Save
        </Button>
      </DesignSurface>
    </CssVarsProvider>
  );
};

/** How a contained button is painted and typed under `theme`. */
const containedButtonUnder = (theme: ReturnType<typeof extendTheme>) => {
  const { unmount } = render(
    <CssVarsProvider theme={theme}>
      <Button variant="contained" data-testid="button">
        Next
      </Button>
    </CssVarsProvider>
  );
  const { backgroundColor, color, fontFamily } = getComputedStyle(screen.getByTestId('button'));
  unmount();
  return { backgroundColor, color, fontFamily };
};

describe('a screen that opts into the design palette', () => {
  it('is painted and typed in the design tokens', () => {
    bothSidesOfTheBoundary();

    const restyled = screen.getByTestId('restyled-screen');
    expect(restyled).toHaveStyle({ backgroundColor: '#DA4A2E' });
    expect(getComputedStyle(restyled).fontFamily).toContain('Plus Jakarta Sans');
  });

  it('leaves the screens around it exactly as Material-UI paints them', () => {
    // Material-UI's own theme, mounted the same way, is how the screens this
    // slice does not restyle are painted today.
    expect(containedButtonUnder(appTheme)).toEqual(containedButtonUnder(extendTheme()));
  });

  it('still inherits everything the application theme gave it', () => {
    const marked = createTheme({
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
