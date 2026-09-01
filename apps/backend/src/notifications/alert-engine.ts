/**
 * The alert engine: a pure decision function over one reading.
 *
 * It takes the latest reading, the user's settings, the runtime state it
 * returned last time, the resolved probe names and the current time, and returns
 * the notifications to send plus the next runtime state. It touches no database,
 * no push library and no ambient clock, so every timing and arming rule is
 * verifiable with plain table tests and no fake timers.
 */

import { ServePlanStatus } from '../timeline/serve-plan-status';

/** The user-owned chamber range alert. */
export interface ChamberAlertSettings {
  enabled: boolean;
  /** Low bound of the acceptable chamber range, °F. */
  low: number;
  /** High bound of the acceptable chamber range, °F. */
  high: number;
}

/**
 * One probe the cook may be watching. Stored by slot rather than by name: the
 * name belongs to the cook (and changes with it), the slot belongs to the
 * smoker.
 */
export interface ProbeTargetEntrySettings {
  slot: string;
  enabled: boolean;
  /** The temperature, °F, at which this probe's meat is done. */
  target: number;
  /**
   * How many minutes before this probe reaches {@link target} the cook wants to
   * be told, or `null`/absent for not at all.
   *
   * On the watch list rather than on a list of its own, because it is the same
   * probe at the same temperature: a second list could only ever disagree with
   * this one about which meat is being watched and what it is done at.
   */
  leadMinutes?: number | null;
}

/** The user-owned Probe Target Reached alert. */
export interface ProbeTargetAlertSettings {
  enabled: boolean;
  probes: ProbeTargetEntrySettings[];
}

/**
 * The user-owned Smoke Complete alert: one notification per cook, when every
 * probe the cook is watching is done.
 *
 * It has nothing to configure beyond being on, because what counts as complete
 * is already described by the probe watch list — saying it twice would let the
 * two descriptions disagree.
 */
export interface SmokeCompleteAlertSettings {
  enabled: boolean;
}

/**
 * The user-owned heads-up alert: on or off, and nothing else.
 *
 * What it fires against — which probes, at what temperature, and how long
 * before — is the watch list above, so this block carries no second description
 * of it. It is the one switch that silences the lot.
 */
export interface HeadsUpAlertSettings {
  enabled: boolean;
}

/**
 * The Serve Plan as the alert reads it: the verdict, and how far off the
 * pull-by time the cook is projected to be.
 *
 * A slice of {@link ServePlanStatus} rather than a shape of its own, so the
 * alert and the plan cannot drift apart — the engine compares nothing here, it
 * only reports what the plan already decided.
 */
export type ServePlanState = Pick<ServePlanStatus, 'verdict' | 'slackMinutes'>;

/**
 * The user-owned Serve Plan block, as the off-schedule alert reads it.
 *
 * `enabled` is the planner itself and `driftAlert` the push nested under it:
 * with no plan on the screen there is no verdict to be off, so the alert cannot
 * fire whatever the nested switch says. `driftMin` is here because the alert
 * has to say what tolerance was exceeded — the comparison itself was already
 * made by the plan.
 */
export interface ServePlanAlertSettings {
  enabled: boolean;
  driftAlert: boolean;
  /** How many minutes off the pull-by time, either way, still count as on plan. */
  driftMin: number;
}

/** The user-owned notification settings the engine reads. */
export interface AlertSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
  smokeComplete: SmokeCompleteAlertSettings;
  headsUp: HeadsUpAlertSettings;
  servePlan: ServePlanAlertSettings;
}

/** The latest reading from the smoker. `null` means "nothing readable". */
export interface AlertReading {
  chamberTemp: number | null;
  /** The meat probes' readings by slot; an absent slot read nothing. */
  probeTemps: Record<string, number | null | undefined>;
}

/** The names alerts refer to the smoker's probes by. */
export interface AlertNames {
  chamber: string;
  /** Display name by probe slot, already resolved for the active cook. */
  probes: Record<string, string | undefined>;
}

/**
 * Machine-owned bookkeeping. Deliberately separate from {@link AlertSettings}:
 * evaluation writes this and never the settings the user is editing.
 */
export interface AlertRuntimeState {
  /** Whether the chamber has reached its range at least once this session. */
  chamberArmed: boolean;
  /** When the current out-of-range excursion began; `null` while in range. */
  chamberOutOfRangeSince: Date | null;
  /** Whether the current excursion has already alerted. */
  chamberAlertSent: boolean;
  /**
   * The slots whose target has already been announced this session. Scoped to
   * the session by the caller, so clearing a smoke lets the same probe alert
   * again on the next cook.
   */
  probeTargetsReached: string[];
  /**
   * The slots the completion rule has seen reach their target this session.
   *
   * Separate from {@link probeTargetsReached}, which records what the Probe
   * Target Reached alert has *announced* and therefore stays empty while that
   * alert is switched off. The two alerts are configured independently, so the
   * completion rule keeps its own memory of "has been reached" — otherwise, with
   * the per-probe alert off, completion would be judged on one instant's
   * readings and a probe re-seated or unplugged after finishing would hold the
   * cook open forever.
   */
  smokeCompleteProbesDone: string[];
  /**
   * Whether this session has already been declared complete. Scoped to the
   * session the same way, so the next cook can complete on its own account.
   */
  smokeCompleteFired: boolean;
  /**
   * How many consecutive ticks each slot has been projected inside its lead.
   * The debounce that keeps one noisy projection from announcing a finish that
   * is not coming.
   */
  headsUpCounters: Record<string, number>;
  /**
   * The slots whose heads-up has been spent this session — announced, or
   * silently given up because the meat got there first. Scoped to the session
   * by the caller, like the other fired-once markers.
   */
  headsUpFired: string[];
  /**
   * How many consecutive ticks the Serve Plan has read off plan. The same
   * debounce the heads-up rule keeps, for the same reason: the verdict is drawn
   * from a live projection, and one tick past the tolerance is as likely to be
   * the rate settling as the cook genuinely drifting.
   */
  offScheduleTicks: number;
  /**
   * Whether the crossing the cook is currently in has already been announced.
   * Cleared by a return to on track, which is what re-arms the alert — so the
   * cook is told once per drift rather than every half minute of one.
   */
  offScheduleFired: boolean;
}

/** A notification the engine decided to send. */
export interface AlertNotification {
  title: string;
  body: string;
}

export interface AlertEvaluation {
  notifications: AlertNotification[];
  state: AlertRuntimeState;
}

export interface AlertEvaluationInput {
  reading: AlertReading;
  /**
   * How many minutes each watched probe is projected to be from its target,
   * by slot.
   *
   * Populated by the caller only where the projection is live evidence — a
   * cook still warming, stalled or off the heat contributes nothing, so an
   * absent slot means "no opinion" rather than "no time left". The projection
   * itself is made outside the engine, which keeps this a pure comparison.
   */
  etaMinutes?: Record<string, number | null | undefined>;
  /**
   * How the cook is running against its Serve Plan, or `null` where there is no
   * plan to run against.
   *
   * The plan's own output, computed once by the caller from the serve-plan
   * status module and handed to the clients unchanged — the alert and the
   * timeline read the same verdict, so a banner saying "on schedule" can never
   * sit next to a push saying the cook is late.
   */
  servePlan?: ServePlanState | null;
  settings: AlertSettings;
  state: AlertRuntimeState;
  names: AlertNames;
  now: Date;
}

/** The state a session starts from: disarmed, so preheating is silent. */
export const initialAlertRuntimeState = (): AlertRuntimeState => ({
  chamberArmed: false,
  chamberOutOfRangeSince: null,
  chamberAlertSent: false,
  probeTargetsReached: [],
  smokeCompleteProbesDone: [],
  smokeCompleteFired: false,
  headsUpCounters: {},
  headsUpFired: [],
  offScheduleTicks: 0,
  offScheduleFired: false,
});

/**
 * How many consecutive ticks a probe must be projected inside its lead before
 * the cook is told: two, about a minute at the evaluation interval.
 *
 * A projection read off a live rate wobbles with every reading, and one tick
 * that dips under the lead is as likely to be noise as news — a heads-up sends
 * someone out to the smoker, so it is worth a minute's confirmation.
 */
export const HEADS_UP_CONFIRMING_TICKS = 2;

/**
 * How long the chamber must stay out of range before it is worth telling the
 * cook about. Long enough that opening the lid to spritz or wrap does not
 * trigger an alert, short enough that a dying fire is still recoverable.
 */
export const SUSTAINED_EXCURSION_MS = 2 * 60 * 1000;

/** The title every alert this smoker sends is published under. */
const ALERT_TITLE = 'Smoker';

const formatTemp = (temp: number): string => `${Math.round(temp)}°F`;

/**
 * The chamber range rule, over the state it owns. Split from the probe rule so
 * that neither can silence the other: a disabled (or unreadable) chamber must
 * still leave the probe targets free to fire, and vice versa.
 */
const evaluateChamber = (input: AlertEvaluationInput): AlertEvaluation => {
  const { chamber } = input.settings;
  const chamberTemp = input.reading.chamberTemp;
  const state = input.state;

  // A disabled alert is genuinely inert: it neither fires nor accumulates the
  // arming bookkeeping that would let it fire the moment it is switched back on.
  if (!chamber.enabled) {
    return { notifications: [], state };
  }

  // No reading is not a cold reading. Treating an absent chamber temperature as
  // a number would make every low-bound comparison true and alert for the whole
  // cook, which is exactly how the previous implementation misbehaved.
  if (chamberTemp === null || !Number.isFinite(chamberTemp)) {
    return { notifications: [], state };
  }

  const inRange = chamberTemp >= chamber.low && chamberTemp <= chamber.high;
  if (inRange) {
    // Reaching the range is what arms the alert, so a cold start is silent.
    return {
      notifications: [],
      state: {
        ...state,
        chamberArmed: true,
        chamberOutOfRangeSince: null,
        chamberAlertSent: false,
      },
    };
  }

  if (!state.chamberArmed) {
    return { notifications: [], state };
  }

  const since = state.chamberOutOfRangeSince ?? input.now;
  // One alert per excursion. Only a return to range clears this, so a fire that
  // stays out tells the cook once instead of nagging on every tick.
  if (state.chamberAlertSent) {
    return {
      notifications: [],
      state: { ...state, chamberOutOfRangeSince: since },
    };
  }
  if (input.now.getTime() - since.getTime() < SUSTAINED_EXCURSION_MS) {
    return {
      notifications: [],
      state: { ...state, chamberOutOfRangeSince: since },
    };
  }

  const body =
    chamberTemp < chamber.low
      ? `${input.names.chamber} dropped to ${formatTemp(
          chamberTemp,
        )}, below your ${formatTemp(chamber.low)} low.`
      : `${input.names.chamber} climbed to ${formatTemp(
          chamberTemp,
        )}, above your ${formatTemp(chamber.high)} high.`;

  return {
    notifications: [{ title: ALERT_TITLE, body }],
    state: {
      ...state,
      chamberOutOfRangeSince: since,
      chamberAlertSent: true,
    },
  };
};

/** The probes the cook is watching, whichever alerts are switched on. */
const watchedProbes = (
  input: AlertEvaluationInput,
): ProbeTargetEntrySettings[] =>
  input.settings.probeTarget.probes.filter((probe) => probe.enabled);

/**
 * The watched probes this reading shows at or above their target, with the
 * reading that says so.
 *
 * Both probe rules ask this one question — "which meat is done?" — so it is
 * answered in one place. A probe the smoker reported nothing for is not done:
 * read as 0°F an absent reading would leave a cook waiting on an unplugged
 * probe forever, and read as anything else it would announce meat that is not
 * cooking.
 */
const probesAtTarget = (
  input: AlertEvaluationInput,
): Array<{ slot: string; temp: number }> =>
  watchedProbes(input).flatMap((probe) => {
    const temp = input.reading.probeTemps[probe.slot];
    if (temp === null || temp === undefined || !Number.isFinite(temp)) {
      return [];
    }
    return temp < probe.target ? [] : [{ slot: probe.slot, temp }];
  });

/**
 * The Probe Target Reached rule: every watched probe that has reached the
 * temperature its meat is done at, named as this cook named it.
 */
const evaluateProbeTargets = (
  input: AlertEvaluationInput,
  state: AlertRuntimeState,
): AlertEvaluation => {
  if (!input.settings.probeTarget.enabled) {
    return { notifications: [], state };
  }

  const newlyReached = probesAtTarget(input).filter(
    ({ slot }) => !state.probeTargetsReached.includes(slot),
  );
  const notifications: AlertNotification[] = newlyReached.map(
    ({ slot, temp }) => ({
      title: ALERT_TITLE,
      body: `${input.names.probes[slot] ?? slot} reached ${formatTemp(temp)}.`,
    }),
  );

  if (newlyReached.length === 0) {
    return { notifications, state };
  }
  return {
    notifications,
    state: {
      ...state,
      probeTargetsReached: [
        ...state.probeTargetsReached,
        ...newlyReached.map(({ slot }) => slot),
      ],
    },
  };
};

/**
 * The Smoke Complete rule: the moment the last piece of meat is done.
 *
 * Deliberately not wired to the finish action — the person pressing Finish
 * already knows they pressed it. This is the thing they cannot see coming,
 * which is why it is derived from the readings instead.
 *
 * It reads the same watch list the probe rule does, and a probe stays done once
 * it has been seen at its target — a probe re-seated into a cooler part of the
 * meat, or pulled and unplugged once it was finished, must not hold the cook
 * open. That memory is kept here rather than read off the Probe Target Reached
 * alert's announcements, because the two alerts are switched on and off
 * separately: silencing the per-probe chatter must not stop this rule knowing
 * which meat is done.
 *
 * Like every other rule, it is genuinely inert while switched off: it records
 * nothing, so switching it on mid-cook judges the cook from that moment rather
 * than releasing a backlog.
 */
const evaluateSmokeComplete = (
  input: AlertEvaluationInput,
  state: AlertRuntimeState,
): AlertEvaluation => {
  if (!input.settings.smokeComplete.enabled || state.smokeCompleteFired) {
    return { notifications: [], state };
  }

  const watched = watchedProbes(input);
  // Watching nothing is not the same as being finished: with no probe to be
  // done, there is no moment to announce.
  if (watched.length === 0) {
    return { notifications: [], state };
  }

  const done = new Set([
    ...state.smokeCompleteProbesDone,
    // What the per-probe alert has already announced counts too, so switching
    // this alert on part-way through a cook does not forget finished meat the
    // cook has already been told about.
    ...state.probeTargetsReached,
    ...probesAtTarget(input).map(({ slot }) => slot),
  ]);
  const remembered: AlertRuntimeState = {
    ...state,
    smokeCompleteProbesDone: [...done],
  };
  if (!watched.every((probe) => done.has(probe.slot))) {
    return { notifications: [], state: remembered };
  }

  return {
    notifications: [
      {
        title: ALERT_TITLE,
        body: 'Smoke complete — every probe you are watching has reached its target.',
      },
    ],
    state: { ...remembered, smokeCompleteFired: true },
  };
};

/**
 * The heads-up rule: the cook is told the meat is nearly done, in time to do
 * something about it.
 *
 * It compares minutes against minutes and nothing else — the projection behind
 * `etaMinutes` is made by the caller, from the same estimator the Estimated
 * Completion card reads, so the alert and the card can never disagree about
 * when the meat will be done.
 */
const evaluateHeadsUp = (
  input: AlertEvaluationInput,
  state: AlertRuntimeState,
): AlertEvaluation => {
  if (!input.settings.headsUp.enabled) {
    // Inert, and inert all the way down: a run of confirming ticks that was
    // under way when the cook silenced the alert is dropped rather than
    // banked. The ticks either side of an off period are not consecutive, and
    // keeping the count would let the first tick after it fires — the very
    // noise the confirming run exists to filter out.
    return {
      notifications: [],
      state: { ...state, headsUpCounters: {} },
    };
  }

  // Built fresh rather than copied: the counters describe runs of ticks that
  // are under way right now, and a slot that has stopped being watched (or has
  // fired) has no run to remember. Copying would carry it for the rest of the
  // cook.
  const counters: Record<string, number> = {};
  const fired = [...state.headsUpFired];
  const notifications: AlertNotification[] = [];
  const done = new Set([
    ...probesAtTarget(input).map(({ slot }) => slot),
    // Meat that has been seen at its target stays done, however the probe
    // reads afterwards — the same memory the completion rule keeps, for the
    // same reason.
    ...state.probeTargetsReached,
    ...state.smokeCompleteProbesDone,
  ]);

  watchedProbes(input).forEach((probe) => {
    if (state.headsUpFired.includes(probe.slot)) {
      return;
    }
    const lead = probe.leadMinutes;
    if (lead === null || lead === undefined) {
      // Nobody asked to be warned about this probe, so there is nothing to
      // spend and nothing to count.
      return;
    }
    if (done.has(probe.slot)) {
      // The meat got there before the heads-up was confirmed. Spent in silence:
      // "about a minute from 170°F" is not worth saying about meat that is
      // already at 171°F, and the Probe Target Reached alert owns that moment.
      fired.push(probe.slot);
      return;
    }
    const minutes = input.etaMinutes?.[probe.slot];
    const temp = input.reading.probeTemps[probe.slot];
    if (
      minutes === null ||
      minutes === undefined ||
      !Number.isFinite(minutes) ||
      minutes > lead ||
      temp === null ||
      temp === undefined ||
      !Number.isFinite(temp)
    ) {
      // No live projection, or a finish still further off than the lead: the
      // run of confirming ticks is broken, and the next one under the lead
      // starts a new run rather than completing this one.
      return;
    }
    const ticks = (state.headsUpCounters[probe.slot] ?? 0) + 1;
    if (ticks < HEADS_UP_CONFIRMING_TICKS) {
      counters[probe.slot] = ticks;
      return;
    }
    fired.push(probe.slot);
    notifications.push({
      title: ALERT_TITLE,
      body: `${input.names.probes[probe.slot] ?? probe.slot} at ${formatTemp(
        temp,
      )} — about ${Math.round(minutes)} minutes from ${formatTemp(
        probe.target,
      )}.`,
    });
  });

  return {
    notifications,
    state: { ...state, headsUpCounters: counters, headsUpFired: fired },
  };
};

/**
 * How many consecutive off-plan ticks are needed before the cook is paged:
 * two, the same confirmation the heads-up rule asks for.
 *
 * The verdict is drawn from the same live projection, and it moves with it —
 * one tick past the tolerance is as often the rate settling as the cook
 * genuinely drifting, and this alert asks someone to change their dinner plans.
 */
export const OFF_SCHEDULE_CONFIRMING_TICKS = 2;

/**
 * Which way the cook is off plan and by how many minutes, or `null` where the
 * plan says nothing to page about: no plan at all, a verdict of `unknown` — the
 * cook is still warming, or the projection is not yet trustworthy — or an
 * off-plan verdict carrying no amount, when how far off is the whole of what
 * this alert has to say.
 *
 * Always plural minutes: the smallest tolerance a plan can be set to is
 * fifteen, and this is the drift that exceeded it.
 */
const offPlanBy = (
  plan: ServePlanState | null | undefined,
): { direction: string; minutes: string } | null => {
  if (plan?.verdict !== 'early' && plan?.verdict !== 'behind') {
    return null;
  }
  if (plan.slackMinutes === null) {
    return null;
  }
  return {
    direction: plan.verdict === 'behind' ? 'behind plan' : 'ahead of plan',
    minutes: `${Math.abs(Math.round(plan.slackMinutes))} minutes`,
  };
};

/**
 * The off-schedule rule: the cook is running further off their Serve Plan than
 * they said they would accept.
 *
 * It compares nothing itself. The verdict comes from the serve-plan status the
 * timeline hands every client, so the push and the card on the screen always
 * say the same thing; all this rule owns is when to speak — twice confirmed,
 * once per crossing, re-armed by a return to plan.
 */
const evaluateOffSchedule = (
  input: AlertEvaluationInput,
  state: AlertRuntimeState,
): AlertEvaluation => {
  const { enabled, driftAlert, driftMin } = input.settings.servePlan;
  // Inert, and inert all the way down: a planner switched off — or a push
  // silenced under it — banks no confirming ticks, so switching it back on
  // judges the cook from that moment instead of firing on its first tick.
  if (!enabled || !driftAlert) {
    return { notifications: [], state: { ...state, offScheduleTicks: 0 } };
  }

  const plan = input.servePlan;
  if (plan?.verdict === 'ontrack') {
    // Back on plan: the run is over and the alert is re-armed, so the next
    // drift is announced on its own account.
    return {
      notifications: [],
      state: { ...state, offScheduleTicks: 0, offScheduleFired: false },
    };
  }
  const drift = offPlanBy(plan);
  // Neither a plan that cannot be judged nor one with no amount to name is
  // evidence of being back on plan, so the run of confirming ticks is broken
  // but the crossing stays spent.
  if (!drift) {
    return { notifications: [], state: { ...state, offScheduleTicks: 0 } };
  }
  if (state.offScheduleFired) {
    return { notifications: [], state: { ...state, offScheduleTicks: 0 } };
  }

  const ticks = state.offScheduleTicks + 1;
  if (ticks < OFF_SCHEDULE_CONFIRMING_TICKS) {
    return { notifications: [], state: { ...state, offScheduleTicks: ticks } };
  }

  return {
    notifications: [
      {
        title: ALERT_TITLE,
        body: `Running ${drift.minutes} ${drift.direction} — more than the ${driftMin} minutes you allow.`,
      },
    ],
    state: { ...state, offScheduleTicks: 0, offScheduleFired: true },
  };
};

/**
 * Evaluate every alert against one reading. Each rule owns its own slice of the
 * runtime state, and the state each returns is threaded into the next, so the
 * caller persists a single answer.
 */
export const evaluateAlerts = (
  input: AlertEvaluationInput,
): AlertEvaluation => {
  const chamber = evaluateChamber(input);
  const probes = evaluateProbeTargets(input, chamber.state);
  const complete = evaluateSmokeComplete(input, probes.state);
  const headsUp = evaluateHeadsUp(input, complete.state);
  const offSchedule = evaluateOffSchedule(input, headsUp.state);
  return {
    notifications: [
      ...chamber.notifications,
      ...probes.notifications,
      ...complete.notifications,
      ...headsUp.notifications,
      ...offSchedule.notifications,
    ],
    state: offSchedule.state,
  };
};
