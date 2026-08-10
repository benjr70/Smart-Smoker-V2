import { ApiProperty } from '@nestjs/swagger';

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
