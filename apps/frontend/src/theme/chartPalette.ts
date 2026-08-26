import { useTheme } from '@mui/material/styles';
import type { ChartPalette } from 'temperaturechart/src/TemperatureChart';
import { DesignPalette, carbonLight, resolveDesignPalette } from 'theme/src';

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
 * same fallback the design surface itself makes, made once here for everything
 * that has to paint with raw colour.
 *
 * Made once for the life of the page rather than once per render: what is drawn
 * from a palette is held against it, and a fallback rebuilt on every render is a
 * different palette every render, which would undo every one of those holdings.
 */
const NO_DESIGN = resolveDesignPalette(carbonLight, 'light');

export const useDesignPalette = (): DesignPalette => {
  const { design } = useTheme();

  return design ?? NO_DESIGN;
};

export const useChartPalette = (): ChartPalette => useDesignPalette().chart;
