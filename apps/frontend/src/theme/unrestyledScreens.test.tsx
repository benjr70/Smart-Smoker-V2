/**
 * AC 6: screens other than Settings must keep rendering as they did.
 *
 * The theme is provided at the application root (AC 3), so every screen sees it
 * — including Smoke, History and the bottom navigation, which the PRD keeps at
 * their current look. So the line is not merely "the theme must not move a
 * control": it must not repaint or re-type one either. A wider, bolder typeface
 * wraps the smoke step readouts and the fixed-width bottom navigation items, and
 * the design accent would turn every contained button, active step icon and
 * selected navigation action from Material-UI blue to the design's rust.
 *
 * Each control below is one an unrestyled screen actually renders, and every
 * property captured is one Material-UI writes onto that control itself, so the
 * comparison is against how those screens are painted today: Material-UI's own
 * default theme.
 */
import {
  BottomNavigation,
  Experimental_CssVarsProvider as CssVarsProvider,
  BottomNavigationAction,
  Button,
  Card,
  CardContent,
  OutlinedInput,
  Step,
  StepLabel,
  Stepper,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import { experimental_extendTheme as extendTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { appTheme } from './index';

/** Everything about a control a theme can change: its box, its paint, its type. */
const APPEARANCE: string[] = [
  'color',
  'background-color',
  'border-color',
  'border-radius',
  'padding',
  'min-width',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
];

/** Controls the unrestyled screens are built from. */
const CONTROLS: string[] = [
  'body text',
  'contained button',
  'text field',
  'card',
  'active step icon',
  'selected navigation action',
];

const Probes = (): JSX.Element => (
  <>
    <Typography data-testid="body text">Chamber 225</Typography>
    <Button variant="contained" data-testid="contained button">
      Next
    </Button>
    <OutlinedInput data-testid="text field" />
    <Card data-testid="card">
      <CardContent>Pre Smoke</CardContent>
    </Card>
    <Stepper activeStep={0}>
      <Step>
        <StepLabel StepIconProps={{ 'data-testid': 'active step icon' } as never}>
          Pre Smoke
        </StepLabel>
      </Step>
    </Stepper>
    <BottomNavigation value={0} showLabels>
      <BottomNavigationAction label="Smoke" data-testid="selected navigation action" />
    </BottomNavigation>
  </>
);

/**
 * How every probe control is laid out, painted and typed under `theme`, mounted
 * through the colour-scheme provider — the way the application root mounts its
 * theme, and therefore the way these screens are really painted.
 */
const appearanceUnder = (
  theme: ReturnType<typeof extendTheme>
): Record<string, Record<string, string>> => {
  const { unmount } = render(
    <CssVarsProvider theme={theme}>
      <Probes />
    </CssVarsProvider>
  );

  const appearance = Object.fromEntries(
    CONTROLS.map(control => {
      const style = getComputedStyle(screen.getByTestId(control));
      return [
        control,
        Object.fromEntries(
          APPEARANCE.map(property => [property, style.getPropertyValue(property)])
        ),
      ];
    })
  );

  unmount();
  return appearance;
};

describe('the application theme and the screens it does not restyle', () => {
  it('lays out, paints and types every control exactly as Material-UI does', () => {
    // Material-UI's own theme, mounted the same way: how the screens this slice
    // does not restyle are painted today.
    expect(appearanceUnder(appTheme)).toEqual(appearanceUnder(extendTheme()));
  });

  /**
   * The guard is only worth having if it can see the change it forbids, so this
   * feeds it the very repaint and typeface swap the design would apply.
   */
  it('notices a theme that repaints or re-types those controls', () => {
    const restyled = extendTheme({
      colorSchemes: { light: { palette: { primary: { main: '#DA4A2E' } } } },
      typography: { fontFamily: '"Plus Jakarta Sans", sans-serif' },
    });

    expect(appearanceUnder(restyled)).not.toEqual(appearanceUnder(extendTheme()));
  });

  /**
   * The step icon and the navigation action only take the accent in their
   * active and selected states, so a probe caught in any other state would
   * measure a control the accent never reaches.
   */
  it('probes the step icon and the navigation action in the states that take the accent', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <Probes />
      </ThemeProvider>
    );

    expect(screen.getByTestId('active step icon')).toHaveClass('Mui-active');
    expect(screen.getByTestId('selected navigation action')).toHaveClass('Mui-selected');
  });
});
