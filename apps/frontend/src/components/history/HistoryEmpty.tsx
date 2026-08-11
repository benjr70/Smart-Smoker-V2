import { Box, Button, Typography } from '@mui/material';
import React from 'react';
import { HistoryEmptyState } from './historyQuery';

export interface HistoryEmptyProps {
  /** Which of the two empty lists this is. */
  state: HistoryEmptyState;
  /** Called when the user asks for their filters back. */
  onClearFilters: () => void;
}

/** What each empty list says, and whether it can be recovered from. */
const COPY: Record<HistoryEmptyState, { title: string; detail: string }> = {
  'never-smoked': {
    title: 'No smokes logged yet',
    detail: 'Finish a smoke and it will show up here.',
  },
  'no-matches': {
    title: 'No sessions found',
    detail: 'Try a different search or clear your filters.',
  },
};

/**
 * The history list with nothing in it.
 *
 * The two reasons for that are different problems and get different screens: a
 * user with no cooks is told how to get one, and a user whose filters matched
 * nothing is handed the filters back. Telling them apart is the query module's
 * job; saying it is this one's.
 */
export function HistoryEmpty({ state, onClearFilters }: HistoryEmptyProps): JSX.Element {
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
      {state === 'no-matches' && (
        <Button
          variant="outlined"
          size="small"
          onClick={onClearFilters}
          sx={theme => ({
            marginTop: '6px',
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            color: theme.design.text,
            borderColor: theme.design.border,
          })}
        >
          Clear filters
        </Button>
      )}
    </Box>
  );
}
