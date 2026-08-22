import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React from 'react';
import { MeatStat, Stats, WoodStat } from '../../api';
import { StatBarRow } from './StatBarRow';
import { StatRecordRow } from './StatRecordRow';
import { StatsEmpty } from './StatsEmpty';
import { StatsSection } from './StatsSection';
import {
  formatCount,
  formatDuration,
  formatNumber,
  formatPlural,
  formatPounds,
  formatScore,
  formatTemperature,
} from './statsFormat';

/** Ratings are scored out of ten, everywhere in the app. */
const SCORE_SCALE = 10;

/** The most-cooked meat's total, which every bar in a section is drawn against. */
const largest = (values: number[]): number => Math.max(1, ...values);

/** Most cooked first; the wire's order is not what the ranking is read from. */
const bySessions = <T extends { sessions: number }>(rows: T[]): T[] =>
  [...rows].sort((left, right) => right.sessions - left.sessions);

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
  const { design } = useTheme();

  // The chart's four reading colours, reused so a breakdown of five meats does
  // not need five more tokens invented for it: the rotation only has to tell
  // adjacent bars apart.
  const rotation = [
    design.probes.chamber,
    design.probes.probe1,
    design.probes.probe2,
    design.probes.probe3,
  ];

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
      <StatsSection testId="stats-records" title="Personal records">
        <StatRecordRow
          testId="stat-record-highest-rated"
          label="Highest rated"
          record={stats.records.highestRated}
          format={value => `${formatScore(value)} / 10`}
        />
        <StatRecordRow
          testId="stat-record-longest-cook"
          label="Longest cook"
          record={stats.records.longestCook}
          format={formatDuration}
        />
        <StatRecordRow
          testId="stat-record-heaviest-cut"
          label="Heaviest cut"
          record={stats.records.heaviestCut}
          format={formatPounds}
        />
        <StatRecordRow
          testId="stat-record-hottest-chamber"
          label="Hottest chamber"
          record={stats.records.hottestChamber}
          format={formatTemperature}
        />
      </StatsSection>
      <MeatSection meats={stats.byMeat} rotation={rotation} />
      <WoodSection woods={stats.byWood} color={design.accent} />
      <ScoreSection averages={stats.categoryAverages} color={design.accent} />
    </Box>
  );
}

/** The by-meat breakdown: what has been through the smoker, most-cooked first. */
function MeatSection({
  meats,
  rotation,
}: {
  meats: MeatStat[];
  rotation: string[];
}): JSX.Element | null {
  if (meats.length === 0) return null;

  const ranked = bySessions(meats);
  const most = largest(ranked.map(meat => meat.sessions));

  return (
    <StatsSection testId="stats-by-meat" title="By meat" note={formatPlural(ranked.length, 'type')}>
      {ranked.map((meat, index) => (
        <StatBarRow
          key={meat.meatType}
          testId="stat-meat-row"
          label={meat.meatType}
          value={`${formatPlural(meat.sessions, 'session')} · ${formatPounds(meat.pounds)}`}
          fraction={meat.sessions / most}
          color={rotation[index % rotation.length]}
        />
      ))}
    </StatsSection>
  );
}

/** The favourite-wood breakdown, and which wood that actually is. */
function WoodSection({ woods, color }: { woods: WoodStat[]; color: string }): JSX.Element | null {
  if (woods.length === 0) return null;

  const ranked = bySessions(woods);
  const most = largest(ranked.map(wood => wood.sessions));

  return (
    <StatsSection
      testId="stats-by-wood"
      title="Favorite wood"
      // The answer to "which wood do I reach for?" stated outright, rather than
      // left to be read off the longest bar.
      note={`${ranked[0].woodType} leads`}
    >
      {ranked.map(wood => (
        <StatBarRow
          key={wood.woodType}
          testId="stat-wood-row"
          label={wood.woodType}
          value={formatPlural(wood.sessions, 'cook')}
          fraction={wood.sessions / most}
          color={color}
        />
      ))}
    </StatsSection>
  );
}

/**
 * The average score per rating category.
 *
 * These bars are the one set on the screen not drawn against each other: a
 * category is scored out of ten, and shrinking the scale to the best category
 * would turn every archive's strongest score into a full bar.
 */
function ScoreSection({
  averages,
  color,
}: {
  averages: Stats['categoryAverages'];
  color: string;
}): JSX.Element {
  const categories: { testId: string; label: string; score: number | null }[] = [
    { testId: 'stat-score-smoke-flavor', label: 'Smoke flavor', score: averages.smokeFlavor },
    { testId: 'stat-score-seasoning', label: 'Seasoning', score: averages.seasoning },
    { testId: 'stat-score-tenderness', label: 'Tenderness', score: averages.tenderness },
    { testId: 'stat-score-overall-taste', label: 'Overall taste', score: averages.overallTaste },
  ];

  return (
    <StatsSection testId="stats-scores" title="Average scores" note="out of 10">
      {categories.map(category => (
        <StatBarRow
          key={category.testId}
          testId={category.testId}
          label={category.label}
          value={formatScore(category.score)}
          fraction={category.score === null ? 0 : category.score / SCORE_SCALE}
          color={color}
        />
      ))}
    </StatsSection>
  );
}
