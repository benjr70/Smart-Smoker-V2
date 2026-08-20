import { Box, Button, Typography } from '@mui/material';
import React from 'react';

/** Why the screen has no figures on it. */
export type StatsEmptyKind = 'never-smoked' | 'load-failed';

export interface StatsEmptyProps {
  /** Which empty screen this is. Defaults to the user with no cooks yet. */
  state?: StatsEmptyKind;
  /** Called when the user asks for the statistics to be read again. */
  onRetry?: () => void;
}

/** What each empty screen says. */
const COPY: Record<StatsEmptyKind, { title: string; detail: string }> = {
  'never-smoked': {
    title: 'No stats yet',
    detail:
      'Finish your first smoke and your hours, pounds and personal records will show up here.',
  },
  'load-failed': {
    title: 'Could not load your stats',
    detail: 'Your cooks are still there. Check your connection and try again.',
  },
};

/**
 * The Stats screen with nothing on it.
 *
 * The two reasons for that are different problems and get different screens. A
 * user who has never finished a cook has no averages, no records and no
 * breakdowns, and a grid of zeros would tell them — wrongly — that they cooked
 * for no hours and scored nothing; they are told what the tab is for instead. A
 * user whose read failed is told their cooks are safe and offered another go,
 * because zeros and a broken read look identical and only one of them is worth
 * worrying about.
 */
export function StatsEmpty({ state = 'never-smoked', onRetry }: StatsEmptyProps = {}): JSX.Element {
  const { title, detail } = COPY[state];

  return (
    <Box
      data-testid={state === 'never-smoked' ? 'stats-empty' : 'stats-load-failed'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <Typography
        component="p"
        sx={theme => ({ fontSize: '0.9375rem', fontWeight: 700, color: theme.design.text })}
      >
        {title}
      </Typography>
      <Typography
        component="p"
        sx={theme => ({
          fontSize: '0.875rem',
          lineHeight: 1.5,
          maxWidth: 250,
          color: theme.design.textSecondary,
        })}
      >
        {detail}
      </Typography>
      {/* Only the recoverable one carries a control: no button gives a user who
          has never cooked anything a set of statistics. */}
      {state === 'load-failed' && (
        <Button
          variant="outlined"
          size="small"
          onClick={onRetry}
          sx={theme => ({
            marginTop: '6px',
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            color: theme.design.text,
            borderColor: theme.design.border,
          })}
        >
          Try again
        </Button>
      )}
    </Box>
  );
}
