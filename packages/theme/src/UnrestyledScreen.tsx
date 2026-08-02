import { ThemeProvider, useTheme } from '@mui/material/styles';
import React from 'react';
import { withLightColorScheme } from './appTheme';

/**
 * Marks a subtree as a screen the design has not reached yet.
 *
 * The application chooses one colour scheme for everything it renders, but the
 * design has only been applied to the screens that wrap themselves in a
 * `DesignSurface`. The rest are still painted by hand — a light-grey shell and
 * light-hardcoded stylesheets — so a dark scheme reaching their Material-UI
 * controls would paint near-white text, step labels and input outlines onto
 * light grey. Wrapping such a screen here holds it on the light palette, the way
 * it looks today, until the slice that recolours it arrives; then the wrapper
 * comes off.
 *
 * Like `DesignSurface`, the theme is derived from the enclosing one rather than
 * replacing it, so the screen keeps everything else the application provides.
 */
export const UnrestyledScreen = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const outer = useTheme();
  const theme = React.useMemo(() => withLightColorScheme(outer), [outer]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
