/**
 * The headline: both cooks named in their own colours, and — when they scored
 * differently — which one came out ahead and by how much.
 *
 * The verdict is a sentence rather than two numbers because it is the answer to
 * the question the whole screen was opened to ask. Two cooks that scored the
 * same get no sentence at all: "scored higher overall — 0.0 points better" is a
 * claim about nothing. Neither does a pair with a cook nobody rated: a verdict
 * is a comparison of two scores, and an unrated cook has none to compare.
 */
import { Box, Card } from '@mui/material';
import React from 'react';
import { CompareCook } from '../../../api';
import { formatDateLabel } from '../../common/timeFormat';
import { CompareSlotColors } from './compareColors';
import { UNNAMED_COOK } from './cookLabels';
import { ratedScore } from './cookRating';

export interface CompareSummaryCardProps {
  a: CompareCook;
  b: CompareCook;
  colors: CompareSlotColors;
}

interface SwatchProps {
  side: 'A' | 'B';
  cook: CompareCook;
  color: string;
}

/** One cook's name and day, under the colour that means it. */
function Swatch({ side, cook, color }: SwatchProps): JSX.Element {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Box
          component="span"
          aria-hidden="true"
          data-testid={`compare-summary-dot-${side.toLowerCase()}`}
          sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: color }}
        />
        <Box
          component="span"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: theme.design.textSecondary,
          })}
        >
          {side}
        </Box>
      </Box>
      <Box
        sx={theme => ({
          fontSize: '0.9375rem',
          fontWeight: 700,
          color: theme.design.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        })}
      >
        {cook.name || UNNAMED_COOK}
      </Box>
      <Box sx={theme => ({ fontSize: '0.75rem', color: theme.design.textSecondary })}>
        {formatDateLabel(cook.date)}
      </Box>
    </Box>
  );
}

/**
 * The score a cook was given, or `null` for one nobody scored — by the same
 * rule the picker's rows and its "Top rated" order read a rating by, so that a
 * cook cannot be unrated here and a genuine 0.0 there.
 */
const scoreOf = (cook: CompareCook): number | null => ratedScore(cook.rating.overallTaste);

export function CompareSummaryCard({ a, b, colors }: CompareSummaryCardProps): JSX.Element {
  const scoreA = scoreOf(a);
  const scoreB = scoreOf(b);
  // Only two cooks that were both scored have a winner between them. An
  // unrated cook does not lose the comparison; it simply was never in one.
  const winner =
    scoreA === null || scoreB === null || scoreA === scoreB ? null : scoreA > scoreB ? a : b;
  const margin = scoreA !== null && scoreB !== null ? Math.abs(scoreA - scoreB) : 0;

  return (
    <Card data-testid="compare-summary" sx={{ padding: '16px' }}>
      <Box sx={{ display: 'flex', gap: '14px' }}>
        <Swatch side="A" cook={a} color={colors.a} />
        <Swatch side="B" cook={b} color={colors.b} />
      </Box>
      {winner !== null && (
        <Box
          data-testid="compare-verdict"
          sx={theme => ({
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: `1px solid ${theme.design.border}`,
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: theme.design.textSecondary,
          })}
        >
          <Box component="strong" sx={theme => ({ fontWeight: 700, color: theme.design.text })}>
            {winner.name || UNNAMED_COOK}
          </Box>{' '}
          scored higher overall — {margin.toFixed(1)} points better.
        </Box>
      )}
    </Card>
  );
}
