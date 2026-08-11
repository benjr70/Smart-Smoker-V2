import { Box, Button, Typography } from '@mui/material';
import React from 'react';

export interface SmokeCompleteProps {
  /** Take the user to the history of finished cooks, this one at the top of it. */
  onViewHistory: () => void;
}

/**
 * The end of a cook: the design's completion screen.
 *
 * Finishing used to drop the user back onto an empty pre-smoke form. Nothing
 * said whether the session had been archived or discarded, and the one thing
 * anybody wants next — to look at what was just recorded — took a trip through
 * the navigation bar to find. This says the session is saved and offers the
 * place it was saved to.
 *
 * It takes the place of the step being edited and no more than that: the header
 * and the step control stay above it, exactly as the design has them, so the
 * next cook is begun by tapping a step. Replacing the whole wizard instead
 * would strand the user — the Smoke tab is already the screen in effect, so
 * tapping it again mounts nothing new and there would be no way out but the
 * long way round through another screen.
 *
 * It is only ever shown once the archive *and* the clear have landed, so what it
 * says about the session having been saved is something that happened rather
 * than something that was attempted.
 */
export function SmokeComplete({ onViewHistory }: SmokeCompleteProps): JSX.Element {
  return (
    <Box
      data-testid="smoke-complete"
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '10px',
        padding: '48px 24px',
      }}
    >
      {/* The cut of meat the whole thing was about. It says nothing a screen
          reader needs to hear that the heading under it does not say. */}
      <Box aria-hidden="true" sx={{ fontSize: 64, lineHeight: 1 }}>
        🥩
      </Box>
      <Typography
        component="h2"
        sx={theme => ({
          fontSize: '1.5rem',
          fontWeight: 700,
          lineHeight: 1.2,
          color: theme.design.text,
        })}
      >
        Smoke Complete!
      </Typography>
      <Typography
        component="p"
        sx={theme => ({
          fontSize: '0.9375rem',
          lineHeight: 1.4,
          color: theme.design.textSecondary,
        })}
      >
        Your session has been saved to history.
      </Typography>
      <Button
        variant="contained"
        data-testid="smoke-complete-view-history"
        onClick={onViewHistory}
        sx={{ marginTop: '10px', minWidth: '180px' }}
      >
        View History
      </Button>
    </Box>
  );
}
