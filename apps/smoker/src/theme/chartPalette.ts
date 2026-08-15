import type { ChartPalette } from 'temperaturechart/src/TemperatureChart';
import { useDesign } from './useDesign';

/**
 * The colours the touchscreen's chart paints with, from the colour scheme the
 * installation has told this device to render.
 *
 * The chart draws itself out of raw colour rather than out of components, so it
 * cannot inherit a surface the way a card does — it has to be handed one. This
 * hook hands it the chart slice of the same design palette everything else on
 * the screen reads through {@link useDesign}: one resolution (and one fallback
 * rule) for the whole screen, so the chart's colours can never disagree with
 * the cards and readouts drawn beside it.
 */
export const useChartPalette = (): ChartPalette => useDesign().chart;
