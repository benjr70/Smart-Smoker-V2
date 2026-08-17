import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { Box, Card, IconButton, Link, TextField, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { CompletionEstimate } from '../../../api';
import { DesignPalette } from '../../../theme';

/** The watched probe the estimate is about: which slot it is, and its name. */
export interface WatchedProbe {
  slot: string;
  name: string;
}

export interface CompletionCardProps {
  /** The running cook's estimate, or `null` while the first read is in flight. */
  estimate: CompletionEstimate | null;
  /** The probe the estimate is being taken to, or `null` when none is watched. */
  probe: WatchedProbe | null;
  /** Commit an edited target temperature. */
  onTargetChange: (target: number) => void;
  /**
   * Where the no-probe prompt's "Settings" goes. The card does not know how
   * this application navigates — that is the shell's business — so it asks,
   * exactly as the completion screen asks for the way to the history.
   */
  onOpenSettings?: () => void;
}

/** What the card says when nothing is being watched, and the way to fix that. */
export const NO_PROBE_PROMPT = 'Watch a probe in Settings to get an estimate';

/**
 * The temperatures a probe target may be set to, in °F.
 *
 * The same range the settings screen's targets live in: below the low end
 * nothing is cooked, and above the high end nothing is a meat target — a value
 * outside it is a typo, and the editor corrects it rather than sending the
 * estimator off to a temperature the cook will never reach.
 */
export const MIN_TARGET_TEMP = 100;
export const MAX_TARGET_TEMP = 300;

/**
 * How far one press of a stepper moves the target.
 *
 * Five degrees rather than one: the adjustments this row exists for are "take it
 * a bit further" decisions, and a one-degree stepper would need fifteen presses
 * to make the smallest of them.
 */
export const TARGET_STEP = 5;

/** A temperature held inside the range the smoker's targets live in. */
const clampTarget = (value: number): number =>
  Math.min(MAX_TARGET_TEMP, Math.max(MIN_TARGET_TEMP, Math.round(value)));

/** How long is left, as the design writes it: `~2h 05m remaining`. */
const remainingIn = (hours: number): string => {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `~${wholeHours}h ${String(minutes).padStart(2, '0')}m remaining`;
};

/** A moment as a clock time in the reader's own locale and zone. */
const clockTime = (moment: Date): string =>
  moment.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * What the card says, in each of the states the estimator can be in.
 *
 * The states are the backend's own, so the copy is decided in one place from
 * them rather than assembled out of whichever numbers happen to be filled in: a
 * cook with no rate yet and a cook that has plateaued both have no ETA, and
 * only the state tells "Calculating" from "Holding".
 */
const describeEstimate = (
  estimate: CompletionEstimate | null,
  probe: WatchedProbe | null
): { headline: string; detail: string; ready: boolean } => {
  const target = estimate?.targetTemp;
  switch (estimate?.state) {
    case 'ok':
      return {
        headline: estimate.eta ? clockTime(estimate.eta) : '—',
        detail: estimate.hoursRemaining === null ? '' : remainingIn(estimate.hoursRemaining),
        ready: false,
      };
    case 'done':
      return {
        headline: 'Ready now',
        detail: `${probe?.name ?? 'The probe'} reached ${target ?? '—'}°F`,
        ready: true,
      };
    case 'stalled':
      return {
        headline: 'Holding',
        detail: 'Temp plateaued — the stall is normal',
        ready: false,
      };
    case 'paused':
      return { headline: 'Paused', detail: 'Resume smoking to estimate', ready: false };
    case 'warming':
      return { headline: 'Calculating', detail: 'Gathering temperature data', ready: false };
    default:
      // No probe is being watched — or nothing has been read yet, which looks
      // the same and is just as honestly answered with an em-dash.
      return { headline: '—', detail: '', ready: false };
  }
};

/**
 * When the cook will be done, on the screen the cook is watched from.
 */
export function CompletionCard({
  estimate,
  probe,
  onTargetChange,
  onOpenSettings,
}: CompletionCardProps): JSX.Element {
  const { headline, detail, ready } = describeEstimate(estimate, probe);
  const target = estimate?.targetTemp ?? null;
  // What is in the field while it is being typed into. A temperature typed a
  // digit at a time is not a temperature yet — clamping "2" to 100 would rewrite
  // the field under the fingers typing 225 — so the field holds text of its own
  // until it is left, and follows the stored target the rest of the time.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (target === null ? '' : String(target));

  // A target the server has confirmed replaces whatever is in the field: the
  // estimate is re-read after every edit, so this is how the row stops showing
  // an edit of its own and goes back to showing the cook's actual target.
  useEffect(() => {
    setDraft(null);
  }, [target]);

  /**
   * Save a temperature, once it is one: clamped, and shown as saved until the
   * re-read estimate confirms it — the row must not snap back to the old number
   * in the beat between the write and the read that follows it.
   */
  const commit = (value: number): void => {
    const clamped = clampTarget(value);
    setDraft(String(clamped));
    onTargetChange(clamped);
  };

  /** Leaving the field commits what was typed; an empty field commits nothing. */
  const commitDraft = (): void => {
    const typed = Number(draft);
    if (draft === null || draft.trim() === '' || Number.isNaN(typed)) {
      setDraft(null);
      return;
    }
    commit(typed);
  };

  /** A press of a stepper: nothing happens when the target cannot move. */
  const stepBy = (delta: number): void => {
    const base = shown === '' ? target : Number(shown);
    if (base === null || Number.isNaN(base)) {
      return;
    }
    const next = clampTarget(base + delta);
    if (next !== base) {
      commit(next);
    }
  };

  // The bar never runs past its ends, whatever the server measured: a probe
  // read above its target is 100% of the way there, not 104%.
  const percent = Math.min(100, Math.max(0, estimate?.progressPercent ?? 0));
  const climbRate =
    estimate?.ratePerHour === null || estimate?.ratePerHour === undefined
      ? '—'
      : `${estimate.ratePerHour >= 0 ? '+' : '−'}${Math.abs(estimate.ratePerHour).toFixed(1)}°/hr`;
  const probeColour = (probe?.slot ?? '') as keyof DesignPalette['probes'];

  // Nothing is being watched, so there is nothing to estimate towards and
  // nothing to edit: the card keeps its place and says how to turn the estimate
  // on instead of showing a target for a probe nobody is watching.
  const watching = probe !== null && estimate?.state != null;
  // Said only once the backend has answered. Before the first read nothing is
  // known — including whether a probe is being watched — and a card that opened
  // by telling every cook to go to the settings would be wrong far more often
  // than it was right.
  const prompt = estimate !== null && estimate.state === null;

  return (
    <Card data-testid="smoke-completion-card" sx={{ padding: '14px' }}>
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
        ESTIMATED COMPLETION
      </Typography>
      <Typography
        data-testid="completion-headline"
        sx={theme => ({
          fontSize: '2rem',
          fontWeight: 700,
          lineHeight: 1.2,
          // The one state the card celebrates is the one it colours: a cook
          // that is done reads in the design's positive green, everything else
          // in the ordinary ink of a number.
          color: ready ? theme.design.success : theme.design.text,
        })}
      >
        {headline}
      </Typography>
      <Typography
        data-testid="completion-detail"
        variant="body2"
        sx={theme => ({ color: theme.design.textSecondary })}
      >
        {detail}
      </Typography>
      {watching && (
        // The target, editable where the cook is watched from. The same number
        // the settings screen edits — this row writes it there — so a cook is
        // never taken to a temperature only one screen knows about.
        <Box
          data-testid="completion-target-row"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, marginTop: '10px' }}
        >
          <Typography variant="body2" sx={theme => ({ color: theme.design.textSecondary })}>
            Target
          </Typography>
          <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              aria-label="Lower the target temperature"
              data-testid="completion-target-down"
              onClick={() => stepBy(-TARGET_STEP)}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <TextField
              size="small"
              variant="outlined"
              value={shown}
              onChange={event => setDraft(event.target.value)}
              onBlur={commitDraft}
              // Enter is how a phone keyboard leaves a number field, so it has
              // to commit the same edit that walking away from the field does.
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  commitDraft();
                }
              }}
              inputProps={{
                'data-testid': 'completion-target-input',
                'aria-label': 'Target temperature',
                inputMode: 'numeric',
                min: MIN_TARGET_TEMP,
                max: MAX_TARGET_TEMP,
                style: { textAlign: 'center', width: '3.5rem' },
              }}
              type="number"
            />
            <Typography variant="body2" sx={theme => ({ color: theme.design.textSecondary })}>
              °F
            </Typography>
            <IconButton
              size="small"
              aria-label="Raise the target temperature"
              data-testid="completion-target-up"
              onClick={() => stepBy(TARGET_STEP)}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}
      {watching && (
        <Box sx={{ marginTop: '10px' }}>
          {/* How far the meat has come from the temperature it went on at — the
              anchor is the server's first reading of this cook, not whatever the
              chart's rolling window happens to start at, so the bar does not
              jump when the chart scrolls. */}
          <Box
            data-testid="completion-progress"
            role="progressbar"
            aria-label="Progress towards the target temperature"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            sx={theme => ({
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: theme.design.border,
            })}
          >
            {/* Two plain elements rather than Material-UI's progress bar: the
                fill is painted in the watched probe's own colour, and that
                component insists on a palette colour for it. */}
            <Box
              data-testid="completion-progress-fill"
              sx={theme => ({
                height: '100%',
                width: `${percent}%`,
                borderRadius: 3,
                transition: 'width 400ms ease',
                // The bar is the probe's, so it is drawn in the probe's colour —
                // the same one that names it on the readings card and draws it
                // on the chart — and turns positive green once it is done.
                backgroundColor: ready
                  ? theme.design.success
                  : (theme.design.probes[probeColour] ?? theme.design.accent),
              })}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', gap: 1 }}>
            <Typography
              data-testid="completion-rate"
              variant="body2"
              sx={theme => ({ color: theme.design.textSecondary })}
            >
              {climbRate}
            </Typography>
            <Typography
              data-testid="completion-target-caption"
              variant="body2"
              sx={theme => ({ color: theme.design.textSecondary })}
            >
              {target === null ? 'Target —' : `Target ${target}°F`}
            </Typography>
          </Box>
        </Box>
      )}
      {prompt && (
        // A button rather than an anchor: this application navigates by state,
        // not by URL, so there is no address for the settings screen to link to
        // — but it reads and behaves as the link the prompt promises.
        <Link
          component="button"
          type="button"
          data-testid="completion-settings-link"
          underline="hover"
          variant="body2"
          sx={theme => ({ color: theme.design.accent, textAlign: 'left' })}
          onClick={() => onOpenSettings?.()}
        >
          {NO_PROBE_PROMPT}
        </Link>
      )}
    </Card>
  );
}
