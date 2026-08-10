import { useEffect, useState } from 'react';
import { ProbeTargets } from 'temperaturechart/src/chartGeometry';
import { useApiClient } from '../../../api';
import { NO_TARGETS, chartTargetsOf } from '../../common/chartTargets';

/**
 * The targets the smoke screen's chart draws, read from the notification
 * settings when the screen opens.
 *
 * A read and nothing else: targets are configured in settings and are never
 * per-smoke, so there is nothing here to write back. It is a read per visit
 * rather than a live subscription because a target is a decision made before a
 * cook, not during one — a target changed in settings shows up the next time
 * this screen is opened, which is also the next time anybody is looking at it.
 *
 * A read that fails leaves the chart with no target lines rather than an error:
 * the cook itself is drawn from the live session, and dashed lines missing off a
 * chart that is otherwise correct is not something to stop the screen for.
 */
export const useProbeTargets = (): ProbeTargets => {
  const client = useApiClient();
  const [targets, setTargets] = useState<ProbeTargets>(NO_TARGETS);

  useEffect(() => {
    let reading = true;
    void client.notifications
      .getSettings()
      .then(settings => {
        // The screen may have been left before the settings arrived.
        if (reading) setTargets(chartTargetsOf(settings?.probeTarget?.probes));
      })
      .catch(() => undefined);
    return () => {
      reading = false;
    };
  }, [client]);

  return targets;
};
