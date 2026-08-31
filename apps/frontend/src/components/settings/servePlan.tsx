import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { Card, CardContent, IconButton, Stack, Switch, Typography } from '@mui/material';
import React from 'react';
import {
  DEFAULT_SERVE_PLAN_SETTINGS,
  DRIFT_MINUTES_STEP,
  MAX_DRIFT_MINUTES,
  MIN_DRIFT_MINUTES,
  ServePlanSettings,
  useCurrentResource,
} from '../../api';
import { usePushNotifications } from '../../push';

/**
 * What the tolerance will actually do, in a sentence — so "off plan" reads as a
 * promise about when the phone will buzz rather than as a bare number of
 * minutes.
 */
export const describeTolerance = (servePlan: ServePlanSettings): string => {
  if (!servePlan.driftAlert) {
    return 'Off — you will not be told when the cook drifts off plan.';
  }
  return (
    `You will be told when the cook is running more than ${servePlan.driftMin} min ` +
    `behind — or ahead of — the time you need to pull the meat.`
  );
};

/**
 * The tolerance a tap moves to, held inside the range the backend accepts.
 *
 * Held rather than allowed to run past the end: this card saves on the way out
 * of the screen, where a tolerance the backend refuses is a card's worth of
 * edits lost with nobody looking at the failure.
 */
const steppedTolerance = (current: number, step: number): number =>
  Math.min(Math.max(current + step, MIN_DRIFT_MINUTES), MAX_DRIFT_MINUTES);

/**
 * The design's "During the cook" card: the Serve Plan switch, the off-schedule
 * alert nested under it, and the tolerance nested under that.
 *
 * Nested in the UI because they are nested in meaning: with the planner off
 * there is no verdict to be off, and with the alert off there is nothing for a
 * tolerance to decide. Showing either of them anyway would be a control that
 * does nothing.
 *
 * It saves its own block rather than the whole settings document — the cards
 * beside it edit the same document, so a save carrying everything would undo
 * whatever one of them had just changed.
 */
export function ServePlanCard(): JSX.Element {
  const [servePlan, setServePlan] = useCurrentResource<ServePlanSettings>({
    initialValue: DEFAULT_SERVE_PLAN_SETTINGS,
    load: client => client.servePlan.get(),
    save: (client, value) => client.servePlan.save(value),
    loadErrorMessage: 'Could not load the Serve Plan.',
    saveErrorMessage: 'Could not save the Serve Plan.',
  });
  const { enable } = usePushNotifications();

  const update = (change: Partial<ServePlanSettings>) =>
    setServePlan(current => ({ ...current, ...change }));

  /**
   * Switching the alert on is the user gesture the permission prompt needs, so
   * the setting is recorded and the browser is enlisted in the same handler —
   * the path every alert on the settings page takes. Switching it off arms
   * nothing, so it asks for nothing.
   *
   * The setting is stored either way: a cook who unblocks notifications later
   * should find the alert they asked for still switched on.
   */
  const setDriftAlert = (driftAlert: boolean) => {
    update({ driftAlert });
    if (driftAlert) {
      void enable();
    }
  };

  return (
    // No spacing wrapper: the settings page stacks its cards and owns the gap
    // between them.
    <Card data-testid="settings-serve-plan-card">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            During the cook
          </Typography>

          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack>
              <Typography variant="body1" fontWeight={600}>
                Serve Plan
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Plan the cook backwards from the time you want to serve.
              </Typography>
            </Stack>
            <Switch
              checked={servePlan.enabled}
              onChange={event => update({ enabled: event.target.checked })}
              // The accessible name is the handle every caller uses — component
              // tests and the end-to-end suite alike — so the control needs no
              // test-only attribute of its own.
              inputProps={{ 'aria-label': 'Serve Plan' }}
            />
          </Stack>

          {servePlan.enabled && (
            <Stack spacing={2} sx={{ paddingLeft: 2 }} data-testid="settings-serve-plan-details">
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                <Stack>
                  <Typography variant="body1" fontWeight={600}>
                    Off-schedule alert
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Buzz my phone when the cook drifts off the plan.
                  </Typography>
                </Stack>
                <Switch
                  checked={servePlan.driftAlert}
                  onChange={event => setDriftAlert(event.target.checked)}
                  inputProps={{ 'aria-label': 'Off-schedule alert' }}
                />
              </Stack>

              {servePlan.driftAlert && (
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Typography variant="body1" fontWeight={600}>
                    Tolerance
                  </Typography>
                  {/* Steppers rather than a field: the plan is edited at the
                      pit, one-handed, and the tolerance only ever moves in the
                      quarter-hours the plan itself is made in. */}
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconButton
                      aria-label="Less tolerance"
                      size="small"
                      onClick={() =>
                        update({
                          driftMin: steppedTolerance(servePlan.driftMin, -DRIFT_MINUTES_STEP),
                        })
                      }
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="body1"
                      fontWeight={600}
                      data-testid="settings-serve-plan-tolerance"
                      sx={{ minWidth: 72, textAlign: 'center' }}
                    >
                      {servePlan.driftMin} min
                    </Typography>
                    <IconButton
                      aria-label="More tolerance"
                      size="small"
                      onClick={() =>
                        update({
                          driftMin: steppedTolerance(servePlan.driftMin, DRIFT_MINUTES_STEP),
                        })
                      }
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              )}

              <Typography
                variant="body2"
                color="text.secondary"
                data-testid="settings-serve-plan-summary"
              >
                {describeTolerance(servePlan)}
              </Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
