import { Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import React, { useState } from 'react';
import { AutoStopSettings, DEFAULT_AUTO_STOP_SETTINGS, useCurrentResource } from '../../api';

/**
 * The shortest threshold the backend accepts.
 *
 * Anything below an hour would make a live cook stale the moment a reading was
 * a little late, so the backend refuses it — and this card saves on the way out,
 * where a refusal is a failure nobody is looking at. The threshold that is kept
 * to be saved is held at the floor rather than sent to be rejected.
 */
const MINIMUM_IDLE_HOURS = 1;

/**
 * The threshold a typed field is worth saving as, or `null` while it is worth
 * nothing: empty, or half-typed into something that is not a number.
 *
 * Only what is kept to be saved is normalized. What is on screen is whatever
 * was typed, so clearing the field to retype it does not snap the old number
 * back (which would turn "backspace the 6, type 24" into 624) and a zero on its
 * way to "0.5" is not rewritten to 1 under the caret.
 */
const readIdleHoursInput = (raw: string): number | null => {
  const parsed = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(parsed)) {
    return null;
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
 *
 * The field is typed into freely: the raw text is held here while it is being
 * edited, and only the threshold kept for saving is normalized. Leaving the
 * field drops the draft, so the number then on screen is the one that will be
 * stored — never a different one saved out of sight on unmount.
 */
export function AutoStopCard(): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
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
            value={draft ?? String(autoStop.idleHours)}
            onChange={event => {
              const raw = event.target.value;
              setDraft(raw);
              const hours = readIdleHoursInput(raw);
              if (hours !== null) {
                setAutoStop({ idleHours: hours });
              }
            }}
            onBlur={() => setDraft(null)}
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
