import { Box, Typography } from '@mui/material';
import React from 'react';
import { Stats } from '../../api';
import { StatsEmpty } from './StatsEmpty';
import {
  formatCount,
  formatDuration,
  formatNumber,
  formatPounds,
  formatScore,
} from './statsFormat';

export interface StatsContentProps {
  /** The archive, already derived. */
  stats: Stats;
}

interface HeroCardProps {
  testId: string;
  /** What the number is: `Total time smoked`. */
  label: string;
  /** The number itself, already written out. */
  value: string;
  /** The line under it that gives the number its context. */
  detail: string;
}

/**
 * One of the two headline numbers.
 *
 * Set large and alone on its own card, because these two are what the screen is
 * for: everything below is a breakdown of them.
 */
function HeroCard({ testId, label, value, detail }: HeroCardProps): JSX.Element {
  return (
    <Box
      data-testid={testId}
      sx={theme => ({
        flex: 1,
        minWidth: 0,
        padding: '16px',
        borderRadius: '16px',
        border: `1px solid ${theme.design.border}`,
        backgroundColor: theme.design.surface,
      })}
    >
      <Typography
        component="p"
        sx={theme => ({
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: theme.design.textSecondary,
        })}
      >
        {label}
      </Typography>
      <Typography
        component="p"
        sx={theme => ({
          marginTop: '6px',
          fontSize: '1.75rem',
          fontWeight: 700,
          lineHeight: 1.1,
          color: theme.design.accent,
        })}
      >
        {value}
      </Typography>
      <Typography
        component="p"
        sx={theme => ({
          marginTop: '4px',
          fontSize: '0.8125rem',
          color: theme.design.textSecondary,
        })}
      >
        {detail}
      </Typography>
    </Box>
  );
}

/** One cell of the secondary grid: a figure and what it is. */
function StatCell({
  testId,
  label,
  value,
}: {
  testId: string;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <Box
      data-testid={testId}
      sx={theme => ({
        padding: '12px',
        borderRadius: '14px',
        border: `1px solid ${theme.design.border}`,
        backgroundColor: theme.design.surfaceAlt,
      })}
    >
      <Typography
        component="p"
        sx={theme => ({
          fontSize: '1.125rem',
          fontWeight: 700,
          color: theme.design.text,
        })}
      >
        {value}
      </Typography>
      <Typography
        component="p"
        sx={theme => ({ fontSize: '0.75rem', color: theme.design.textSecondary })}
      >
        {label}
      </Typography>
    </Box>
  );
}

/**
 * The Stats screen's figures.
 *
 * Presentational on purpose: it is handed a derived archive and writes it down.
 * Nothing here reads the backend, so the layout can be exercised against any
 * archive a test cares to describe — including the one nobody has cooked into,
 * which gets a greeting rather than a grid of zeros. A screen full of `0`s is
 * indistinguishable from a broken read, and it is the first thing a new user
 * would ever see.
 */
export function StatsContent({ stats }: StatsContentProps): JSX.Element {
  if (stats.totalSessions === 0) {
    return <StatsEmpty />;
  }

  const cells: { testId: string; label: string; value: string }[] = [
    {
      testId: 'stat-sessions',
      label: 'Sessions',
      value: formatCount(stats.totalSessions),
    },
    {
      testId: 'stat-average-rating',
      label: 'Avg rating',
      value: formatScore(stats.averageRating),
    },
    {
      testId: 'stat-average-cook',
      label: 'Avg cook time',
      value: formatDuration(stats.averageCookMs),
    },
    {
      testId: 'stat-total-rest',
      label: 'Total rest',
      value: formatDuration(stats.totalRestMs),
    },
    {
      testId: 'stat-wood-types',
      label: 'Wood types',
      value: formatNumber(stats.woodTypeCount),
    },
    {
      testId: 'stat-meat-types',
      label: 'Meat types',
      value: formatNumber(stats.meatTypeCount),
    },
  ];

  return (
    <Box
      data-testid="stats-content"
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px 16px' }}
    >
      <Box sx={{ display: 'flex', gap: '12px' }}>
        <HeroCard
          testId="stat-total-time"
          label="Total time smoked"
          value={formatDuration(stats.totalCookMs)}
          detail={`across ${formatCount(stats.totalSessions)} sessions`}
        />
        <HeroCard
          testId="stat-total-meat"
          label="Meat smoked"
          value={formatPounds(stats.totalPounds)}
          // An archive nobody weighed anything into feeds an unknown number of
          // people; "≈ 0 servings" would be a claim, and the wrong one.
          detail={
            stats.approximateServings === null
              ? 'no weights on record'
              : `≈ ${formatCount(stats.approximateServings)} servings`
          }
        />
      </Box>
      <Box
        data-testid="stats-grid"
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}
      >
        {cells.map(cell => (
          <StatCell key={cell.testId} {...cell} />
        ))}
      </Box>
    </Box>
  );
}
