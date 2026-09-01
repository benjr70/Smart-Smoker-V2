import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PullStamp } from './pull-stamp';
import { ServePlan } from './serve-plan';

export type SmokeDocument = Smoke & Document;

export enum SmokeStatus {
  'InProgress',
  'Complete',
}

@Schema()
export class Smoke implements ServePlan, PullStamp {
  @Prop()
  preSmokeId: string;

  @Prop()
  tempsId: string;

  @Prop()
  postSmokeId: string;

  @Prop()
  smokeProfileId: string;

  @Prop()
  ratingId: string;

  @Prop()
  date: Date;

  /**
   * When the cook actually started — the first time smoking was switched on,
   * which is a different moment from `date` (when the session was created,
   * often hours earlier while the meat was still being trimmed).
   *
   * Optional because every smoke recorded before this field existed has none.
   * Such a cook derives its times from its readings; see the timeline module.
   */
  @Prop()
  startedAt?: Date;

  /** When the cook was finished. Optional for the same reason as `startedAt`. */
  @Prop()
  finishedAt?: Date;

  /**
   * The target temperature, °F, the primary watched probe carried at the moment
   * this cook was finished.
   *
   * Snapshotted rather than looked up on read: the settings it comes from are
   * edited for the next cook, and history must go on saying what this one was
   * aiming at.
   */
  @Prop()
  targetTemp?: number;

  /**
   * The hottest the chamber ever ran this cook, °F, taken from its readings at
   * the moment it was finished.
   *
   * Stamped rather than derived on read because a finished cook's series never
   * changes again, and the statistics screen asks this of every cook there has
   * ever been — deriving it would scan the whole temperature archive on every
   * read. Optional: a cook that recorded no readings has no peak, and cooks
   * finished before this field existed are backfilled the first time the
   * statistics are rebuilt over them.
   */
  @Prop()
  peakChamber?: number;

  /**
   * Whether this cook's readings have been searched for a peak chamber
   * temperature — set at finish, and by the backfill that catches up with
   * cooks finished before peaks were stamped.
   *
   * Separate from the peak itself because a search can come back with nothing:
   * a cook that recorded no readable chamber reading has no peak to stamp, and
   * without a mark saying it was asked, every future statistics rebuild would
   * ask its series again forever. The pair reads as: no mark, never asked;
   * mark and a peak, that is the peak; mark and no peak, there was none.
   */
  @Prop()
  peakChamberScanned?: boolean;

  /**
   * Whether this cook's finish was derived from its readings by the legacy
   * cook-window backfill, rather than observed when the cook was ended.
   *
   * The backfill cuts a series at the first silence longer than the auto-stop
   * threshold, which is almost always the box being fired up again weeks after
   * a session nobody ended — but a cook whose readings genuinely stopped for
   * that long (the backend down, the box off wifi overnight) is cut the same
   * way. This mark is what tells the two apart afterwards: no rows are ever
   * deleted, so a cook carrying it can be re-derived from its readings, and one
   * without it carries a finish somebody or something actually recorded.
   */
  @Prop()
  cookWindowBackfilled?: boolean;

  /**
   * The Serve Plan, stored on the cook rather than in the settings because it
   * is this dinner's, not this installation's: a reload, the touchscreen and a
   * second phone all read the one plan back, and next weekend's cook starts
   * without one. Declared by {@link ServePlan}; the props are here because
   * Mongoose learns a field from the decorator, and a field the schema does not
   * declare never reaches storage.
   */
  @Prop()
  serveAt?: Date | null;

  @Prop()
  restMinutes?: number | null;

  /**
   * The pull: when the meat came off and how hot it was, stamped by the step
   * advance that took the cook to Post-Smoke. Declared by {@link PullStamp};
   * the props are here for the same reason the plan's are — a field the schema
   * does not declare never reaches storage.
   */
  @Prop()
  pullAt?: Date | null;

  @Prop()
  pullTemp?: number | null;

  @Prop({
    required: true,
    type: Number,
    enum: [SmokeStatus.InProgress, SmokeStatus.Complete],
  })
  status: SmokeStatus;
}

export const SmokeSchema = SchemaFactory.createForClass(Smoke);

/**
 * Every read of a stored temperature series asks which cook owns it, by the
 * series' id, so the chart of a finished cook can be bounded to the cook (see
 * `TempsService.getAllTempsById`). Without this index that question is a scan
 * of the whole cook archive, and it is asked on every chart draw — so history
 * would get slower with every cook ever recorded.
 */
SmokeSchema.index({ tempsId: 1 });
