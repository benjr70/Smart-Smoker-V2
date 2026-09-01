import { Box, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { CookServePlan } from '../../api';
import { useDesign } from '../../theme/useDesign';

/** The small upper-case caption the design labels its readouts with. */
const overline = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  lineHeight: 1.3,
} as const;

const MINUTE_MS = 60_000;

/**
 * A span of minutes as the design writes it: `20m`, and `1h 05m` once it is an
 * hour or more — the same words the web card's plan uses, so the phone in the
 * kitchen and the panel in the garage do not spell one quantity two ways.
 */
export const spanOf = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/** A moment as a clock time in the reader's own locale and zone. */
const clockTime = (moment: Date): string =>
  moment.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * How the cook is running against the plan, in words, with the amount it is off
 * by.
 *
 * Read and never re-derived: the verdict is the backend's, worked out once
 * against the tolerance the user set, which is what keeps this glass, the web
 * card and the push notification from disagreeing about whether dinner is on
 * time. The wording is the web card's too, for the same reason.
 */
export const serveStatusOf = (plan: CookServePlan): string => {
  const slack = plan.slackMinutes;
  // No cushion is no trustworthy projection — the only thing that makes the
  // verdict unknown, and the only state with no amount to say. Said as waiting
  // rather than as a number nobody has yet.
  if (slack === null) {
    return 'Gathering data';
  }
  switch (plan.verdict) {
    case 'behind':
      return `Running ${spanOf(-slack)} late`;
    case 'early':
      return `${spanOf(slack)} of cushion`;
    default:
      // On track, either way round: the amount is still said, because "on
      // schedule" with four minutes in hand and with fifty is not the same news
      // to somebody deciding whether to put another log on.
      return slack >= 0
        ? `On schedule · ${spanOf(slack)} spare`
        : `On schedule · ${spanOf(-slack)} behind`;
  }
};

/**
 * How long the meat has left to rest, in words: the span while it is resting,
 * and "Ready to slice" once the rest is up.
 *
 * Measured from the pull the backend stamped rather than from the planned
 * pull-by time, because the rest began when the meat actually came off. A cook
 * pulled twenty minutes early rests its full hour from then, and a plan the
 * pitmaster never quite hit does not have the glass counting down to a moment
 * that has already gone.
 */
export const restCountdown = (pullAt: Date, restMinutes: number | null, now: number): string => {
  const restEnd = pullAt.getTime() + (restMinutes ?? 0) * MINUTE_MS;
  return restEnd <= now ? 'Ready to slice' : spanOf((restEnd - now) / MINUTE_MS);
};

/**
 * The current time, re-read on a tick — or held still when there is nothing
 * counting down, so an idle panel is not re-rendering the whole screen once a
 * second for a readout nobody is showing.
 */
const useNow = (tickMs: number | null): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs === null) {
      return undefined;
    }
    // Read once on the way in as well as on the tick: a panel that comes up
    // mid-rest must not show the moment it was switched on for a whole tick.
    setNow(Date.now());
    const beat = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(beat);
  }, [tickMs]);
  return now;
};

/** How often the rest countdown re-reads the clock: every second, as a clock does. */
export const REST_TICK_MS = 1_000;

export interface ServeReadoutProps {
  /**
   * The plan as the backend judged it, or nothing at all — a cook nobody
   * planned, and an installation with the planner switched off, which answer
   * the same nothing. Nothing is rendered for it: the panel claims no plan the
   * cook does not have.
   */
  plan?: CookServePlan | null;
  /**
   * When the meat came off, once it has. Its arrival is what turns the plan
   * readout into the rest countdown: with the meat off the smoker, when it
   * should have come off is history, and how long it has left to rest is the
   * only thing left to say.
   */
  pullAt?: Date | null;
}

/**
 * The Serve Plan as the touchscreen mirrors it: one line, read-only.
 *
 * Read-only every word of it. The plan is set on a phone, in the kitchen, by
 * somebody who knows when the guests are arriving; the panel is read at the
 * pit, by somebody in gloves deciding whether to raise the heat. This screen
 * shows them where the cook stands and offers nothing to press.
 */
export function ServeReadout({ plan, pullAt }: ServeReadoutProps): JSX.Element | null {
  const design = useDesign();
  const resting = plan && pullAt ? pullAt : null;
  const now = useNow(resting ? REST_TICK_MS : null);
  if (!plan) {
    return null;
  }
  const label = resting ? 'RESTING' : 'SERVE PLAN';
  const status = resting ? restCountdown(resting, plan.restMinutes, now) : serveStatusOf(plan);
  // The one time worth crossing a garage for, and it changes with the state:
  // while the meat is on, the last moment it can come off; once it is off, when
  // it is ready to carve.
  const at = resting
    ? {
        caption: 'Slice at',
        moment: restEndOf(resting, plan.restMinutes),
        testId: 'smoker-rest-at',
      }
    : { caption: 'Pull by', moment: plan.pullBy, testId: 'smoker-serve-pull-by' };

  return (
    <Box
      data-testid="smoker-serve-readout"
      data-resting={String(resting !== null)}
      sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap' }}
    >
      <Typography component="span" sx={{ ...overline, color: design.textSecondary }}>
        {label}
      </Typography>
      <Typography
        component="span"
        data-testid={resting ? 'smoker-rest-countdown' : 'smoker-serve-status'}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          fontSize: 18,
          color: plan.verdict === 'behind' && !resting ? design.danger : design.text,
        }}
      >
        {status}
      </Typography>
      {/* The time is left off rather than dashed when there is none: a plan with
          no moment on it says nothing, and an em-dash beside a caption reads as
          a moment that failed to load. */}
      {at.moment !== null && (
        <Typography
          component="span"
          data-testid={at.testId}
          sx={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 14,
            color: design.textSecondary,
          }}
        >
          {`${at.caption} ${clockTime(at.moment)}`}
        </Typography>
      )}
    </Box>
  );
}

/** When the rest is up: the moment the meat came off, plus the rest it is doing. */
const restEndOf = (pullAt: Date, restMinutes: number | null): Date =>
  new Date(pullAt.getTime() + (restMinutes ?? 0) * MINUTE_MS);
