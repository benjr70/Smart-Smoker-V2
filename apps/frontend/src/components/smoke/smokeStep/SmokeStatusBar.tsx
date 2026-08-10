import React from 'react';
import { Box, Typography } from '@mui/material';
import { useElapsed } from 'smoke-session/src/react';

export interface SmokeStatusBarProps {
  /** Whether the cook is running right now. */
  smoking: boolean;
  /** When the cook started, or `null` when it has not been started yet. */
  startedAt: Date | null;
}

/**
 * The smoke step's status bar: whether the cook is running, and how long it has
 * been.
 *
 * The dot pulses only while the cook runs, so the one moving thing on the
 * screen means the one thing worth noticing from across a garage. It carries
 * the state as an attribute as well as a colour, because colour alone is not a
 * statement anyone can read — the label beside it is the state in words, and
 * the attribute is what a test (and any tooling) reads it by.
 *
 * The clock is not kept here: it is derived from the recorded start against the
 * current time by the shared elapsed hook, so it is right the moment this
 * mounts rather than counting from whenever the screen was opened. It reads the
 * age of the cook, not the time the smoker spent lit, so pausing does not stop
 * it — a cook paused for an hour is an hour older. It reads zero only once
 * there is no cook, which is when `startedAt` comes back `null`.
 */
export function SmokeStatusBar({ smoking, startedAt }: SmokeStatusBarProps): JSX.Element {
  const elapsed = useElapsed(startedAt);

  return (
    <Box
      data-testid="smoke-status-bar"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderRadius: 1,
        // Named through the palette rather than a token, so the bar repaints
        // with the scheme the rest of the screen is in.
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        data-testid="smoke-status-dot"
        data-smoking={String(smoking)}
        sx={theme => ({
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: smoking ? theme.design.probes.chamber : theme.palette.text.disabled,
          // Only a running cook pulses. A paused one is still a dot, not a
          // missing one: the row keeps its shape whichever state it is in.
          animation: smoking ? 'smoke-status-pulse 2s ease-in-out infinite' : 'none',
          '@keyframes smoke-status-pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.25 },
          },
        })}
      />
      <Typography
        data-testid="smoke-status-label"
        sx={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}
        variant="body2"
      >
        {smoking ? 'Smoking' : 'Paused'}
      </Typography>
      <Typography
        data-testid="smoke-elapsed-clock"
        sx={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
        variant="body2"
      >
        {elapsed}
      </Typography>
    </Box>
  );
}
