/**
 * When the cook on the smoker will be done, and the probe it is being taken to.
 *
 * The estimate itself is the backend's: it is derived from the readings, the
 * settings and the user's own history on every read, so this hook only decides
 * *when* to ask. It asks on the cadence the cook clock already uses, and again
 * the moment either of the two things a client can change about the answer
 * changes — the target, and whether the smoker is lit. Nothing else moves the
 * estimate that this screen could know about first.
 *
 * The watched probe rides along from the notification settings rather than from
 * the estimate: the backend answers what the cook is being taken *to*, and the
 * card also has to say which probe is getting there, by the name the cook gave
 * it. Reading the settings here is also what makes the target editable — the
 * target belongs to the settings document, and this is the one place that
 * writes it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CompletionEstimate,
  NotificationSettings,
  useApiClient,
  useApiSnackbar,
} from '../../../api';
import { WatchedProbe } from './CompletionCard';

/**
 * How often the running cook is re-read while the screen is open — the cadence
 * the cook clock is already polled on, because they are the same read.
 */
export const COMPLETION_ESTIMATE_REFRESH_MS = 60_000;

export interface CompletionEstimateResult {
  /** The estimate as the backend last answered it, or `null` before it has. */
  estimate: CompletionEstimate | null;
  /** The probe the estimate is taken to, or `null` when none is watched. */
  probe: WatchedProbe | null;
  /**
   * Set the watched probe's target temperature: written to the settings
   * document the settings screen edits, and followed by a re-read, so the card
   * shows the consequence of the change rather than the estimate before it.
   */
  setTarget: (target: number) => void;
}

/**
 * The probe the estimate is about: the first one being watched, in slot order —
 * the same rule the backend's estimator and the settings screen's ETA chip both
 * follow, so all three name the same probe.
 */
const primaryWatchedProbe = (settings: NotificationSettings | undefined): WatchedProbe | null => {
  const probe = settings?.probeTarget?.probes?.find(row => row.enabled);
  return probe ? { slot: probe.slot, name: probe.name } : null;
};

export function useCompletionEstimate(smoking: boolean): CompletionEstimateResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [estimate, setEstimate] = useState<CompletionEstimate | null>(null);
  const [probe, setProbe] = useState<WatchedProbe | null>(null);
  // Bumped by an edit, which is how a write asks for the read that follows it
  // without the read effect having to know what was written.
  const [revision, setRevision] = useState(0);
  const clientRef = useRef(client);
  clientRef.current = client;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    let active = true;
    const read = (): void => {
      void Promise.all([
        clientRef.current.timeline.getCurrent().catch(() => null),
        clientRef.current.notifications.getSettings().catch(() => undefined),
      ]).then(([timeline, settings]) => {
        if (!active) {
          return;
        }
        setEstimate(timeline?.estimate ?? null);
        setProbe(primaryWatchedProbe(settings));
      });
    };
    read();
    const refresh = setInterval(read, COMPLETION_ESTIMATE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(refresh);
    };
    // Re-read on the two things this screen can change about the answer — the
    // smoking flag and an edited target (the revision) — on a replaced client,
    // and on the refresh above for everything that happens away from here.
  }, [smoking, revision, client]);

  const setTarget = useCallback(
    (target: number): void => {
      void clientRef.current.notifications
        .getSettings()
        .then(settings => {
          const watched = primaryWatchedProbe(settings);
          if (!settings || !watched) {
            // Nothing is being watched, so there is no probe whose target this
            // could be. The card offers no editor in that state.
            return;
          }
          return clientRef.current.notifications.saveSettings({
            ...settings,
            probeTarget: {
              ...settings.probeTarget,
              probes: settings.probeTarget.probes.map(row =>
                // A temperature somebody typed is theirs: the backend seeds
                // targets from the meat being cooked, but only over ones nobody
                // chose, and the number alone cannot tell the two apart.
                row.slot === watched.slot ? { ...row, target, targetSource: 'user' as const } : row
              ),
            },
          });
        })
        .then(() => {
          // The estimate is taken to the target that was just changed, so the
          // answer on screen is out of date the instant the write lands.
          setRevision(current => current + 1);
        })
        .catch(() => {
          notifyRef.current('Could not save the target temperature.');
        });
    },
    // `notify` and the client are read through refs, so this identity is stable
    // and the card is never re-rendered by a new callback.
    []
  );

  return { estimate, probe, setTarget };
}
