import { ThemeProvider, useTheme } from '@mui/material/styles';
import React from 'react';
import { withDesignPalette } from './appTheme';

/**
 * Paints a subtree in the design's palette and typeface.
 *
 * The application theme carries the design's tokens for every colour scheme but
 * paints nothing with them, so that a consumer decides where they apply. The web
 * app wraps its whole tree here, having been recoloured screen by screen; the
 * touchscreen application still paints itself by hand and is left alone until
 * the slice that recolours it.
 *
 * The theme is derived from the enclosing one rather than replacing it, so the
 * subtree keeps everything else the application provides — including which
 * colour scheme is in effect, whose tokens are the ones it is painted with.
 */
export const DesignSurface = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const outer = useTheme();
  const theme = React.useMemo(() => withDesignPalette(outer), [outer]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
