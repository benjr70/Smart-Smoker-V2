import { ThemeProvider, useTheme } from '@mui/material/styles';
import React from 'react';
import { withDesignPalette } from './appTheme';

/**
 * Marks a subtree as restyled to the design mock.
 *
 * The application theme carries the design's tokens but paints nothing with
 * them, because the screens this slice does not restyle — Smoke, History, the
 * bottom navigation — must keep their current look. Wrapping a screen here is
 * how it opts in: the design's colours and typeface apply inside, and nothing
 * outside changes. As the remaining screens are restyled they wrap themselves
 * the same way, and when the last one has, the palette can move to the root.
 *
 * The theme is derived from the enclosing one rather than replacing it, so a
 * restyled screen still inherits whatever the application provides.
 */
export const DesignSurface = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const outer = useTheme();
  const theme = React.useMemo(() => withDesignPalette(outer), [outer]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
