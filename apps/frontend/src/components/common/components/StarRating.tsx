import { Box } from '@mui/material';
import React from 'react';
import { starStates } from '../starScale';

export interface StarRatingProps {
  /** The score, out of ten. Not a number when the cook was never rated. */
  value: number;
}

/**
 * The design's read-only star display: five stars filled from a ten-point
 * score, with the score itself beside them.
 *
 * It is one thing to assistive technology, not five graphics and two numbers —
 * "Rated 7.5 out of 10" is what a row of stars means, and reading the stars out
 * individually says the same thing five slower ways.
 */
export function StarRating({ value }: StarRatingProps): JSX.Element {
  // A cook that was never rated arrives as an unparseable score. It shows five
  // empty stars and no number: "0.0 / 10" would be a verdict, and nobody gave
  // one.
  const rated = Number.isFinite(value);
  const score = rated ? value : 0;

  return (
    <Box
      role="img"
      aria-label={rated ? `Rated ${score.toFixed(1)} out of 10` : 'Not rated'}
      data-testid="star-rating"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
    >
      <Box aria-hidden="true" sx={{ display: 'flex', gap: '2px' }}>
        {starStates(score).map((state, index) => (
          <Box
            component="span"
            key={index}
            data-testid="star"
            data-star={state}
            sx={theme => ({
              fontSize: '0.875rem',
              lineHeight: 1,
              color: state === 'empty' ? theme.design.border : theme.design.accent,
            })}
          >
            {state === 'full' ? '★' : state === 'half' ? '½★' : '☆'}
          </Box>
        ))}
      </Box>
      {rated && (
        <>
          <Box
            component="span"
            aria-hidden="true"
            data-testid="star-rating-value"
            sx={theme => ({ fontSize: '0.8125rem', fontWeight: 700, color: theme.design.text })}
          >
            {score.toFixed(1)}
          </Box>
          <Box
            component="span"
            aria-hidden="true"
            sx={theme => ({ fontSize: '0.6875rem', color: theme.design.textSecondary })}
          >
            / 10
          </Box>
        </>
      )}
    </Box>
  );
}
