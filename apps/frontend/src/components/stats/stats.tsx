import { Box, Typography } from '@mui/material';
import React from 'react';
import { useStats } from '../../api';
import { StatsContent } from './StatsContent';
import { StatsEmpty } from './StatsEmpty';

/**
 * The Stats screen: a lifetime of cooking, added up.
 *
 * The screen does no arithmetic — every figure arrives derived from the stats
 * endpoint, so the numbers here, the numbers a future client shows and the
 * numbers the backend stores cannot drift apart.
 *
 * An archive that has not been read yet says nothing at all: "no stats yet" is
 * a claim about the user's cooking, and nobody has been told what they have
 * cooked until the read lands.
 */
export function Stats(): JSX.Element {
  const { stats, status, refresh } = useStats();

  return (
    <Box data-testid="stats-screen" sx={{ width: '100%' }}>
      <Typography
        component="h1"
        sx={theme => ({
          padding: '20px 16px 12px',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: theme.design.text,
        })}
      >
        Stats
      </Typography>
      {status === 'failed' && <StatsEmpty state="load-failed" onRetry={refresh} />}
      {status === 'loaded' && stats !== null && <StatsContent stats={stats} />}
    </Box>
  );
}
