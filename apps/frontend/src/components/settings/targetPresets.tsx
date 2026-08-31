import { Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import { TargetPresets, defaultNotificationSettings, useCurrentResource } from '../../api';

/** The categories, in the order the mock lists them, with the label each shows. */
const CATEGORIES: ReadonlyArray<{ key: keyof TargetPresets; label: string }> = [
  { key: 'beef', label: 'Beef' },
  { key: 'pork', label: 'Pork' },
  { key: 'poultry', label: 'Poultry' },
];

/**
 * Read a temperature field. An empty or half-typed value keeps the previous
 * number rather than saving NaN, which the backend's strict validation would
 * reject on unmount.
 */
const readTemperatureInput = (raw: string, fallback: number): number => {
  const parsed = Number(raw);
  return raw.trim() === '' || Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * The mock's Default target temps card: one editable temperature per meat
 * category.
 *
 * These are what a cook's probes start at, not what they are stuck with — the
 * backend applies the matching one when a session starts, and only to probes
 * nobody has typed a temperature into. The card says so, because a number
 * labelled "Beef" with no explanation reads like a rule rather than a starting
 * point.
 *
 * It saves its own block rather than the whole settings document: the alerts
 * card is on screen beside it and edits the same document, so a save carrying
 * everything would undo whatever the other card had just changed.
 */
export function TargetPresetsCard(): JSX.Element {
  const [presets, setPresets] = useCurrentResource<TargetPresets>({
    initialValue: defaultNotificationSettings().targetPresets,
    load: async client => (await client.notifications.getSettings())?.targetPresets,
    save: (client, value) => client.notifications.saveTargetPresets(value),
    loadErrorMessage: 'Could not load default target temps.',
    saveErrorMessage: 'Could not save default target temps.',
  });

  const update = (change: Partial<TargetPresets>) =>
    setPresets(current => ({ ...current, ...change }));

  return (
    // No spacing wrapper: the settings page stacks its cards and owns the gap
    // between them.
    <Card data-testid="settings-target-presets-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Default target temps
          </Typography>

          <Stack direction="row" spacing={2} data-testid="settings-target-presets-fields">
            {CATEGORIES.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                type="number"
                size="small"
                variant="outlined"
                value={presets[key]}
                onChange={event =>
                  update({ [key]: readTemperatureInput(event.target.value, presets[key]) })
                }
                inputProps={{ 'data-testid': `settings-target-preset-${key}` }}
                sx={{ flex: 1 }}
              />
            ))}
          </Stack>

          {/*
            The explanation gets its own row, like the card's other explanatory
            copy below. Beside the field it squeezed the fixed 140px down to
            ~59px at the phone width this app ships at, clipping the label to
            "Wra…" and 165 to "16". flexShrink pins the field at its declared
            width whatever ends up alongside it.
          */}
          <TextField
            label="Wrap at"
            type="number"
            size="small"
            variant="outlined"
            value={presets.wrapTemp}
            onChange={event =>
              update({ wrapTemp: readTemperatureInput(event.target.value, presets.wrapTemp) })
            }
            inputProps={{ 'data-testid': 'settings-wrap-temp' }}
            data-testid="settings-wrap-temp-field"
            sx={{ width: 140, flexShrink: 0 }}
          />
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-wrap-temp-summary"
          >
            The Serve Plan reminds you to wrap around this temperature until you log a wrap on the
            cook log.
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-target-presets-summary"
          >
            Applied to the probes you are watching when a cook starts, matched to the meat type you
            entered in pre-smoke. A target you set yourself is never overwritten.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
