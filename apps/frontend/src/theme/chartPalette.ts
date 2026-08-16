import { useTheme } from '@mui/material/styles';
import type { ChartPalette } from 'temperaturechart/src/TemperatureChart';
import { carbonLight, resolveDesignPalette } from 'theme/src';

/**
 * The colours the temperature chart paints with, from the colour scheme in
 * effect.
 *
 * The chart draws itself out of raw colour rather than out of components, so it
 * cannot inherit a surface the way a card does — it has to be handed one. The
 * design carries a set of chart colours per palette for exactly that, and this
 * is where a screen picks up the set belonging to the scheme it is being drawn
 * under: reading them through the theme is what makes the chart follow a change
 * of scheme without being remounted.
 *
 * A screen holding a chart has to draw wherever it is mounted, including under a
 * theme built by a bare `createTheme()`, which carries no design palette — the
 * same fallback the design surface itself makes.
 */
export const useChartPalette = (): ChartPalette => {
  const { design } = useTheme();

  return (design ?? resolveDesignPalette(carbonLight, 'light')).chart;
};
