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
 * Where a probe's target came from: nobody (the shipped default), the preset
 * seeded when the session started, or the user typing one in.
 *
 * Recorded because seeding must never overwrite a temperature a person chose,
 * and the value alone cannot tell the two apart — a hand-typed 203 looks
 * exactly like the default 203.
 */
export type TargetSource = 'default' | 'preset' | 'user';

/**
 * One probe's entry in the Probe Target Reached alert.
 *
 * Keyed by `slot` — the smoker's physical probe — and never by name: names
 * belong to the cook and are resolved live from the active smoke profile (see
 * `probe-names.ts`), so a watch list configured last weekend survives a profile
 * that renames every probe.
 */
@Schema({ _id: false })
export class ProbeTargetEntry {
  @ApiProperty()
  @Prop()
  slot: string;

  /** Whether this probe is being watched. */
  @ApiProperty()
  @Prop({ default: false })
  enabled: boolean;

  /** The temperature, °F, this probe's meat is done at. */
  @ApiProperty()
  @Prop({ default: 203 })
  target: number;

  /** Where that target came from — see {@link TargetSource}. */
  @ApiProperty({ enum: ['default', 'preset', 'user'] })
  @Prop({ default: 'default' })
  targetSource: TargetSource;
}

export const ProbeTargetEntrySchema =
  SchemaFactory.createForClass(ProbeTargetEntry);

/**
 * The Probe Target Reached alert: switched on or off as a whole, plus one entry
 * per probe slot.
 */
@Schema({ _id: false })
export class ProbeTargetAlertSettings {
  @ApiProperty()
  @Prop({ default: false })
  enabled: boolean;

  @ApiProperty({ type: [ProbeTargetEntry] })
  @Prop({ type: [ProbeTargetEntrySchema], default: () => [] })
  probes: ProbeTargetEntry[];
}

export const ProbeTargetAlertSettingsSchema = SchemaFactory.createForClass(
  ProbeTargetAlertSettings,
);

/**
 * The Smoke Complete alert: on or off, and nothing else.
 *
 * What counts as complete is the probe watch list above — every probe being
 * watched has reached its target — so this block deliberately carries no second
 * description of it that could disagree.
 */
@Schema({ _id: false })
export class SmokeCompleteAlertSettings {
  @ApiProperty()
  @Prop({ default: false })
  enabled: boolean;
}

export const SmokeCompleteAlertSettingsSchema = SchemaFactory.createForClass(
  SmokeCompleteAlertSettings,
);
/**
 * The default target temperature, °F, per meat category.
 *
 * One field per category rather than a free-form map: the categories are the
 * ones the matcher knows about, and a stored key it has never heard of could
 * only ever be dead weight the settings page still had to render.
 */
@Schema({ _id: false })
export class TargetPresets {
  @ApiProperty()
  @Prop({ default: 203 })
  beef: number;

  @ApiProperty()
  @Prop({ default: 195 })
  pork: number;

  @ApiProperty()
  @Prop({ default: 165 })
  poultry: number;
}

export const TargetPresetsSchema = SchemaFactory.createForClass(TargetPresets);

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

  @ApiProperty({ type: ProbeTargetAlertSettings })
  @Prop({ type: ProbeTargetAlertSettingsSchema, default: () => ({}) })
  probeTarget: ProbeTargetAlertSettings;

  @ApiProperty({ type: SmokeCompleteAlertSettings })
  @Prop({ type: SmokeCompleteAlertSettingsSchema, default: () => ({}) })
  smokeComplete: SmokeCompleteAlertSettings;

  @ApiProperty({ type: TargetPresets })
  @Prop({ type: TargetPresetsSchema, default: () => ({}) })
  targetPresets: TargetPresets;

  @ApiProperty({ type: AppearanceSettings })
  @Prop({ type: AppearanceSettingsSchema, default: () => ({}) })
  appearance: AppearanceSettings;
}

export const ApplicationSettingsSchema =
  SchemaFactory.createForClass(ApplicationSettings);
