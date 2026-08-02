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
import { UnrestyledScreen, appTheme } from './index';

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

/** How every probe control is laid out, painted and typed in `tree`. */
const appearanceOf = (tree: JSX.Element): Record<string, Record<string, string>> => {
  const { unmount } = render(tree);

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

/** The probes under `theme`, mounted the way the application root mounts it. */
const appearanceUnder = (
  theme: ReturnType<typeof extendTheme>
): Record<string, Record<string, string>> =>
  appearanceOf(
    <CssVarsProvider theme={theme}>
      <Probes />
    </CssVarsProvider>
  );

/**
 * The probes as an unrestyled screen really renders them: inside the
 * application's colour-scheme provider, with `scheme` in effect, wrapped the way
 * the application root wraps the screens the design has not reached.
 */
const unrestyledScreenUnder = (
  scheme: 'light' | 'dark'
): Record<string, Record<string, string>> => {
  localStorage.clear();
  return appearanceOf(
    <CssVarsProvider theme={appTheme} defaultMode={scheme}>
      <UnrestyledScreen>
        <Probes />
      </UnrestyledScreen>
    </CssVarsProvider>
  );
};

/**
 * How Material-UI paints these controls out of the box, in literal colours
 * rather than in references to whichever scheme is in effect — which is what an
 * unrestyled screen, painted against a hand-written light-grey shell, has to
 * keep looking like.
 */
const materialUiOutOfTheBox = (): Record<string, Record<string, string>> =>
  appearanceOf(
    <ThemeProvider theme={createTheme()}>
      <Probes />
    </ThemeProvider>
  );

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
   * The scheme is chosen for the whole application, but the design has only
   * reached Settings: every other screen is still painted by hand, on the
   * light-grey shell `App.css` gives it. A dark scheme reaching those controls
   * would paint near-white body text, step labels and input outlines onto that
   * light grey — unreadable. The slice defers recolouring them, which means they
   * have to keep the light palette until it does.
   */
  it('keeps the light palette on those screens even when the dark scheme is in effect', () => {
    expect(unrestyledScreenUnder('dark')).toEqual(materialUiOutOfTheBox());
  });

  it('keeps the very same palette when the light scheme is in effect', () => {
    expect(unrestyledScreenUnder('light')).toEqual(materialUiOutOfTheBox());
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
