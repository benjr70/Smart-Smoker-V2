import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type AlertStateDocument = AlertState & Document;

/**
 * The machine-owned half of the notification feature: what the alert engine has
 * decided so far this session.
 *
 * Kept in its own document — never on the user's settings — because evaluation
 * writes it on every tick, and the previous implementation's habit of rewriting
 * the whole settings document to record a timestamp silently clobbered whatever
 * the user was typing in the settings page at that moment.
 *
 * It is scoped to a session by `smokeId`: clearing a smoke changes the current
 * smoke id, and state recorded against a different id is discarded rather than
 * carried into the next cook. That is what makes the next preheat silent again.
 */
@Schema()
export class AlertState {
  /** The smoke this bookkeeping belongs to. */
  @Prop()
  smokeId: string;

  /** Whether the chamber has reached its configured range at least once. */
  @Prop({ default: false })
  chamberArmed: boolean;

  /** When the current out-of-range excursion began; null while in range. */
  @Prop({ type: Date, default: null })
  chamberOutOfRangeSince: Date | null;

  /** Whether the current excursion has already produced an alert. */
  @Prop({ default: false })
  chamberAlertSent: boolean;
}

export const AlertStateSchema = SchemaFactory.createForClass(AlertState);
