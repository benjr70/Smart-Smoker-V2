import { ApiProperty } from '@nestjs/swagger';
import { CompletionEstimate } from './completion-estimate';
import {
  ServePlanMilestone,
  ServePlanStatus,
  ServeVerdict,
} from './serve-plan-status';

/**
 * A smoke's timing and extremes, as every client reads them.
 *
 * Every field is nullable on purpose: a cook recorded before the stamps existed,
 * or one that never recorded a reading, genuinely has no such number, and the
 * screens render that absence as an em-dash. Answering a zero instead would be
 * indistinguishable from a cook that really did take no time.
 */
export class SmokeTimeline {
  /** When the cook started — stamped, or the first reading of a legacy cook. */
  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null;

  /** When the cook finished — stamped, or the last reading of a legacy cook. */
  @ApiProperty({ type: Date, nullable: true })
  finishedAt: Date | null;

  /** How long the cook ran, in milliseconds. */
  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;

  /** The highest chamber reading of the cook, °F. */
  @ApiProperty({ type: Number, nullable: true })
  peakChamber: number | null;

  /** The highest reading across the three meat probes, °F. */
  @ApiProperty({ type: Number, nullable: true })
  peakMeat: number | null;

  /**
   * The target the primary watched probe was set to when the cook finished,
   * snapshotted at that moment so a later settings change cannot rewrite it.
   */
  @ApiProperty({ type: Number, nullable: true })
  targetTemp: number | null;
}

/**
 * When the cook in progress will be done, as the clients render it.
 *
 * Derived on every read and never stored: it is a restatement of the readings
 * and the settings behind it, and a stored copy would be a second opinion that
 * went stale the moment either changed.
 *
 * Nullable throughout, and for two different reasons the clients tell apart by
 * the state: a `warming` cook has no numbers *yet*, while a `null` state means
 * no probe is being watched at all and there is nothing to estimate towards.
 */
export class CompletionEstimateDto implements CompletionEstimate {
  /**
   * How the cook is going: warming up, on track, stalled, off the heat, or
   * done — and `null` when no probe is being watched.
   */
  @ApiProperty({
    enum: ['warming', 'ok', 'stalled', 'paused', 'done'],
    nullable: true,
  })
  state: CompletionEstimate['state'];

  /** When the meat is expected to reach its target. */
  @ApiProperty({ type: Date, nullable: true })
  eta: Date | null;

  /** How long that is from now, in hours. */
  @ApiProperty({ type: Number, nullable: true })
  hoursRemaining: number | null;

  /** How fast the meat is climbing, °F/hr. */
  @ApiProperty({ type: Number, nullable: true })
  ratePerHour: number | null;

  /** How far it has come from where it started, as a percentage. */
  @ApiProperty({ type: Number, nullable: true })
  progressPercent: number | null;

  /** The first reading of the cook on the watched probe, °F. */
  @ApiProperty({ type: Number, nullable: true })
  startTemp: number | null;

  /** What the watched probe is set to be done at, °F. */
  @ApiProperty({ type: Number, nullable: true })
  targetTemp: number | null;
}

/** One thing the plan is still waiting on, as the clients render it. */
export class ServePlanMilestoneDto implements ServePlanMilestone {
  @ApiProperty({ enum: ['wrap', 'pullBy', 'restUntil'] })
  kind: ServePlanMilestone['kind'];

  /** When it happens; `null` for the wrap, which is a temperature not a time. */
  @ApiProperty({ type: Date, nullable: true })
  at: Date | null;

  /** The temperature it happens at, °F; only the wrap hint carries one. */
  @ApiProperty({ type: Number, nullable: true })
  temp: number | null;
}

/**
 * The Serve Plan of the cook in progress, worked out server-side.
 *
 * Derived on every read and never stored, like the projection it is judged
 * against: the plan itself is what is stored, on the cook. The clients render
 * this verdict and never re-derive one, so the phone, the touchscreen and the
 * push notification cannot disagree about whether dinner is on time.
 */
export class ServePlanStatusDto implements ServePlanStatus {
  /** When the food is meant to hit the table, as the cook stored it. */
  @ApiProperty({ type: Date })
  serveAt: Date;

  /** How long the meat rests, in minutes, as the cook stored it. */
  @ApiProperty()
  restMinutes: number;

  /** Serve time less the rest: the last moment the meat can come off. */
  @ApiProperty({ type: Date })
  pullBy: Date;

  /**
   * Minutes of cushion between the projection and the pull-by time — negative
   * when the cook is running late, and `null` while no trustworthy projection
   * exists, which is the only thing that makes the verdict `unknown`.
   */
  @ApiProperty({ type: Number, nullable: true })
  slackMinutes: number | null;

  @ApiProperty({ enum: ['early', 'ontrack', 'behind', 'unknown'] })
  verdict: ServeVerdict;

  @ApiProperty({ type: [ServePlanMilestoneDto] })
  milestones: ServePlanMilestoneDto[];
}

/** The cook in progress: its timeline so far, and where it is going. */
export class CurrentSmokeTimeline extends SmokeTimeline {
  @ApiProperty({ type: CompletionEstimateDto })
  estimate: CompletionEstimateDto;

  /**
   * The Serve Plan, when the feature is on and this cook has one.
   *
   * Absent rather than null in both other cases: a client reading no plan
   * renders no card, and it has no use for the difference between a feature
   * that is switched off and a cook nobody planned — the settings it already
   * reads say which it is.
   */
  @ApiProperty({ type: ServePlanStatusDto, required: false })
  servePlan?: ServePlanStatusDto;
}
