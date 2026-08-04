import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import React from 'react';
import {
  ChamberAlertSettings,
  NotificationSettings,
  ProbeTargetAlertSettings,
  ProbeTargetEntry,
  SmokeCompleteAlertSettings,
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
 * What the Probe Target Reached alert will actually do, in a sentence — naming
 * the probes it is watching, so "which probes am I being told about" needs no
 * cross-referencing of the rows above it.
 */
export const describeProbeTargets = (probeTarget: ProbeTargetAlertSettings): string => {
  if (!probeTarget.enabled) {
    return 'Off — you will not be told when a probe reaches its target.';
  }
  const watched = probeTarget.probes.filter(probe => probe.enabled);
  if (watched.length === 0) {
    return 'No probes are being watched — check one to be told when it is done.';
  }
  const names = watched.map(probe => `${probe.name} at ${degrees(probe.target)}`);
  return `You will be told once when each of ${listOf(names)} reaches its target.`;
};

/**
 * What the Smoke Complete alert will actually do, in a sentence. It is measured
 * against the probe watch list rather than anything of its own, so the sentence
 * names that list — and says so plainly when the list is empty, which is the one
 * configuration that looks armed and can never fire.
 */
export const describeSmokeComplete = (
  smokeComplete: SmokeCompleteAlertSettings,
  probeTarget: ProbeTargetAlertSettings
): string => {
  if (!smokeComplete.enabled) {
    return 'Off — you will not be told when the smoke is complete.';
  }
  const watched = probeTarget.probes.filter(probe => probe.enabled);
  if (watched.length === 0) {
    return 'No probes are being watched — check one, so there is a smoke to complete.';
  }
  const names = listOf(watched.map(probe => `${probe.name} at ${degrees(probe.target)}`));
  return watched.length === 1
    ? `You will be told once, when ${names} has reached its target.`
    : `You will be told once, when all of ${names} have reached their targets.`;
};

/** `a`, `a and b`, `a, b and c` — as a person would say the list out loud. */
const listOf = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

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

  const updateProbeTarget = (change: Partial<ProbeTargetAlertSettings>) =>
    setSettings(current => ({
      ...current,
      probeTarget: { ...current.probeTarget, ...change },
    }));

  /** Change one probe's row, leaving every other row exactly as it was. */
  const updateProbe = (slot: string, change: Partial<ProbeTargetEntry>) =>
    setSettings(current => ({
      ...current,
      probeTarget: {
        ...current.probeTarget,
        probes: current.probeTarget.probes.map(probe =>
          probe.slot === slot ? { ...probe, ...change } : probe
        ),
      },
    }));

  const updateSmokeComplete = (change: Partial<SmokeCompleteAlertSettings>) =>
    setSettings(current => ({
      ...current,
      smokeComplete: { ...current.smokeComplete, ...change },
    }));

  const { chamber, probeTarget, smokeComplete } = settings;
  // The mock tags the first watched probe with the cook's ETA. Which probe that
  // is follows from the watch list, so it is derived here rather than stored.
  const firstWatchedSlot = probeTarget.probes.find(probe => probe.enabled)?.slot;

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

          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack>
              <Typography variant="body1" fontWeight={600}>
                Probe Target Reached
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tell me when the meat is done.
              </Typography>
            </Stack>
            <Switch
              checked={probeTarget.enabled}
              onChange={event => updateProbeTarget({ enabled: event.target.checked })}
              inputProps={{ 'aria-label': 'Probe Target Reached' }}
            />
          </Stack>

          {/* The watch list is what both probe alerts are measured against, so
              it is shown for either of them: a Smoke Complete alert switched on
              by itself would otherwise have no way to be told what to wait for. */}
          {(probeTarget.enabled || smokeComplete.enabled) && (
            <Stack spacing={1} data-testid="settings-probe-rows">
              {probeTarget.probes.map(probe => (
                <ProbeRow
                  key={probe.slot}
                  probe={probe}
                  showEta={probe.slot === firstWatchedSlot}
                  onChange={change => updateProbe(probe.slot, change)}
                />
              ))}
            </Stack>
          )}

          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-probe-target-summary"
          >
            {describeProbeTargets(probeTarget)}
          </Typography>

          {/* No detail controls: what counts as complete is the watch list
              above, so there is nothing else here to configure. */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack>
              <Typography variant="body1" fontWeight={600}>
                Smoke Complete
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tell me when every probe I am watching has hit its target.
              </Typography>
            </Stack>
            <Switch
              checked={smokeComplete.enabled}
              onChange={event => updateSmokeComplete({ enabled: event.target.checked })}
              inputProps={{ 'aria-label': 'Smoke Complete' }}
            />
          </Stack>

          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="settings-smoke-complete-summary"
          >
            {describeSmokeComplete(smokeComplete, probeTarget)}
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

/**
 * One probe's row: watch it or not, what this cook calls it, and the
 * temperature its meat is done at.
 *
 * The name is read-only here — it is resolved from the active cook's smoke
 * profile and is edited on the smoke step, not in settings.
 */
const ProbeRow = ({
  probe,
  showEta,
  onChange,
}: {
  probe: ProbeTargetEntry;
  showEta: boolean;
  onChange: (change: Partial<ProbeTargetEntry>) => void;
}): JSX.Element => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={1}
    data-testid={`settings-probe-row-${probe.slot}`}
  >
    <Checkbox
      checked={probe.enabled}
      onChange={event => onChange({ enabled: event.target.checked })}
      inputProps={{ 'aria-label': `Watch ${probe.name}` }}
    />
    <Typography variant="body2" sx={{ flexGrow: 1 }}>
      {probe.name}
    </Typography>
    {/* The mock tags the first watched probe with the cook's ETA. The estimate
        itself is not computed anywhere yet, so the tag marks which probe it will
        describe rather than claiming a time the app does not know. */}
    {showEta && <Chip size="small" label="ETA" data-testid="settings-probe-eta" />}
    <TextField
      label={`${probe.name} target`}
      type="number"
      size="small"
      variant="outlined"
      value={probe.target}
      onChange={event =>
        onChange({ target: readTemperatureInput(event.target.value, probe.target) })
      }
      inputProps={{ 'data-testid': `settings-probe-target-${probe.slot}` }}
      sx={{ width: 120 }}
    />
  </Stack>
);
