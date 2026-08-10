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
 * The row is not a card. It sits directly on the page background, above the
 * cards below it, so the cook's state reads as a caption over the screen rather
 * than as one more panel competing with them.
 *
 * The dot pulses only while the cook runs, so the one moving thing on the
 * screen means the one thing worth noticing from across a garage. It carries
 * the state as an attribute as well as a colour, because colour alone is not a
 * statement anyone can read — the label beside it is the state in words, the
 * colour only reinforces them, and the attribute is what a test (and any
 * tooling) reads it by.
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
        sx={theme => ({
          fontWeight: 600,
          // A running cook reads in the design's positive green, picking up the
          // green of the dot beside it; a stopped one drops back to supporting
          // ink, so nothing idle is dressed up as something happening.
          color: smoking ? theme.design.success : theme.design.textSecondary,
        })}
        variant="body2"
      >
        {smoking ? 'Smoking' : 'Paused'}
      </Typography>
      {/* The clock is labelled, because a bare 02:16:21 in the corner of a
          cooking screen could be a time of day as easily as an age. The caption
          is deliberately outside the clock element: that element holds the
          formatted time and nothing else, for anything reading it. */}
      <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography sx={theme => ({ color: theme.design.textSecondary })} variant="body2">
          Elapsed
        </Typography>
        <Typography
          data-testid="smoke-elapsed-clock"
          sx={theme => ({
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            color: theme.design.text,
          })}
          variant="body2"
        >
          {elapsed}
        </Typography>
      </Box>
    </Box>
  );
}
