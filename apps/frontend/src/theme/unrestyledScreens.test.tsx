/**
 * AC 6: screens other than Settings must keep rendering as they did.
 *
 * The theme is provided at the application root (AC 3), so every screen sees it
 * — including the ones this slice does not restyle. Those screens lay themselves
 * out with their own stylesheets and Material-UI's default control geometry, so
 * the line that matters is this: the theme may repaint a control, but it must
 * not move one. Anything that changes a control's box — `shape.borderRadius`,
 * a `MuiButton`/`MuiOutlinedInput` override, density — reflows Pre-Smoke,
 * Post-Smoke, the smoke step and the dynamic lists.
 *
 * Measured against Material-UI's own default theme, which is what those screens
 * were built on.
 */
import { Button, OutlinedInput, ThemeProvider, createTheme } from '@mui/material';
import { Theme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { appTheme } from './index';

/** The box a control occupies, as an unrestyled screen would lay it out. */
interface ControlGeometry {
  buttonBorderRadius: string;
  buttonPadding: string;
  buttonMinWidth: string;
  inputBorderRadius: string;
  inputPadding: string;
}

const geometryUnder = (theme: Theme): ControlGeometry => {
  const { unmount } = render(
    <ThemeProvider theme={theme}>
      <Button data-testid="button">Next</Button>
      <OutlinedInput data-testid="input" />
    </ThemeProvider>
  );

  const button = getComputedStyle(screen.getByTestId('button'));
  const input = getComputedStyle(screen.getByTestId('input'));
  const geometry: ControlGeometry = {
    buttonBorderRadius: button.borderRadius,
    buttonPadding: button.padding,
    buttonMinWidth: button.minWidth,
    inputBorderRadius: input.borderRadius,
    inputPadding: input.padding,
  };

  unmount();
  return geometry;
};

describe('the application theme and the screens it does not restyle', () => {
  it('leaves control geometry exactly where Material-UI puts it', () => {
    expect(geometryUnder(appTheme)).toEqual(geometryUnder(createTheme()));
  });
});
