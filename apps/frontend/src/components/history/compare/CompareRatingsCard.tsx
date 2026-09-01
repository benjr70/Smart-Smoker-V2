/**
 * The outcome, axis by axis.
 *
 * The summary card answers "which cook was better"; this one answers "better
 * how" — a cook can win on tenderness and lose on smoke, and that is the sort of
 * difference the method sections above are there to explain.
 */
import { Box, Card } from '@mui/material';
import React from 'react';
import { rating } from '../../../api';
import { CompareSlotColors } from './compareColors';

/** The four axes a cook is scored on, in the order the ratings screen lists them. */
const AXES: {
  key: keyof Pick<rating, 'smokeFlavor' | 'seasoning' | 'tenderness' | 'overallTaste'>;
  label: string;
}[] = [
  { key: 'smokeFlavor', label: 'Smoke flavor' },
  { key: 'seasoning', label: 'Seasoning' },
  { key: 'tenderness', label: 'Tenderness' },
  { key: 'overallTaste', label: 'Overall taste' },
];

export interface CompareRatingsCardProps {
  a: rating;
  b: rating;
  colors: CompareSlotColors;
}

/** The scale every axis is scored on, and so the width every bar is drawn against. */
const SCALE = 10;

/**
 * How far apart two scores must be to count as a difference.
 *
 * Scores are given in half-steps on a ten-point scale, so anything under a
 * twentieth of a point is two cooks that scored the same — arrived at by
 * rounding, not by tasting — and colouring it would claim a win nobody made.
 */
const MEANINGFUL_DELTA = 0.05;

/** A score as it was given, or zero for an axis the record has nothing for. */
const scoreOf = (ratings: rating, key: (typeof AXES)[number]['key']): number => {
  const score = ratings[key];
  return Number.isFinite(score) ? score : 0;
};

/** How much of the bar a score fills, kept inside the scale it is drawn against. */
const fillOf = (score: number): string => `${Math.min(Math.max(score / SCALE, 0), 1) * 100}%`;

export function CompareRatingsCard({ a, b, colors }: CompareRatingsCardProps): JSX.Element {
  return (
    <Card data-testid="compare-ratings" sx={{ padding: '14px 16px 16px' }}>
      <Box
        sx={theme => ({
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          marginBottom: '12px',
          color: theme.design.textSecondary,
        })}
      >
        RATINGS
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {AXES.map(axis => {
          const scoreA = scoreOf(a, axis.key);
          const scoreB = scoreOf(b, axis.key);
          const delta = scoreA - scoreB;
          // Colour means cook here as everywhere: an axis one cook won is
          // written in that cook's colour, and one neither of them won is
          // written in neither's.
          const decided = Math.abs(delta) >= MEANINGFUL_DELTA;
          const winnerColor = delta > 0 ? colors.a : colors.b;
          return (
            <Box key={axis.key} data-testid="compare-rating-row" data-axis={axis.label}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: '5px',
                  gap: '10px',
                }}
              >
                <Box
                  component="span"
                  sx={theme => ({
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: theme.design.text,
                  })}
                >
                  {axis.label}
                </Box>
                <Box
                  component="span"
                  data-testid="compare-rating-values"
                  sx={theme => ({
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: theme.design.text,
                  })}
                >
                  {scoreA.toFixed(1)} · {scoreB.toFixed(1)}{' '}
                  <Box
                    component="span"
                    data-testid="compare-rating-delta"
                    sx={theme => ({
                      fontWeight: 700,
                      color: decided ? winnerColor : theme.design.textSecondary,
                    })}
                  >
                    {decided && `${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(1)}`}
                  </Box>
                </Box>
              </Box>
              {/* A over B, so the taller bar and the colour say the same thing. */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(
                  [
                    ['a', scoreA, colors.a],
                    ['b', scoreB, colors.b],
                  ] as const
                ).map(([side, score, color]) => (
                  <Box
                    key={side}
                    sx={theme => ({
                      height: 6,
                      borderRadius: '3px',
                      overflow: 'hidden',
                      backgroundColor: theme.design.surfaceAlt,
                    })}
                  >
                    <Box
                      data-testid={`compare-rating-bar-${side}`}
                      sx={{
                        width: fillOf(score),
                        height: '100%',
                        borderRadius: '3px',
                        backgroundColor: color,
                      }}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}
