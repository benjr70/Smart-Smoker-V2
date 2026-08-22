import { Box, Typography } from '@mui/material';
import React from 'react';

export interface StatBarRowProps {
  testId: string;
  /** What the bar is about: a meat, a wood, a rating category. */
  label: string;
  /** The figure, already written out: `6 sessions · 84.5 lbs`. */
  value: string;
  /** How full the bar is, 0 to 1. Anything outside that is clamped. */
  fraction: number;
  /** The colour the bar is filled in. */
  color: string;
}

/** The bar's width, as a percentage string a browser and a test can both read. */
export function barWidth(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return '0%';
  const clamped = Math.min(1, fraction);
  // A tenth of a percent is the finest difference worth drawing, and rounding
  // there keeps `1 / 6` a stable `16.7%` rather than seventeen digits of it.
  return `${Math.round(clamped * 1000) / 10}%`;
}

/**
 * One row of a breakdown: what it is, what it comes to, and a bar as long as
 * that figure is against the biggest one in its section.
 *
 * The bar carries no numbers of its own — the row states them in words beside
 * it — so it is decoration to a screen reader and hidden from one.
 */
export function StatBarRow({
  testId,
  label,
  value,
  fraction,
  color,
}: StatBarRowProps): JSX.Element {
  return (
    <Box data-testid={testId}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1.5,
          marginBottom: '6px',
        }}
      >
        <Typography
          component="p"
          sx={theme => ({
            fontSize: '0.875rem',
            fontWeight: 600,
            color: theme.design.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })}
        >
          {label}
        </Typography>
        <Typography
          component="p"
          sx={theme => ({
            flexShrink: 0,
            fontSize: '0.75rem',
            color: theme.design.textSecondary,
          })}
        >
          {value}
        </Typography>
      </Box>
      <Box
        aria-hidden="true"
        sx={theme => ({
          height: '8px',
          borderRadius: '999px',
          overflow: 'hidden',
          backgroundColor: theme.design.surfaceAlt,
        })}
      >
        <Box
          data-testid="stat-bar-fill"
          sx={{
            height: '100%',
            borderRadius: '999px',
            width: barWidth(fraction),
            backgroundColor: color,
          }}
        />
      </Box>
    </Box>
  );
}
