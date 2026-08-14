import { Box, Typography } from '@mui/material';
import React from 'react';
import { StarRating } from '../../common/components/StarRating';
import { formatClockTime, formatDateLabel } from '../../common/timeFormat';

export interface ReviewHeaderProps {
  /** What the cook was called; a cook never named still needs a headline. */
  name: string | undefined;
  /** The day of the cook, or null when nothing recorded one. */
  date: Date | null;
  /** When smoking started, or null for a record from before the stamps existed. */
  startedAt: Date | null;
  /** When the session finished, likewise. */
  finishedAt: Date | null;
  /** The overall score out of ten; zero or less means the cook was never rated. */
  overallRating: number;
}

/**
 * The history detail's header: the cook's name, when it actually ran — day,
 * then started–finished — and its overall score as the design's star row.
 *
 * Every moment not on record reads as an em-dash: a legacy cook without
 * timestamps gets an honest "— – —", never an invented midnight.
 */
export function ReviewHeader({
  name,
  date,
  startedAt,
  finishedAt,
  overallRating,
}: ReviewHeaderProps): JSX.Element {
  return (
    <Box data-testid="review-header" sx={{ padding: '4px 2px 12px' }}>
      <Typography
        component="h1"
        data-testid="review-header-name"
        sx={theme => ({ fontSize: '1.25rem', fontWeight: 700, color: theme.design.text })}
      >
        {name?.trim() || 'Untitled Smoke'}
      </Typography>
      <Typography
        component="p"
        data-testid="review-header-when"
        sx={theme => ({
          marginTop: '2px',
          fontSize: '0.8125rem',
          color: theme.design.textSecondary,
        })}
      >
        {formatDateLabel(date)} · {formatClockTime(startedAt)} – {formatClockTime(finishedAt)}
      </Typography>
      <Box sx={{ marginTop: '6px' }}>
        {/* A rating of zero is no rating: the bars start at half a point, so
            zero can only mean nobody has scored the cook yet. */}
        <StarRating value={overallRating > 0 ? overallRating : Number.NaN} />
      </Box>
    </Box>
  );
}
