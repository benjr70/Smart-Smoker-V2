import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import type { ChartColors } from 'temperaturechart/src/tempChart';
import { carbonLight, resolveDesignPalette, type DesignPalette } from 'theme/src';

/**
 * The temperature chart's palette, from the design's tokens.
 *
 * The chart is shared with the touchscreen application, which has not been
 * recoloured yet, so it draws in the colours it is given rather than in the ones
 * a scheme implies. This is where the web app decides which of its tokens those
 * are:
 *
 * - the panel is the nested surface, because the chart sits inside a card on the
 *   history detail and on the page frame during a smoke, and it has to read as a
 *   panel on both;
 * - the lines are the scheme's probe colours, the same ones the readings beside
 *   them are named in — the light set is the one the chart has always drawn;
 * - the callout under the pointer is a card of its own, so it takes the card
 *   surface, the primary text, and the secondary text for its outline.
 */
export const chartColorsFrom = (design: DesignPalette): ChartColors => ({
  surface: design.surfaceAlt,
  probes: { ...design.probes },
  tooltipSurface: design.surface,
  tooltipBorder: design.textSecondary,
  tooltipText: design.text,
});

/**
 * The chart palette of the colour scheme in effect.
 *
 * A screen holding a chart has to draw wherever it is mounted, including under a
 * theme built by a bare `createTheme()`, which carries no design palette — the
 * same fallback the design surface itself makes.
 */
export const useChartColors = (): ChartColors => {
  const { design } = useTheme();

  return useMemo(() => chartColorsFrom(design ?? resolveDesignPalette(carbonLight)), [design]);
};
