import { Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import { AutoStopSettings, DEFAULT_AUTO_STOP_SETTINGS, useCurrentResource } from '../../api';

/**
 * The shortest threshold the backend accepts.
 *
 * Anything below an hour would make a live cook stale the moment a reading was
 * a little late, so the backend refuses it — and this card saves on the way out,
 * where a refusal is a failure nobody is looking at. The field holds at the
 * floor rather than sending something that would be rejected.
 */
const MINIMUM_IDLE_HOURS = 1;

/**
 * Read the hours field. An empty or half-typed value keeps the previous number
 * rather than saving NaN, and anything under the floor is held at it — both are
 * values the backend's strict validation would reject on unmount.
 */
const readIdleHoursInput = (raw: string, fallback: number): number => {
  const parsed = Number(raw);
  if (raw.trim() === '' || Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(parsed, MINIMUM_IDLE_HOURS);
};

/**
 * The Auto-stop card: how long a cook's readings may stop before the app decides
 * the cook is over.
 *
 * The number matters beyond this screen — a cook that nobody ended is stopped
 * on it, and its finish is backdated to its last real reading — so the card
 * says what it does rather than showing a bare number of hours.
 *
 * It saves its own block, like the cards beside it: they all edit one settings
 * document, and a save carrying the whole thing would undo whichever edit
 * another card had just made.
 */
export function AutoStopCard(): JSX.Element {
  const [autoStop, setAutoStop] = useCurrentResource<AutoStopSettings>({
    initialValue: DEFAULT_AUTO_STOP_SETTINGS,
    load: client => client.autoStop.get(),
    save: (client, value) => client.autoStop.save(value),
    loadErrorMessage: 'Could not load the auto-stop threshold.',
    saveErrorMessage: 'Could not save the auto-stop threshold.',
  });

  return (
    <Card data-testid="settings-auto-stop-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Auto-stop
          </Typography>

          <TextField
            label="Hours idle"
            type="number"
            size="small"
            variant="outlined"
            value={autoStop.idleHours}
            onChange={event =>
              setAutoStop({
                idleHours: readIdleHoursInput(event.target.value, autoStop.idleHours),
              })
            }
            inputProps={{ min: MINIMUM_IDLE_HOURS, 'data-testid': 'settings-auto-stop-hours' }}
            sx={{ maxWidth: 160 }}
          />

          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-auto-stop-summary"
          >
            A cook still marked as smoking is auto-stopped once its readings have stopped for this
            long, and its finish time is backdated to its last reading. The session stays yours to
            finish in the usual way.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
