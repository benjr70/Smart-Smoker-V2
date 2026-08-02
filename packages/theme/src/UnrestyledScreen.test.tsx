/**
 * The screens the design has not reached yet.
 *
 * The colour scheme is chosen once, for the whole application, but only a
 * restyled screen is painted from the design's tokens. Everything else is still
 * painted by hand — a light-grey shell, light-hardcoded stylesheets — so letting
 * the dark scheme reach those screens would put near-white Material-UI text,
 * step labels and input outlines onto light grey, which no one can read.
 * Wrapping such a screen here holds it on the light palette until the slice that
 * recolours it arrives.
 */
import { Button, Experimental_CssVarsProvider as CssVarsProvider, Typography } from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { UnrestyledScreen } from './UnrestyledScreen';
import { appTheme } from './index';
import { stubSystemColorScheme } from './testing/systemColorScheme';

let system: ReturnType<typeof stubSystemColorScheme>;

beforeEach(() => {
  system = stubSystemColorScheme();
  localStorage.clear();
});
afterEach(() => system.restore());

/** The controls an unrestyled screen is built from. */
const Probes = (): JSX.Element => (
  <>
    <Typography data-testid="body text">Chamber 225</Typography>
    <Button variant="contained" data-testid="contained button">
      Next
    </Button>
  </>
);

/** How each probe is painted and typed in `tree`. */
const paintOf = (tree: JSX.Element): Record<string, Record<string, string>> => {
  const { unmount } = render(tree);
  const paint = Object.fromEntries(
    ['body text', 'contained button'].map(control => {
      const { color, backgroundColor, fontFamily } = getComputedStyle(screen.getByTestId(control));
      return [control, { color, backgroundColor, fontFamily }];
    })
  );
  unmount();
  return paint;
};

/** An unrestyled screen, with `scheme` in effect for the application. */
const unrestyledUnder = (scheme: 'light' | 'dark'): Record<string, Record<string, string>> =>
  paintOf(
    <CssVarsProvider theme={appTheme} defaultMode={scheme}>
      <UnrestyledScreen>
        <Probes />
      </UnrestyledScreen>
    </CssVarsProvider>
  );

/** How Material-UI paints these controls out of the box, in literal colours. */
const materialUiOutOfTheBox = (): Record<string, Record<string, string>> =>
  paintOf(
    <ThemeProvider theme={createTheme()}>
      <Probes />
    </ThemeProvider>
  );

describe('a screen the design has not reached', () => {
  it('is painted in the light palette while the dark scheme is in effect', () => {
    expect(unrestyledUnder('dark')).toEqual(materialUiOutOfTheBox());
  });

  it('is painted the very same way while the light scheme is in effect', () => {
    expect(unrestyledUnder('light')).toEqual(materialUiOutOfTheBox());
  });

  /**
   * The paint is pinned; nothing else is. The screen still sees whatever the
   * application theme configures, so a later slice can reach it from the root.
   */
  it('still inherits everything the application theme gave it', () => {
    const marked = createTheme({
      components: { MuiButton: { defaultProps: { 'data-marked': 'yes' } as never } },
    });

    render(
      <ThemeProvider theme={marked}>
        <UnrestyledScreen>
          <Button variant="contained" data-testid="contained button">
            Next
          </Button>
        </UnrestyledScreen>
      </ThemeProvider>
    );

    expect(screen.getByTestId('contained button')).toHaveAttribute('data-marked', 'yes');
  });

  /**
   * The design's own tokens travel with the screen too, so a control that reads
   * one gets the light set rather than the tokens of a scheme it is not painted
   * in.
   */
  it('carries the light design tokens, whatever scheme is in effect', () => {
    const Probe = (): JSX.Element => {
      const { design } = useTheme();
      return <div data-testid="probe" data-background={design?.background} />;
    };

    render(
      <CssVarsProvider theme={appTheme} defaultMode="dark">
        <UnrestyledScreen>
          <Probe />
        </UnrestyledScreen>
      </CssVarsProvider>
    );

    expect(screen.getByTestId('probe')).toHaveAttribute('data-background', '#F6F6F5');
  });
});
