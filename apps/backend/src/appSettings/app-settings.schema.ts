import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { AppearanceMode, ColorScheme } from './appearance';

export type ApplicationSettingsDocument = ApplicationSettings & Document;

/**
 * The chamber Temperature Alert: a low/high range the chamber is expected to
 * hold. Introduced with the notification settings; it lives on the application
 * settings document now that the same document also carries preferences that are
 * nothing to do with notifications.
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
 * How the installation looks: the mode an operator chose, and what that choice
 * resolved to on the client that last wrote it.
 *
 * There are no user accounts here, so this is one installation-wide value shared
 * by every browser and the touchscreen rather than a per-browser one. The
 * resolved half is stored because "follow the device" cannot be resolved by a
 * client that has no device preference of its own — the touchscreen reads this
 * value instead of asking its own browser, which always claims light.
 */
@Schema({ _id: false })
export class AppearanceSettings {
  @ApiProperty({ enum: ['light', 'dark', 'system'] })
  @Prop({ default: 'system' })
  mode: AppearanceMode;

  @ApiProperty({ enum: ['light', 'dark'] })
  @Prop({ default: 'light' })
  resolvedMode: ColorScheme;
}

export const AppearanceSettingsSchema =
  SchemaFactory.createForClass(AppearanceSettings);

/**
 * The single application settings document.
 *
 * Holds nothing the machine writes: armed flags, excursion counters and
 * fired-once markers live in the separate `AlertState` document, so alert
 * evaluation can never overwrite settings being edited in the UI.
 */
@Schema()
export class ApplicationSettings {
  @ApiProperty({ type: ChamberAlertSettings })
  @Prop({ type: ChamberAlertSettingsSchema, default: () => ({}) })
  chamber: ChamberAlertSettings;

  @ApiProperty({ type: AppearanceSettings })
  @Prop({ type: AppearanceSettingsSchema, default: () => ({}) })
  appearance: AppearanceSettings;
}

export const ApplicationSettingsSchema =
  SchemaFactory.createForClass(ApplicationSettings);
