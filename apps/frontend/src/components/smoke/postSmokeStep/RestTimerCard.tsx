import { Card, LinearProgress, Stack, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';

export interface RestTimerCardProps {
  /** When the meat came off the smoker, as the backend stamped it. */
  pullAt: Date;
  /** What the watched probe read at the pull, °F, or `null` if none was. */
  pullTemp: number | null;
  /** How long the meat rests, in minutes — the cook's one canonical rest. */
  restMinutes: number;
  /** What the meat weighed, in pounds, or `null` if nobody weighed it. */
  weightLb: number | null;
}

/** How often the card re-reads the clock: often enough for a seconds display. */
const TICK_MS = 1000;

/** The moment now, re-read while the card is on screen. */
const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(tick);
  }, []);
  return now;
};

/**
 * A span as a countdown reads it: `50:00`, and `1:05:00` once it is an hour or
 * more. Seconds are shown because the last few minutes of a rest are when
 * somebody is standing over it with a knife.
 */
export const countdownOf = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return hours === 0 ? mmss : `${hours}:${mmss}`;
};

/**
 * Where a cut stops being a small one, in pounds.
 *
 * A brisket, a pork butt or a whole packer sits above it and a chicken, a loin
 * or a couple of racks below — the two carryovers the design distinguishes, and
 * the line the pre-smoke weight is read against.
 */
export const LARGE_CUT_LB = 10;

/** How much further each carries after it comes off, °F. */
export const SMALL_CUT_RISE = 5;
export const LARGE_CUT_RISE = 10;

/**
 * How much further the meat will climb off the heat, °F: the bigger the cut,
 * the more of it there is to go on cooking itself.
 *
 * A cook nobody weighed is given the smaller rise. The peak is a claim about
 * where this meat tops out, and the lesser claim is the one that will not talk
 * somebody into pulling early on the strength of a number the app invented.
 */
export const carryoverRise = (weightLb: number | null): number =>
  weightLb !== null && weightLb >= LARGE_CUT_LB ? LARGE_CUT_RISE : SMALL_CUT_RISE;

/**
 * How long cooked meat may be held warm before it stops being a serving
 * decision and starts being a food-safety one: four hours from the pull.
 */
export const SAFE_HOLD_MINUTES = 4 * 60;

/**
 * How little of that window has to be left before the card says so loudly.
 *
 * Half an hour, because that is about as long as it takes to get people to the
 * table: warned with less than that in hand, the pitmaster is already late.
 */
export const SAFE_HOLD_URGENT_MINUTES = 30;

/** A span as the design writes one: `15m`, and `3h 00m` once it is an hour. */
export const spanOf = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/**
 * The rest, as the pitmaster watches it out: how long is left, how far it has
 * come, what the meat will top out at, and how long it can safely be held.
 */
export function RestTimerCard({
  pullAt,
  pullTemp,
  restMinutes,
  weightLb,
}: RestTimerCardProps): JSX.Element {
  const now = useNow();
  const restMs = restMinutes * 60_000;
  const elapsedMs = now.getTime() - pullAt.getTime();
  const remainingMs = restMs - elapsedMs;
  const rise = carryoverRise(weightLb);
  // Whole minutes, never negative: the window is rendered in minutes, and a
  // window that ran out an hour ago is as gone as one that ran out a minute
  // ago — both say the same thing, which is to serve the food.
  const holdLeftMinutes = Math.max(0, Math.round(SAFE_HOLD_MINUTES - elapsedMs / 60_000));
  const holdUrgent = holdLeftMinutes <= SAFE_HOLD_URGENT_MINUTES;

  return (
    <Card data-testid="rest-timer-card" sx={{ padding: '14px' }}>
      <Stack spacing={0.5}>
        <Typography
          component="h2"
          sx={theme => ({
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: theme.design.textSecondary,
          })}
        >
          REST TIMER
        </Typography>
        <Typography
          data-testid="rest-timer-remaining"
          sx={theme => ({
            fontSize: '1.5rem',
            fontWeight: 700,
            lineHeight: 1.2,
            color: theme.design.text,
          })}
        >
          {/* The end of the rest is a state, not a countdown that has run out:
              a card sitting on `00:00` reads as a timer that stopped, and what
              the pitmaster is waiting to be told is that they can carve. Said
              here and nowhere else — the rest finishing sends no notification,
              because the pitmaster is standing at the counter with the meat. */}
          {remainingMs > 0 ? countdownOf(remainingMs) : 'Ready to slice'}
        </Typography>
        <LinearProgress
          variant="determinate"
          aria-label="Rest progress"
          // A rest of no time at all is over the moment it starts, and is the
          // one case there is nothing to divide by: the bar is full rather
          // than `NaN` wide.
          value={restMs <= 0 ? 100 : Math.min(100, Math.max(0, (elapsedMs / restMs) * 100))}
        />
        {/* Where the meat is headed, said with the rise it is headed there by:
            the number on its own is a peak the pitmaster cannot check, and the
            rise is what tells them the card read their cut as a big one. */}
        {pullTemp !== null && (
          <Typography
            data-testid="rest-timer-carryover"
            variant="body2"
            sx={theme => ({ color: theme.design.textSecondary })}
          >
            {`Expected peak ${pullTemp + rise}°F · +${rise}° carryover`}
          </Typography>
        )}
        {/* On the card the whole time rather than appearing when it matters: a
            warning that shows up unannounced is one the pitmaster has to work
            out, while a number they have been watching count down is one they
            already understand by the time it turns red. */}
        <Typography
          data-testid="rest-timer-safe-hold"
          data-urgent={String(holdUrgent)}
          variant="body2"
          sx={theme => ({
            fontWeight: holdUrgent ? 700 : 400,
            color: holdUrgent ? theme.design.danger : theme.design.textSecondary,
          })}
        >
          {holdLeftMinutes > 0 ? `Safe to hold ${spanOf(holdLeftMinutes)}` : 'Serve now'}
        </Typography>
      </Stack>
    </Card>
  );
}
