/**
 * The smoke screen's binding for Voice Fill: the values the screen holds, what
 * a Ramble on it is read against, and one setter that writes a set of changes
 * and answers the undo of exactly those.
 *
 * The screen keeps its values in four places — the smoke profile in the live
 * session, each probe's target in the settings document, the Serve Plan on the
 * cook, and the cook log — and each is written here through the hook the screen
 * already writes it with, so a filled value is stored, announced and re-judged
 * exactly as a typed or tapped one is. Nothing is written by a path of this
 * binding's own.
 */
import { useMemo, useRef } from 'react';
import {
  CookEvent,
  CookStamp,
  ProbeTargetEntry,
  ServePlanStatus,
  SmokeProfile,
} from '../../../api';
import type { ScreenBinding, SmokeScreenValues, VoiceFillProbeTarget } from '../../../voiceFill';
import { TemperatureChannel } from './TemperatureRow';
import { ProbeTargetChanges } from './useRunningCook';

/** The three meat probes, by the number each is spoken of by. */
const PROBES = [1, 2, 3] as const;

/** The session's name for the reading each name field labels. */
const NAME_CHANNELS = {
  chamberName: 'chamber',
  probe1Name: 'probe1',
  probe2Name: 'probe2',
  probe3Name: 'probe3',
} as const;

type NameField = keyof typeof NAME_CHANNELS;

const NAME_FIELDS = Object.keys(NAME_CHANNELS) as NameField[];

/**
 * What a probe with no row in the settings document is held to be cooked to:
 * nothing, unwatched, by nobody's choice — so any target spoken for it is a
 * change, and Undo of it has no row to write back.
 */
const NO_TARGET: VoiceFillProbeTarget = { target: 0, enabled: false, targetSource: 'default' };

export interface SmokeScreenBindingInput {
  /** The smoke profile as the session holds it, and the commands that edit it. */
  profile: SmokeProfile & {
    setName(channel: TemperatureChannel, name: string): void;
    setWoodType(woodType: string): void;
    setNotes(notes: string): void;
  };
  /** Whether a cook is running: the cook log takes no stamp for one that is not. */
  smoking: boolean;
  /** Every probe's row of the settings document, as last read. */
  probes: readonly ProbeTargetEntry[];
  /**
   * The probe-target write path: resolves what the changed probes held before.
   * Given `standing`, it changes only the probes whose rows still hold that.
   */
  setTargets(
    changes: ProbeTargetChanges,
    standing?: ProbeTargetChanges
  ): Promise<ProbeTargetChanges | null>;
  /** The cook's Serve Plan as the backend last judged it, or `null` for none. */
  plan: ServePlanStatus | null;
  /**
   * Whether the screen is showing a Serve Plan card at all: not where the
   * planner is switched off, and not where there is no cook to plan. A Ramble
   * sets no serve time and no rest on a screen that has nowhere to show them.
   */
  planOffered: boolean;
  /** The Serve Plan write path, and the serve time and rest the cook has stored. */
  servePlan: {
    setServeAt(serveAt: Date | null): Promise<boolean>;
    setRestMinutes(restMinutes: number | null): Promise<boolean>;
    stored(): Promise<{ serveAt: Date | null; restMinutes: number | null }>;
  };
  /** Tells the cook of something that could not be done, as the screen's hooks do. */
  notify(message: string): void;
  /**
   * The cook log path: logs one stamp as done at `at` and answers the entry
   * stored for it.
   */
  logStamp(stampKey: string, at: Date): Promise<CookEvent | null>;
  /** Removes one entry from the cook log. */
  removeStamp(id: string): Promise<boolean>;
  /** The stamp catalogue, whole, as the cook log's buttons are drawn from it. */
  stamps: readonly CookStamp[];
}

const targetOf = (probes: readonly ProbeTargetEntry[], probe: number): VoiceFillProbeTarget => {
  const row = probes.find(candidate => candidate.slot === `probe${probe}`);
  return row
    ? { target: row.target, enabled: row.enabled, targetSource: row.targetSource }
    : NO_TARGET;
};

const valuesOf = ({ profile, probes, plan }: SmokeScreenBindingInput): SmokeScreenValues => ({
  chamberName: profile.chamberName,
  probe1Name: profile.probe1Name,
  probe2Name: profile.probe2Name,
  probe3Name: profile.probe3Name,
  woodType: profile.woodType,
  notes: profile.notes,
  probe1Target: targetOf(probes, 1),
  probe2Target: targetOf(probes, 2),
  probe3Target: targetOf(probes, 3),
  serveAt: plan?.serveAt ?? null,
  restMinutes: plan?.restMinutes ?? null,
  stamps: [],
});

/** Takes back one part of a fill; settled once that part is as it was. */
type Undo = () => unknown;

/**
 * Writes the names, the wood and Notes into the session's profile draft. Undo
 * takes back what was written only where it still stands: a field the cook has
 * typed over since holds nothing of the fill's any more.
 */
const fillProfile = (
  latest: () => SmokeScreenBindingInput,
  write: Partial<SmokeScreenValues>
): Undo => {
  const { profile } = latest();
  const undos: Undo[] = [];
  NAME_FIELDS.forEach(field => {
    const name = write[field];
    if (name === undefined) {
      return;
    }
    const before = profile[field];
    profile.setName(NAME_CHANNELS[field], name);
    undos.push(() => {
      const now = latest().profile;
      if (now[field] === name) {
        now.setName(NAME_CHANNELS[field], before);
      }
    });
  });
  if (write.woodType !== undefined) {
    const { woodType } = write;
    const before = profile.woodType;
    profile.setWoodType(woodType);
    undos.push(() => {
      const now = latest().profile;
      if (now.woodType === woodType) {
        now.setWoodType(before);
      }
    });
  }
  if (write.notes !== undefined) {
    const { notes } = write;
    const before = profile.notes;
    profile.setNotes(notes);
    undos.push(() => {
      const now = latest().profile;
      if (now.notes === notes) {
        now.setNotes(before);
      }
    });
  }
  return () => undos.forEach(undo => undo());
};

/**
 * Writes every spoken target in one save of the settings document. Undo writes
 * back what those probes' rows held when the save read them — the target, the
 * watch and the source of each — once the fill's own save has landed, and only
 * to a probe whose row still holds what the fill wrote: a target set over the
 * fill's since is the cook's, and stays.
 */
const fillTargets = (
  { setTargets }: SmokeScreenBindingInput,
  write: Partial<SmokeScreenValues>
): Undo | undefined => {
  const changes: ProbeTargetChanges = {};
  PROBES.forEach(probe => {
    const target = write[`probe${probe}Target`];
    if (target !== undefined) {
      changes[`probe${probe}`] = target;
    }
  });
  if (Object.keys(changes).length === 0) {
    return undefined;
  }
  const written = setTargets(changes);
  return () => written.then(before => (before ? setTargets(before, changes) : null));
};

/**
 * Writes the serve time and the rest, each as its own stepper writes it. Undo
 * writes back what the cook held before: the plan on screen, or — for the rest
 * of a cook that has no plan yet — the rest the cook has stored, read before
 * the fill's write is sent so that it is not the fill's own. A rest whose
 * previous value cannot be read is not written at all, and the cook is told:
 * written, it would be a change Undo could not take back.
 *
 * Undo reads the cook again and writes back only the half that still holds what
 * the fill wrote, so a serve time or a rest stepped since is left as stepped.
 * Where the cook cannot be read to tell, Undo does what it was asked.
 */
const fillServePlan = (
  { plan, servePlan, notify }: SmokeScreenBindingInput,
  write: Partial<SmokeScreenValues>
): Undo | undefined => {
  const { serveAt, restMinutes } = write;
  if (serveAt === undefined && restMinutes === undefined) {
    return undefined;
  }
  const serveBefore = plan?.serveAt ?? null;
  const serveWritten =
    serveAt === undefined ? Promise.resolve(false) : servePlan.setServeAt(serveAt);
  const restBefore: Promise<{ rest: number | null } | undefined> =
    restMinutes === undefined
      ? Promise.resolve(undefined)
      : plan
        ? Promise.resolve({ rest: plan.restMinutes })
        : servePlan.stored().then(
            stored => ({ rest: stored.restMinutes }),
            () => undefined
          );
  const restWritten = restBefore.then(held => {
    if (restMinutes === undefined) {
      return false;
    }
    if (!held) {
      notify('Could not save the serve plan.');
      return false;
    }
    return servePlan.setRestMinutes(restMinutes);
  });
  return async () => {
    const [serveStored, restStored, held] = await Promise.all([
      serveWritten,
      restWritten,
      restBefore,
    ]);
    if (!serveStored && !restStored) {
      return;
    }
    const now = await servePlan.stored().catch(() => undefined);
    if (serveStored && (!now || now.serveAt?.getTime() === serveAt?.getTime())) {
      await servePlan.setServeAt(serveBefore);
    }
    if (restStored && held && (!now || now.restMinutes === restMinutes)) {
      await servePlan.setRestMinutes(held.rest);
    }
  };
};

/**
 * Logs each stamp, one after another in the order they were said, at the time
 * of the Ramble rather than of the fill: the review list may have stood open
 * for minutes, and the thing was done when it was spoken of. The readings of an
 * entry are still the backend's, read for that moment. Undo removes every entry
 * the fill logged.
 */
const fillStamps = (
  { logStamp, removeStamp }: SmokeScreenBindingInput,
  write: Partial<SmokeScreenValues>
): Undo | undefined => {
  const stamps = write.stamps ?? [];
  if (stamps.length === 0) {
    return undefined;
  }
  const logged = stamps.reduce<Promise<CookEvent[]>>(
    (log, stamp) =>
      log.then(entries =>
        logStamp(stamp.stampKey, stamp.at).then(entry => (entry ? [...entries, entry] : entries))
      ),
    Promise.resolve([])
  );
  return () => logged.then(entries => Promise.all(entries.map(entry => removeStamp(entry._id))));
};

/**
 * The binding is one object for the life of the screen, however often the
 * screen renders: it reads what the screen holds at the moment of asking.
 */
export const useSmokeScreenBinding = (
  input: SmokeScreenBindingInput
): ScreenBinding<SmokeScreenValues> => {
  const latest = useRef(input);
  latest.current = input;

  return useMemo(
    () => ({
      values: () => valuesOf(latest.current),
      context: () => {
        const { profile, smoking, stamps, planOffered } = latest.current;
        return {
          probeNames: PROBES.map(probe => profile[`probe${probe}Name`]),
          // A stamp is something done to a cook that is running: the cook log
          // offers none to one that is not, so a Ramble can log none either.
          enabledStamps: smoking ? stamps : [],
          servePlanOffered: planOffered,
        };
      },
      apply: write => {
        const current = latest.current;
        const undos = [
          fillProfile(() => latest.current, write),
          fillTargets(current, write),
          fillServePlan(current, write),
          fillStamps(current, write),
        ];
        return () => undos.forEach(undo => void undo?.());
      },
    }),
    []
  );
};
