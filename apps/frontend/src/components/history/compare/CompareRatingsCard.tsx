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
import { NOT_RECORDED } from '../../common/timeFormat';
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

/**
 * The score a cook was given on an axis, or `null` for one nobody scored.
 *
 * A zero is read as unrated rather than as the worst cook ever made, exactly as
 * the summary card above reads one: every slider on the ratings screen starts
 * at zero, so a cook archived without opening that screen reads back as zeros
 * on all four axes. Scoring that cook 0.0 and handing the other a four-axis
 * sweep would have this screen say "no winner" at the top and "B won every axis
 * by 8.0" a few cards down, about the same pair of cooks.
 */
const scoreOf = (ratings: rating, key: (typeof AXES)[number]['key']): number | null => {
  const score = ratings[key];
  return Number.isFinite(score) && score > 0 ? score : null;
};

/** A score as the row writes one, or an em-dash for an axis nobody scored. */
const written = (score: number | null): string =>
  score === null ? NOT_RECORDED : score.toFixed(1);

/**
 * How much of the bar a score fills, kept inside the scale it is drawn against.
 * An unscored axis draws no bar at all, which is the same width as a zero and a
 * different claim: there is nothing to draw rather than nothing to taste.
 */
const fillOf = (score: number | null): string =>
  score === null ? '0%' : `${Math.min(Math.max(score / SCALE, 0), 1) * 100}%`;

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
          // An axis only one cook was scored on has no difference to report:
          // "8.0 · —" is a fact about one cook, not a margin between two.
          const delta = scoreA !== null && scoreB !== null ? scoreA - scoreB : null;
          // Colour means cook here as everywhere: an axis one cook won is
          // written in that cook's colour, and one neither of them won — a tie,
          // a difference too small to taste, or a cook nobody rated — is
          // written in the quiet colour instead.
          const decided = delta !== null && Math.abs(delta) >= MEANINGFUL_DELTA;
          const winnerColor = delta !== null && delta > 0 ? colors.a : colors.b;
          const margin =
            decided && delta !== null
              ? `${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(1)}`
              : null;
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
                  // The scores carry the verdict, not just the arrow beside
                  // them: an axis nobody won reads in the quiet colour whether
                  // or not there is a margin to print.
                  sx={theme => ({
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: decided ? winnerColor : theme.design.textSecondary,
                  })}
                >
                  {written(scoreA)} · {written(scoreB)}
                  {margin !== null && (
                    <Box
                      component="span"
                      data-testid="compare-rating-delta"
                      sx={{ fontWeight: 700 }}
                    >
                      {' '}
                      {margin}
                    </Box>
                  )}
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
