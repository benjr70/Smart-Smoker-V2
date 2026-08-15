import { useTheme } from '@mui/material/styles';
import { DesignPalette, carbonDark, resolveDesignPalette } from 'theme/src';

/**
 * The design tokens the screen paints with, from the theme the device was told
 * to render.
 *
 * The fallback is the dark set rather than the light one, for the same reason
 * the chart's palette falls back dark (see `chartPalette.ts`): it is the answer
 * this appliance gives before it has heard anything, and the wrong answer in a
 * garage is a sheet of white in a dark room.
 */
export const useDesign = (): DesignPalette => {
  const { design } = useTheme();
  return design ?? resolveDesignPalette(carbonDark);
};
