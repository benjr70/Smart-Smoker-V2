/**
 * The card the two cooks are overlaid in.
 *
 * The drawing itself is the shared chart package's, which knows nothing of this
 * app: this is where the two cooks are turned into what it draws, and where the
 * colours it paints with are read off the theme in effect.
 */
import { Card, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import CompareChart from 'temperaturechart/src/CompareChart';
import { CompareCook } from '../../../api';
import { useDesignPalette } from '../../../theme';
import { CompareSlotColors } from './compareColors';
import { compareSeriesOf } from './compareSeries';

export interface CompareChartCardProps {
  a: CompareCook;
  b: CompareCook;
  /** Which colour means which cook, the same pair the rest of the screen uses. */
  colors: CompareSlotColors;
}

export function CompareChartCard({ a, b, colors }: CompareChartCardProps): JSX.Element {
  const design = useDesignPalette();

  // Held against the cooks and the scheme: the chart derives its whole drawing
  // from what it is handed, so a series rebuilt on every render would redraw
  // both cooks every time anything on the screen changed.
  const cookA = useMemo(() => compareSeriesOf(a, colors.a, design), [a, colors.a, design]);
  const cookB = useMemo(() => compareSeriesOf(b, colors.b, design), [b, colors.b, design]);

  return (
    <Card data-testid="compare-chart" sx={{ padding: '14px 12px 12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
          padding: '0 4px',
        }}
      >
        <Typography
          component="h2"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: theme.design.textSecondary,
          })}
        >
          HOW THEY COOKED
        </Typography>
        {/* The axis is elapsed time, and saying so is what stops a reader
            looking for the hour of the day they lit the pit. */}
        <Typography
          component="span"
          sx={theme => ({ fontSize: '0.6875rem', color: theme.design.textSecondary })}
        >
          hours elapsed
        </Typography>
      </div>
      <CompareChart
        a={cookA}
        b={cookB}
        colors={{
          panel: design.surfaceAlt,
          grid: design.border,
          label: design.textSecondary,
          text: design.text,
        }}
      />
    </Card>
  );
}
