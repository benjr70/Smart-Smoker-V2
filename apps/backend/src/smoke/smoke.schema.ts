import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type SmokeDocument = Smoke & Document;

export enum SmokeStatus {
  'InProgress',
  'Complete',
}

@Schema()
export class Smoke {
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

  @Prop({
    required: true,
    type: Number,
    enum: [SmokeStatus.InProgress, SmokeStatus.Complete],
  })
  status: SmokeStatus;
}

export const SmokeSchema = SchemaFactory.createForClass(Smoke);
