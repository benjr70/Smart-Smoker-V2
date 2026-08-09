import { useTheme } from '@mui/material/styles';
import type { ChartPalette } from 'temperaturechart/src/TemperatureChart';
import { carbonDark, resolveDesignPalette } from 'theme/src';

/**
 * The colours the touchscreen's chart paints with, from the colour scheme the
 * installation has told this device to render.
 *
 * The chart draws itself out of raw colour rather than out of components, so it
 * cannot inherit a surface the way a card does — it has to be handed one. The
 * device is handed a whole theme per scheme by {@link DeviceThemeProvider}, and
 * this is where the chart picks up the set of chart colours belonging to
 * whichever of them is in effect: reading them through the theme is what makes
 * the chart follow an announcement from a phone without being remounted, and it
 * keeps the device's rule that it renders a resolved scheme and never resolves
 * one itself.
 *
 * The fallback is the dark set rather than the light one, which is the same
 * answer the device makes before it has heard anything: the panel hangs in a
 * garage, and the wrong answer there is a sheet of white in a dark room.
 */
export const useChartPalette = (): ChartPalette => {
  const { design } = useTheme();

  return (design ?? resolveDesignPalette(carbonDark)).chart;
};
