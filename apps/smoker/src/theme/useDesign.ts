import { useTheme } from '@mui/material/styles';
import { DesignPalette, carbonDark, resolveDesignPalette } from 'theme/src';

/**
 * The design tokens the screen paints with, from the theme the device was told
 * to render.
 *
 * This is the single place the device resolves its palette (the chart's
 * `useChartPalette` is a projection of it), so there is exactly one fallback
 * rule: the dark set rather than the light one, because it is the answer this
 * appliance gives before it has heard anything, and the wrong answer in a
 * garage is a sheet of white in a dark room.
 */
export const useDesign = (): DesignPalette => {
  const { design } = useTheme();
  return design ?? resolveDesignPalette(carbonDark);
};
