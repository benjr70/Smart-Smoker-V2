/**
 * The cook that is set up right now: when it started, when it will be done, and
 * the probe it is being taken to.
 *
 * One hook and one read, because it is one question. The backend answers the
 * running cook's timing and its estimate together — both are derived from the
 * same readings on the same route — and two hooks asking for it separately
 * would have the screen deriving three collections' worth of work twice a
 * minute to draw two halves of the same card column.
 *
 * The estimate itself is the backend's: it is recomputed from the readings, the
 * settings and the user's own history on every read, so this hook only decides
 * *when* to ask. It asks on the cadence the elapsed clock has always used, and
 * again the moment either of the two things a client can change about the answer
 * changes — the target, and whether the smoker is lit. Everything else that
 * moves the cook happens away from this screen (the touchscreen presses Finish,
 * another client clears the session), which is what the refresh is for: the web
 * client has no push channel for the session, so re-asking is the only way it
 * learns.
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
  ProbeTargetEntry,
  ServePlanStatus,
  useApiClient,
  useApiSnackbar,
} from '../../../api';
import { WatchedProbe } from './CompletionCard';

/** How often the running cook is re-read while the screen is open. */
export const RUNNING_COOK_REFRESH_MS = 60_000;

/**
 * What a probe's row says about its target: the temperature, whether the probe
 * is watched, and where the temperature came from.
 */
export type ProbeTargetChange = Pick<ProbeTargetEntry, 'target' | 'enabled' | 'targetSource'>;

/** A change to some probes' targets, each under the slot of the probe it is for. */
export type ProbeTargetChanges = Record<string, ProbeTargetChange>;

export interface RunningCook {
  /** When the backend stamped the start of this cook, or `null` when none. */
  startedAt: Date | null;
  /** The estimate as the backend last answered it, or `null` before it has. */
  estimate: CompletionEstimate | null;
  /** The probe the estimate is taken to, or `null` when none is watched. */
  probe: WatchedProbe | null;
  /**
   * The cook's Serve Plan as the backend judged it, or `null` when there is
   * none — the feature switched off, or a cook nobody planned, which are the
   * same nothing to a screen that renders no card for either.
   *
   * Read off the same request as the estimate, because it is a judgement *of*
   * that estimate: two hooks asking separately could show a verdict about an
   * ETA that is no longer on screen.
   */
  servePlan: ServePlanStatus | null;
  /**
   * Set the watched probe's target temperature: written to the settings
   * document the settings screen edits, and followed by a re-read, so the card
   * shows the consequence of the change rather than the estimate before it.
   *
   * Resolves `true` when the temperature was stored, so the editor that asked
   * for it knows whether to keep showing it.
   */
  setTarget: (target: number) => Promise<boolean>;
  /**
   * Every probe's row of the settings document, as it was last read: what each
   * is cooked to, whether it is watched, and where its target came from.
   */
  probes: ProbeTargetEntry[];
  /**
   * Set the target, the watch and the source of several probes at once — one
   * read of the settings document and one write of it, through the same path
   * {@link setTarget} takes, however many probes are changed.
   *
   * Given `standing`, a probe is changed only where its row still holds what
   * `standing` says of it, as the document reads at the moment of the write:
   * how a change is taken back without taking back what was set over it since.
   *
   * Resolves what the probes it changed held before the write, which is what
   * undoing it writes back, or `null` when nothing was stored.
   */
  setTargets: (
    changes: ProbeTargetChanges,
    standing?: ProbeTargetChanges
  ) => Promise<ProbeTargetChanges | null>;
  /**
   * Ask for the cook to be read again, now.
   *
   * The estimate and the plan are the backend's, so a client that changes
   * something they depend on — the plan, above all — has nothing worth showing
   * until it has been judged again. The refresh identity is stable, so asking
   * for one never re-renders anything on its own.
   */
  refresh: () => void;
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

export function useRunningCook(smoking: boolean): RunningCook {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [estimate, setEstimate] = useState<CompletionEstimate | null>(null);
  const [probe, setProbe] = useState<WatchedProbe | null>(null);
  const [probes, setProbes] = useState<ProbeTargetEntry[]>([]);
  const [servePlan, setServePlan] = useState<ServePlanStatus | null>(null);
  // Bumped by an edit, which is how a write asks for the read that follows it
  // without the read effect having to know what was written.
  const [revision, setRevision] = useState(0);
  const clientRef = useRef(client);
  clientRef.current = client;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Whether the failure on screen has already been reported. A backend that
  // stays down is re-read on every refresh, and one snackbar a minute about the
  // same outage is noise; the next successful read re-arms the message.
  const reported = useRef(false);

  useEffect(() => {
    let active = true;
    const read = (): void => {
      void Promise.all([
        clientRef.current.timeline
          .getCurrent()
          .then(timeline => ({ read: true, timeline }))
          .catch(() => ({ read: false, timeline: null })),
        clientRef.current.notifications
          .getSettings()
          .then(settings => ({ read: true, settings }))
          .catch(() => ({ read: false, settings: undefined })),
      ]).then(([cook, watched]) => {
        if (!active) {
          return;
        }
        // A cook we can no longer confirm is not one to keep counting or
        // estimating: the read may have failed precisely because the cook it
        // described is gone. Both stop, and the next successful read starts
        // them again.
        setStartedAt(cook.timeline?.startedAt ?? null);
        setEstimate(cook.timeline?.estimate ?? null);
        setServePlan(cook.timeline?.servePlan ?? null);
        if (cook.read) {
          reported.current = false;
        } else if (!reported.current) {
          reported.current = true;
          notifyRef.current('Could not load the cook timer.');
        }
        // A settings read that failed says nothing about which probe is being
        // watched, so it is not evidence that none is: taking it for one would
        // pull the target editor and the progress bar off the card for a minute
        // over a single dropped request. What is known is kept until something
        // better is known.
        if (watched.read) {
          setProbe(primaryWatchedProbe(watched.settings));
          setProbes(watched.settings?.probeTarget?.probes ?? []);
        }
      });
    };
    read();
    const refresh = setInterval(read, RUNNING_COOK_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(refresh);
    };
    // Re-read on the two things this screen can change about the answer — the
    // smoking flag and an edited target (the revision) — on a replaced client,
    // and on the refresh above for everything that happens away from here.
  }, [smoking, revision, client]);

  /**
   * The one way this screen writes a probe's row: the settings document is read,
   * the rows `changesFor` names are replaced in it, and it is written whole.
   * Resolves what those rows held before, or `null` when there was nothing to
   * change and so nothing was written.
   */
  const saveRows = useCallback(
    (
      changesFor: (settings: NotificationSettings) => Record<string, Partial<ProbeTargetChange>>
    ): Promise<ProbeTargetChanges | null> =>
      clientRef.current.notifications
        .getSettings()
        .then(settings => {
          const rows = settings?.probeTarget?.probes ?? [];
          const changes = settings ? changesFor(settings) : {};
          const changed = rows.filter(row => changes[row.slot] !== undefined);
          if (!settings || changed.length === 0) {
            return null;
          }
          const before: ProbeTargetChanges = {};
          changed.forEach(({ slot, target, enabled, targetSource }) => {
            before[slot] = { target, enabled, targetSource };
          });
          return clientRef.current.notifications
            .saveSettings({
              ...settings,
              probeTarget: {
                ...settings.probeTarget,
                probes: rows.map(row => ({ ...row, ...changes[row.slot] })),
              },
            })
            .then(() => {
              // The estimate is taken to the target that was just changed, so
              // the answer on screen is out of date the instant the write lands.
              setRevision(current => current + 1);
              return before;
            });
        })
        .catch(() => {
          notifyRef.current('Could not save the target temperature.');
          return null;
        }),
    // `notify` and the client are read through refs, so this identity is stable
    // and the card is never re-rendered by a new callback.
    []
  );

  const setTarget = useCallback(
    (target: number): Promise<boolean> =>
      saveRows(settings => {
        // Nothing being watched means there is no probe whose target this could
        // be. The card offers no editor in that state.
        const watched = primaryWatchedProbe(settings);
        // A temperature somebody typed is theirs: the backend seeds targets
        // from the meat being cooked, but only over ones nobody chose, and the
        // number alone cannot tell the two apart.
        return watched ? { [watched.slot]: { target, targetSource: 'user' } } : {};
      }).then(before => before !== null),
    [saveRows]
  );

  const setTargets = useCallback(
    (changes: ProbeTargetChanges, standing?: ProbeTargetChanges) =>
      saveRows(settings => {
        if (!standing) {
          return changes;
        }
        const still: ProbeTargetChanges = {};
        settings.probeTarget?.probes?.forEach(row => {
          const held = standing[row.slot];
          const change = changes[row.slot];
          if (
            change &&
            held &&
            row.target === held.target &&
            row.enabled === held.enabled &&
            row.targetSource === held.targetSource
          ) {
            still[row.slot] = change;
          }
        });
        return still;
      }),
    [saveRows]
  );

  const refresh = useCallback(() => setRevision(current => current + 1), []);

  return { startedAt, estimate, probe, servePlan, setTarget, probes, setTargets, refresh };
}
