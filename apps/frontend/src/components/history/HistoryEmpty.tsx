import { Box, Button, Typography } from '@mui/material';
import React from 'react';
import { HistoryEmptyState } from './historyQuery';

/**
 * Every reason the list has nothing on it.
 *
 * The query module tells the two *filtering* reasons apart; `load-failed` is
 * not one of its business — it is the read, not the list, that came back with
 * nothing, and only the screen holding the read knows that.
 */
export type HistoryEmptyKind = HistoryEmptyState | 'load-failed';

export interface HistoryEmptyProps {
  /** Which empty list this is. */
  state: HistoryEmptyKind;
  /** Called when the user asks for their filters back. */
  onClearFilters: () => void;
  /** Called when the user asks for the history to be read again. */
  onRetry: () => void;
}

/** What each empty list says, and whether it can be recovered from. */
const COPY: Record<HistoryEmptyKind, { title: string; detail: string }> = {
  'never-smoked': {
    title: 'No smokes logged yet',
    detail: 'Finish a smoke and it will show up here.',
  },
  'no-matches': {
    title: 'No sessions found',
    detail: 'Try a different search or clear your filters.',
  },
  'load-failed': {
    title: 'Could not load your history',
    detail: 'Your smokes are still there. Check your connection and try again.',
  },
};

/**
 * The history list with nothing in it.
 *
 * The reasons for that are different problems and get different screens: a
 * user with no cooks is told how to get one, a user whose filters matched
 * nothing is handed the filters back, and a user whose history would not load
 * is told that it is still there and offered another go. Telling the first two
 * apart is the query module's job; saying any of them is this one's.
 */
export function HistoryEmpty({ state, onClearFilters, onRetry }: HistoryEmptyProps): JSX.Element {
  const { title, detail } = COPY[state];

  return (
    <Box
      data-testid={`history-empty-${state}`}
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
      {/* Only the recoverable empty lists carry a control: there is no button
          that gives a user who has never cooked anything a history. */}
      {state !== 'never-smoked' && (
        <Button
          variant="outlined"
          size="small"
          onClick={state === 'no-matches' ? onClearFilters : onRetry}
          sx={theme => ({
            marginTop: '6px',
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            color: theme.design.text,
            borderColor: theme.design.border,
          })}
        >
          {state === 'no-matches' ? 'Clear filters' : 'Try again'}
        </Button>
      )}
    </Box>
  );
}
