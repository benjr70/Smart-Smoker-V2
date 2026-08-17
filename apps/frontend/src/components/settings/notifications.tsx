import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import {
  Alert,
  AlertTitle,
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
import {
  BLOCKED_BANNER_BODY,
  BLOCKED_BANNER_TITLE,
  NOT_ENABLED_BANNER_ACTION,
  NOT_ENABLED_BANNER_BODY,
  NOT_ENABLED_BANNER_TITLE,
  UNSUPPORTED_BANNER_BODY,
  UNSUPPORTED_BANNER_TITLE,
  usePushNotifications,
} from '../../push';

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

/**
 * The change a keystroke in a probe's target field makes.
 *
 * A temperature the user typed is theirs, and the row says so: the backend
 * seeds a session's probes from the meat being cooked and only ever over a
 * target nobody chose, and the number alone cannot tell the two apart — a
 * hand-typed 203 looks exactly like the default.
 *
 * A field that is empty or half-typed is not a temperature yet. It keeps the
 * number the row already had and leaves the provenance alone, so clearing the
 * field to retype and then thinking better of it does not silently pin the
 * probe out of seeding for every cook after it.
 */
const readTargetEdit = (raw: string, probe: ProbeTargetEntry): Partial<ProbeTargetEntry> => {
  const parsed = Number(raw);
  return raw.trim() === '' || Number.isNaN(parsed)
    ? { target: probe.target }
    : { target: parsed, targetSource: 'user' };
};

export function NotificationsCard(): JSX.Element {
  const [settings, setSettings] = useCurrentResource<NotificationSettings>({
    initialValue: defaultNotificationSettings(),
    load: client => client.notifications.getSettings(),
    save: (client, value) => client.notifications.saveSettings(value),
    loadErrorMessage: 'Could not load notification settings.',
    saveErrorMessage: 'Could not save notification settings.',
  });
  const { permission, enabling, enable, sendTest, sending } = usePushNotifications();

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

  /**
   * Switching an alert on is the user gesture the permission prompt needs, so
   * the setting is recorded and the browser is enlisted in the same handler.
   * Every alert routes through here: whichever one the user reaches for first
   * has to be the one that asks, or the single alert they chose would sit there
   * armed against a browser that was never enlisted.
   *
   * The setting is saved either way: a user who unblocks notifications later
   * should find the alert they configured still switched on.
   */
  const setAlertEnabled = (enabled: boolean, record: (change: { enabled: boolean }) => void) => {
    record({ enabled });
    if (enabled) {
      void enable();
    }
  };

  const { chamber, probeTarget, smokeComplete } = settings;
  // The mock tags the first watched probe with the cook's ETA. Which probe that
  // is follows from the watch list, so it is derived here rather than stored.
  const firstWatchedSlot = probeTarget.probes.find(probe => probe.enabled)?.slot;
  // Any alert switched on is something this browser is expected to deliver, so
  // any of them is reason enough to offer the way in below. Reading only the
  // chamber alert would strand a smoker whose alerts are all about the meat.
  const anyAlertEnabled = chamber.enabled || probeTarget.enabled || smokeComplete.enabled;

  return (
    // No spacing wrapper: the settings page stacks its cards and owns the gap
    // between them.
    <Card data-testid="settings-notifications-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Notifications
          </Typography>

          {permission === 'unsupported' && (
            <Alert severity="info" data-testid="settings-push-unsupported">
              <AlertTitle>{UNSUPPORTED_BANNER_TITLE}</AlertTitle>
              {UNSUPPORTED_BANNER_BODY}
            </Alert>
          )}

          {/* An alert switched on elsewhere arrives already on here, so there is
              no off→on toggle left to carry the prompt. This is that gesture.
              Hidden while a chain is running, so switching an alert on does not
              flash a "not set up" banner at the user mid-prompt. */}
          {permission === 'default' && anyAlertEnabled && !enabling && (
            <Alert severity="info" data-testid="settings-push-not-enabled">
              <AlertTitle>{NOT_ENABLED_BANNER_TITLE}</AlertTitle>
              <Stack alignItems="flex-start" spacing={1}>
                <span>{NOT_ENABLED_BANNER_BODY}</span>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  onClick={() => void enable()}
                >
                  {NOT_ENABLED_BANNER_ACTION}
                </Button>
              </Stack>
            </Alert>
          )}

          {permission === 'denied' && (
            // Severity, not a hand-picked colour: the palette comes from the
            // shared theme so this reads correctly in either colour scheme.
            <Alert severity="warning" data-testid="settings-push-blocked">
              <AlertTitle>{BLOCKED_BANNER_TITLE}</AlertTitle>
              {BLOCKED_BANNER_BODY}
            </Alert>
          )}

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
              onChange={event => setAlertEnabled(event.target.checked, updateChamber)}
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
              onChange={event => setAlertEnabled(event.target.checked, updateProbeTarget)}
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
              onChange={event => setAlertEnabled(event.target.checked, updateSmokeComplete)}
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

          {/* Only worth offering once a notification could actually arrive: in
              any other permission state this control can only ever report the
              same failure the banner above already explains. Held back until
              the enabling chain finishes too — offered mid-subscribe it would
              start a second one against the same registration. */}
          {permission === 'granted' && !enabling && (
            <Button
              variant="outlined"
              startIcon={<NotificationsActiveIcon />}
              disabled={sending}
              onClick={sendTest}
              sx={{ alignSelf: 'flex-start' }}
            >
              Send Test Notification
            </Button>
          )}
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
    {/* The mock tags the first watched probe with the cook's ETA. The tag marks
        which probe the estimate is taken to — the cook screen and the
        touchscreen both say when it will get there — rather than repeating a
        time that belongs beside the cook. */}
    {showEta && <Chip size="small" label="ETA" data-testid="settings-probe-eta" />}
    <TextField
      label={`${probe.name} target`}
      type="number"
      size="small"
      variant="outlined"
      value={probe.target}
      onChange={event => onChange(readTargetEdit(event.target.value, probe))}
      inputProps={{ 'data-testid': `settings-probe-target-${probe.slot}` }}
      sx={{ width: 120 }}
    />
  </Stack>
);
