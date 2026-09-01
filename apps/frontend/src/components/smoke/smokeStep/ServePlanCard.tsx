import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { Box, Card, IconButton, Stack, Typography } from '@mui/material';
import React from 'react';
import { ServePlanMilestone, ServePlanStatus } from '../../../api';

export interface ServePlanCardProps {
  /** The plan as the backend last judged it. */
  plan: ServePlanStatus;
  /** Move the moment the food hits the table. */
  onServeAtChange: (serveAt: Date) => void;
  /** Change how long the meat rests, in minutes. */
  onRestChange: (restMinutes: number) => void;
}

/**
 * A span of minutes as the design writes it: `20m`, and `1h 05m` once it is an
 * hour or more — the same shape the completion card's remaining time takes, so
 * two cards in one column do not spell the same quantity two ways.
 */
export const spanOf = (minutes: number): string => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/**
 * The verdict in words, with the amount it is off by.
 *
 * The verdict is the backend's and is only ever read here: it is worked out
 * once, server-side, so this card, the touchscreen and the push notification
 * cannot disagree about whether dinner is on time.
 */
export const headlineOf = (plan: ServePlanStatus): string => {
  const slack = plan.slackMinutes;
  // No slack is no trustworthy projection, which is the only thing that makes
  // the verdict unknown — and the only state with no amount to say. The card
  // says so rather than bluffing a time.
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
      // schedule" with four minutes in hand and with fifty is not the same
      // news to somebody deciding whether to open another beer.
      return slack >= 0
        ? `On schedule · ${spanOf(slack)} spare`
        : `On schedule · ${spanOf(-slack)} behind`;
  }
};

/** The next move that comes with the number. */
export const adviceOf = (plan: ServePlanStatus): string => {
  switch (plan.verdict) {
    case 'ontrack':
      return 'Hold your pace — dinner is on plan';
    case 'behind':
      return 'Raise the pit or shorten the rest';
    case 'early':
      return 'Hold it warm, or bring dinner forward';
    default:
      return 'Waiting for a steady estimate';
  }
};

/**
 * The warning a cook beyond their own tolerance gets, or `null` for one still
 * inside it.
 *
 * "Beyond the tolerance" is not measured here: it *is* the verdict, and the
 * verdict was decided by the backend against the tolerance the user set. The
 * banner says which side of the plan the cook fell off, and by how much.
 */
export const offPlanWarning = (plan: ServePlanStatus): string | null => {
  const slack = plan.slackMinutes ?? 0;
  if (plan.verdict === 'behind') {
    return `Off plan — dinner will be ${spanOf(-slack)} later than you planned`;
  }
  if (plan.verdict === 'early') {
    return `Off plan — the meat is ready ${spanOf(slack)} before you planned`;
  }
  return null;
};

/** A moment as a clock time in the reader's own locale and zone. */
const clockTime = (moment: Date): string =>
  moment.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * One line of the schedule, in the words the milestone is about.
 *
 * The wrap is a temperature rather than a time — it happens when the meat gets
 * there, not at a moment anybody can name — so it is the one line without a
 * clock on it.
 */
export const milestoneLine = (milestone: ServePlanMilestone): string => {
  switch (milestone.kind) {
    case 'wrap':
      return `Wrap around ${milestone.temp ?? '—'}°F`;
    case 'pullBy':
      return `Pull by ${milestone.at ? clockTime(milestone.at) : '—'}`;
    default:
      return `Rest until ${milestone.at ? clockTime(milestone.at) : '—'}`;
  }
};

/**
 * One row of the plan that is edited rather than read: a name, the value as it
 * is stored, and a tap either side of it.
 *
 * Steppers rather than fields, and quarter-hours rather than minutes, because
 * the plan is edited at the pit, one-handed, on a phone nobody wants to type a
 * time into — the same reason the tolerance in the settings is stepped.
 */
const StepperRow = ({
  label,
  value,
  testId,
  downLabel,
  upLabel,
  onDown,
  onUp,
}: {
  label: string;
  value: string;
  testId: string;
  downLabel: string;
  upLabel: string;
  onDown: () => void;
  onUp: () => void;
}): JSX.Element => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
    <Typography variant="body2" sx={theme => ({ color: theme.design.textSecondary })}>
      {label}
    </Typography>
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <IconButton size="small" aria-label={downLabel} onClick={onDown}>
        <RemoveIcon fontSize="small" />
      </IconButton>
      <Typography
        data-testid={testId}
        variant="body1"
        fontWeight={600}
        sx={{ minWidth: 80, textAlign: 'center' }}
      >
        {value}
      </Typography>
      <IconButton size="small" aria-label={upLabel} onClick={onUp}>
        <AddIcon fontSize="small" />
      </IconButton>
    </Stack>
  </Stack>
);

/** How far one tap moves the serving time, or the rest: a quarter of an hour. */
export const PLAN_STEP_MINUTES = 15;

/**
 * How long the meat may be asked to rest, in minutes.
 *
 * None is a real answer — a cook that carves straight off the pit rests for
 * nothing — and six hours is longer than any rest a cook plans; beyond it the
 * stepper is being held down rather than used.
 */
export const MIN_REST_MINUTES = 0;
export const MAX_REST_MINUTES = 360;

/**
 * The cook read backwards from the moment the food hits the table.
 */
export function ServePlanCard({
  plan,
  onServeAtChange,
  onRestChange,
}: ServePlanCardProps): JSX.Element {
  const offPlan = offPlanWarning(plan);

  /** Move dinner, in the quarter-hours the plan is made in. */
  const stepServeAt = (steps: number): void =>
    onServeAtChange(new Date(plan.serveAt.getTime() + steps * PLAN_STEP_MINUTES * 60_000));

  /**
   * Change the rest, held inside the range a rest lives in — and asked for only
   * when it actually moves, so a tap at either end writes nothing rather than
   * storing the value that is already stored.
   */
  const stepRest = (steps: number): void => {
    const next = Math.min(
      MAX_REST_MINUTES,
      Math.max(MIN_REST_MINUTES, plan.restMinutes + steps * PLAN_STEP_MINUTES)
    );
    if (next !== plan.restMinutes) {
      onRestChange(next);
    }
  };

  return (
    <Card data-testid="smoke-serve-plan-card" sx={{ padding: '14px' }}>
      <Typography
        component="h2"
        sx={theme => ({
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          lineHeight: 1.3,
          color: theme.design.textSecondary,
        })}
      >
        SERVE PLAN
      </Typography>
      <Typography
        data-testid="serve-plan-headline"
        sx={theme => ({
          fontSize: '1.5rem',
          fontWeight: 700,
          lineHeight: 1.2,
          color: theme.design.text,
        })}
      >
        {headlineOf(plan)}
      </Typography>
      <Typography
        data-testid="serve-plan-advice"
        variant="body2"
        sx={theme => ({ color: theme.design.textSecondary })}
      >
        {adviceOf(plan)}
      </Typography>
      {offPlan !== null && (
        // Said out loud, in the danger colour, because this is the state the
        // planner exists for: everything else on the card is a number to glance
        // at, and this one is a decision to make.
        <Box
          data-testid="serve-plan-off-plan"
          role="status"
          sx={theme => ({
            marginTop: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: theme.design.danger,
            border: `1px solid ${theme.design.danger}`,
          })}
        >
          {offPlan}
        </Box>
      )}
      {/* The two halves of the plan, as the only two things about it anybody
          sets: when dinner is, and how long the meat rests first. */}
      <Stack spacing={0.5} sx={{ marginTop: '10px' }}>
        <StepperRow
          label="Serving at"
          value={clockTime(plan.serveAt)}
          testId="serve-plan-serve-at"
          downLabel="Serve earlier"
          upLabel="Serve later"
          onDown={() => stepServeAt(-1)}
          onUp={() => stepServeAt(1)}
        />
        <StepperRow
          label="Rest for"
          value={spanOf(plan.restMinutes)}
          testId="serve-plan-rest"
          downLabel="Rest less"
          upLabel="Rest longer"
          onDown={() => stepRest(-1)}
          onUp={() => stepRest(1)}
        />
      </Stack>
      {/* The plan as the schedule it reads as, in the order it happens — the
          list is the backend's, so a wrap already stamped simply stops being
          part of it. */}
      <Stack
        component="ul"
        spacing={0.5}
        sx={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}
      >
        {plan.milestones.map(milestone => (
          <Box
            component="li"
            key={milestone.kind}
            data-testid="serve-plan-milestone"
            sx={theme => ({
              fontSize: '0.875rem',
              color: theme.design.textSecondary,
            })}
          >
            {milestoneLine(milestone)}
          </Box>
        ))}
      </Stack>
    </Card>
  );
}
