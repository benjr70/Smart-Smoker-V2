import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { StatsDto } from './stats.dto';

export type StatsSnapshotDocument = StatsSnapshot & Document;

/**
 * The archive's statistics as they were last computed.
 *
 * A singleton — one document for the whole installation, addressed by an empty
 * filter the way the application settings are. What it holds is the finished
 * DTO rather than the pieces it was made of: the screen's read is meant to be
 * one document and no arithmetic, and storing the parts would put the
 * aggregator back on the read path it was moved off.
 *
 * The two fields beside it are how a stale document announces itself. `dirty`
 * is set by the cheap writes that change the numbers without being worth a
 * recompute (a rating slider, saved a dozen times as it is dragged), and
 * `completedSmokes` is compared against a count of the archive so that a change
 * nobody told this module about — a smoke finished by a hand-edit, a restored
 * backup — still heals on the next read.
 */
@Schema({ collection: 'stats' })
export class StatsSnapshot {
  /**
   * The stored statistics. Absent on a document that only exists because
   * something marked it dirty before anything ever computed it.
   */
  @Prop({ type: Object, default: null })
  aggregate: StatsDto | null;

  /** Whether something has changed the numbers since they were computed. */
  @Prop({ default: false })
  dirty: boolean;

  /**
   * How many times the archive has been declared stale, ever.
   *
   * A rebuild reads this before it reads the cooks and only clears {@link
   * dirty} if it is still the same afterwards. Without it, a score written
   * while the rebuild was reading would have its flag cleared by a computation
   * that never saw it, and — the cook count being unchanged — nothing would
   * ever notice again.
   */
  @Prop({ default: 0 })
  revision: number;

  /** How many completed cooks {@link aggregate} was derived from. */
  @Prop({ default: 0 })
  completedSmokes: number;

  /** When the stored aggregate was last computed. */
  @Prop({ type: Date, default: null })
  computedAt: Date | null;
}

export const StatsSnapshotSchema = SchemaFactory.createForClass(StatsSnapshot);
