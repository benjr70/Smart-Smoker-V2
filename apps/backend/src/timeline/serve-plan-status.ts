/**
 * The Serve Plan: the cook read backwards from the moment the food hits the
 * table, as one pure function over the plan, the projection and the settings.
 */

/** How the cook is running against the plan. */
export type ServeVerdict = 'early' | 'ontrack' | 'behind' | 'unknown';

/** Everything the verdict is worked out from. */
export interface ServePlanInput {
  /** When the food is meant to hit the table, or `null` for no plan at all. */
  serveAt: Date | null;
  /** How long the meat will rest, in minutes. */
  restMinutes: number | null;
  /** When the meat is expected to be done — `null` unless it is trustworthy. */
  eta: Date | null;
  /** How far off the pull-by time, either way, still counts as on plan. */
  driftMin: number;
  /** The temperature the cook wraps around, °F. */
  wrapTemp: number;
  /** Whether a wrap has already been stamped into this cook's log. */
  wrapStamped: boolean;
  /** What the watched probe last read, °F, or `null` if it has not yet. */
  probeTemp: number | null;
}

/**
 * One thing the plan is still waiting on.
 *
 * A single list rather than a field each, because the clients render it as the
 * schedule it reads as — and the wrap hint comes and goes while the two times
 * are always there.
 */
export interface ServePlanMilestone {
  kind: 'wrap' | 'pullBy' | 'restUntil';
  /** When it happens; `null` for the wrap, which is a temperature not a time. */
  at: Date | null;
  /** The temperature it happens at; only the wrap hint carries one. */
  temp: number | null;
}

/** The plan, as every client reads it. */
export interface ServePlanStatus {
  /** The plan as it is stored, echoed so a client renders one source. */
  serveAt: Date;
  restMinutes: number;
  /** Serve time less the rest: the last moment the meat can come off. */
  pullBy: Date;
  /** Minutes of cushion between the projection and the pull-by time. */
  slackMinutes: number | null;
  verdict: ServeVerdict;
  milestones: ServePlanMilestone[];
}

const MINUTE_MS = 60_000;

/**
 * The plan for a cook, or `null` when there is no plan: the serve time is what
 * the whole thing is worked back from, and there is nothing to say without one.
 *
 * `slackMinutes` is signed — positive is cushion, negative is running late —
 * and `null` while no trustworthy projection exists, which is the only thing
 * that makes the verdict `unknown`. A plan that cannot be judged is still
 * answered, so the clients render its milestones while they wait.
 */
export const servePlanStatus = (
  input: ServePlanInput,
): ServePlanStatus | null => {
  const { serveAt, eta, driftMin } = input;
  if (!serveAt) {
    return null;
  }
  // No rest is no rest: the pull-by time is the serve time, which is what a
  // plan carrying only a serve time says. Inventing a rest here would move the
  // pull-by time of every cook stored without one — including every cook
  // recorded before the plan existed — and report it behind while it is on
  // plan.
  const restMinutes = input.restMinutes ?? 0;
  const pullBy = new Date(serveAt.getTime() - restMinutes * MINUTE_MS);
  // Whole minutes, because that is the unit the clients render and the unit the
  // tolerance is set in: a cook thirty-seven seconds late is a minute late, not
  // "0.6166666666666667".
  const slackMinutes = eta
    ? Math.round((pullBy.getTime() - eta.getTime()) / MINUTE_MS)
    : null;
  return {
    serveAt,
    restMinutes,
    pullBy,
    slackMinutes,
    verdict: verdictOf(slackMinutes, driftMin),
    milestones: milestonesOf(input, serveAt, pullBy),
  };
};

/**
 * What the plan still has ahead of it, in the order it happens: the wrap while
 * it is still to come, the pull, and the end of the rest — which is the serve
 * time itself, so the plan reads as a schedule rather than as arithmetic.
 */
const milestonesOf = (
  input: ServePlanInput,
  serveAt: Date,
  pullBy: Date,
): ServePlanMilestone[] => [
  ...(wrapAhead(input)
    ? [{ kind: 'wrap' as const, at: null, temp: input.wrapTemp }]
    : []),
  { kind: 'pullBy' as const, at: pullBy, temp: null },
  { kind: 'restUntil' as const, at: serveAt, temp: null },
];

/**
 * Whether the wrap is still ahead of the cook: nothing has been stamped, and
 * the watched probe reads below the wrap temperature.
 *
 * A cook with no reading at all is not hinted at. The hint is a claim about
 * where the meat is, and with no probe watched — or none reading — there is
 * nothing to make that claim from: a probe pulled out of a 190°F brisket would
 * otherwise put "wrap around 165°" back on the plan for the rest of the cook.
 */
const wrapAhead = ({
  wrapStamped,
  probeTemp,
  wrapTemp,
}: ServePlanInput): boolean =>
  !wrapStamped && probeTemp !== null && probeTemp < wrapTemp;

/**
 * The verdict the design's prototype gives: cushion beyond the tolerance is
 * early, lateness beyond it is behind, and the band between them — the
 * tolerance itself included at both ends — is on track. Exactly the tolerance
 * off plan is what the user said they would accept, so it is not yet off it.
 */
const verdictOf = (
  slackMinutes: number | null,
  driftMin: number,
): ServeVerdict => {
  if (slackMinutes === null) {
    return 'unknown';
  }
  if (slackMinutes > driftMin) {
    return 'early';
  }
  return slackMinutes < -driftMin ? 'behind' : 'ontrack';
};
