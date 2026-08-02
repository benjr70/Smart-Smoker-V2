/**
 * The alert engine: a pure decision function over one reading.
 *
 * It takes the latest reading, the user's settings, the runtime state it
 * returned last time, the resolved probe names and the current time, and returns
 * the notifications to send plus the next runtime state. It touches no database,
 * no push library and no ambient clock, so every timing and arming rule is
 * verifiable with plain table tests and no fake timers.
 */

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
}

/** The user-owned Probe Target Reached alert. */
export interface ProbeTargetAlertSettings {
  enabled: boolean;
  probes: ProbeTargetEntrySettings[];
}

/** The user-owned notification settings the engine reads. */
export interface AlertSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
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
});

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

/**
 * The Probe Target Reached rule: every watched probe that has reached the
 * temperature its meat is done at, named as this cook named it.
 */
const evaluateProbeTargets = (
  input: AlertEvaluationInput,
  state: AlertRuntimeState,
): AlertEvaluation => {
  const { probeTarget } = input.settings;
  if (!probeTarget.enabled) {
    return { notifications: [], state };
  }

  const notifications: AlertNotification[] = [];
  const reached: string[] = [];
  probeTarget.probes.forEach((probe) => {
    if (!probe.enabled || state.probeTargetsReached.includes(probe.slot)) {
      return;
    }
    const temp = input.reading.probeTemps[probe.slot];
    if (temp === null || temp === undefined || !Number.isFinite(temp)) {
      return;
    }
    if (temp < probe.target) {
      return;
    }
    const name = input.names.probes[probe.slot] ?? probe.slot;
    reached.push(probe.slot);
    notifications.push({
      title: ALERT_TITLE,
      body: `${name} reached ${formatTemp(temp)}.`,
    });
  });

  if (reached.length === 0) {
    return { notifications, state };
  }
  return {
    notifications,
    state: {
      ...state,
      probeTargetsReached: [...state.probeTargetsReached, ...reached],
    },
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
  return {
    notifications: [...chamber.notifications, ...probes.notifications],
    state: probes.state,
  };
};
