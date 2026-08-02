import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type NotificationSettingsDocument = NotificationSettings & Document;

/**
 * The chamber Temperature Alert: a low/high range the chamber is expected to
 * hold. Replaces the freeform `{probe1, op, probe2, offset, message}` rule the
 * settings page used to ask the user to assemble.
 */
@Schema({ _id: false })
export class ChamberAlertSettings {
  @ApiProperty()
  @Prop({ default: false })
  enabled: boolean;

  @ApiProperty()
  @Prop({ default: 225 })
  low: number;

  @ApiProperty()
  @Prop({ default: 275 })
  high: number;
}

export const ChamberAlertSettingsSchema =
  SchemaFactory.createForClass(ChamberAlertSettings);

/**
 * The user-owned notification settings document.
 *
 * Holds nothing the machine writes: armed flags, excursion counters and
 * fired-once markers live in the separate {@link AlertState} document, so alert
 * evaluation can never overwrite settings being edited in the UI.
 */
@Schema()
export class NotificationSettings {
  @ApiProperty({ type: ChamberAlertSettings })
  @Prop({ type: ChamberAlertSettingsSchema, default: () => ({}) })
  chamber: ChamberAlertSettings;
}

export const NotificationSettingsSchema =
  SchemaFactory.createForClass(NotificationSettings);
