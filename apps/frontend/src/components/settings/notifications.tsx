import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { Button, Card, CardContent, Stack, Switch, TextField, Typography } from '@mui/material';
import React from 'react';
import {
  ChamberAlertSettings,
  NotificationSettings,
  defaultNotificationSettings,
  useCurrentResource,
} from '../../api';
import { useTestNotification } from '../../push';

/**
 * How long the chamber must stay outside its range before the backend alerts.
 * Stated here only to describe the behaviour in words; the rule itself lives in
 * the backend's alert engine.
 */
const SUSTAINED_EXCURSION_MINUTES = 2;

/** A temperature as the summary sentence and the mock spell it. */
const degrees = (value: number): string => `${value}°F`;

/**
 * What the current configuration will actually do, in a sentence — so the whole
 * arming/debounce behaviour can be confirmed without mentally simulating it.
 */
export const describeChamberAlert = (chamber: ChamberAlertSettings): string => {
  if (!chamber.enabled) {
    return 'Off — you will not be told when the chamber drifts out of range.';
  }
  return (
    `Once the chamber first reaches ${degrees(chamber.low)}–${degrees(chamber.high)}, ` +
    `you will be told if it stays outside that range for more than ` +
    `${SUSTAINED_EXCURSION_MINUTES} minutes. One alert per excursion.`
  );
};

/**
 * Read a temperature field. An empty or half-typed value stays out of the
 * settings (the previous number is kept) rather than being saved as NaN, which
 * the backend's strict validation would reject on unmount.
 */
const readTemperatureInput = (raw: string, fallback: number): number => {
  const parsed = Number(raw);
  return raw.trim() === '' || Number.isNaN(parsed) ? fallback : parsed;
};

export function NotificationsCard(): JSX.Element {
  const [settings, setSettings] = useCurrentResource<NotificationSettings>({
    initialValue: defaultNotificationSettings(),
    load: client => client.notifications.getSettings(),
    save: (client, value) => client.notifications.saveSettings(value),
    loadErrorMessage: 'Could not load notification settings.',
    saveErrorMessage: 'Could not save notification settings.',
  });
  const { sendTest, sending } = useTestNotification();

  const updateChamber = (change: Partial<ChamberAlertSettings>) =>
    setSettings(current => ({ ...current, chamber: { ...current.chamber, ...change } }));

  const { chamber } = settings;

  return (
    // No spacing wrapper: the settings page stacks its cards and owns the gap
    // between them.
    <Card data-testid="settings-notifications-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Notifications
          </Typography>

          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack>
              <Typography variant="body1" fontWeight={600}>
                Temperature Alert
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tell me when the fire is dying or running away.
              </Typography>
            </Stack>
            <Switch
              checked={chamber.enabled}
              onChange={event => updateChamber({ enabled: event.target.checked })}
              // The accessible name is the handle every caller uses — component
              // tests and the end-to-end suite alike — so the control needs no
              // test-only attribute of its own.
              inputProps={{ 'aria-label': 'Temperature Alert' }}
            />
          </Stack>

          {/* Detail controls appear only for an alert that is switched on, so
              the page is not a wall of inputs that do nothing. */}
          {chamber.enabled && (
            <Stack direction="row" spacing={2} data-testid="settings-chamber-range">
              <TextField
                label="Low"
                type="number"
                size="small"
                variant="outlined"
                value={chamber.low}
                onChange={event =>
                  updateChamber({ low: readTemperatureInput(event.target.value, chamber.low) })
                }
                inputProps={{ 'data-testid': 'settings-chamber-low' }}
                sx={{ width: '50%' }}
              />
              <TextField
                label="High"
                type="number"
                size="small"
                variant="outlined"
                value={chamber.high}
                onChange={event =>
                  updateChamber({ high: readTemperatureInput(event.target.value, chamber.high) })
                }
                inputProps={{ 'data-testid': 'settings-chamber-high' }}
                sx={{ width: '50%' }}
              />
            </Stack>
          )}

          <Typography variant="body2" color="text.secondary" data-testid="settings-chamber-summary">
            {describeChamberAlert(chamber)}
          </Typography>

          <Button
            variant="outlined"
            startIcon={<NotificationsActiveIcon />}
            disabled={sending}
            onClick={sendTest}
            sx={{ alignSelf: 'flex-start' }}
          >
            Send Test Notification
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
