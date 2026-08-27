import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { AppearanceMode, ColorScheme } from './appearance';
import { STAMP_TONES, StampTone, defaultStamps } from './stamp-catalogue';

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

  /**
   * Where that target came from — see {@link TargetSource}.
   *
   * Deliberately without a schema default, unlike every other field here. A
   * default is applied while hydrating a stored document too, so one here would
   * put `'default'` on the rows of an installation that saved its targets
   * before provenance was recorded — asserting the app chose temperatures the
   * user typed, and handing seeding permission to overwrite them. Absent, those
   * rows read as what they are: unknown, to be inferred from the target itself
   * (see `inheritedProvenance`). Every write names the provenance explicitly,
   * so no row this application stores is left needing that inference twice.
   */
  @ApiProperty({ enum: ['default', 'preset', 'user'] })
  @Prop({ type: String })
  targetSource: TargetSource;

  /**
   * How many minutes before this probe reaches its target the cook wants to be
   * warned; `null` (or absent) for not at all.
   *
   * On the watch list rather than in a list of its own, because it is about the
   * same probe reaching the same target the row above already describes.
   *
   * Deliberately without a schema default, like the provenance beside it: a
   * default applied while hydrating would put a number of minutes onto rows of
   * an installation that never asked for a heads-up, and switching the alert on
   * would then warn about every probe on the smoker.
   */
  @ApiProperty({ required: false, nullable: true })
  @Prop({ type: Number })
  leadMinutes?: number | null;
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
 * The heads-up alert: on or off, and nothing else.
 *
 * The one global switch for "tell me before the meat is done". How long before,
 * and for which probes, is the per-probe `leadMinutes` above — this block only
 * decides whether any of it is heard, which is what a cook reaches for when
 * they want the smoker to stop talking to them.
 */
@Schema({ _id: false })
export class HeadsUpAlertSettings {
  @ApiProperty()
  @Prop({ default: false })
  enabled: boolean;
}

export const HeadsUpAlertSettingsSchema =
  SchemaFactory.createForClass(HeadsUpAlertSettings);
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

  /**
   * Defaulted dark, like {@link DEFAULT_APPLICATION_SETTINGS}: a document
   * written before any browser resolved anything still reaches the touchscreen,
   * which renders this half verbatim, and light there is a sheet of white in an
   * unlit garage. No browser is affected, because none of them read it.
   */
  @ApiProperty({ enum: ['light', 'dark'] })
  @Prop({ default: 'dark' })
  resolvedMode: ColorScheme;
}

export const AppearanceSettingsSchema =
  SchemaFactory.createForClass(AppearanceSettings);

/**
 * How long a cook still marked as smoking may go without a reading before it is
 * taken to be over, in hours.
 *
 * Six: the abandoned cooks found in production had been silent for 17 hours at
 * the shortest, and no real cook's internal gap (a lid open, a probe re-seated,
 * a short outage) comes near it.
 *
 * It lives here, beside the field it defaults, so that Mongoose's default and
 * the defaults layer's fallback are the same number by construction — the
 * auto-stop decision and the legacy backfill both read this setting, and
 * neither may carry a second opinion about what "unset" means. Re-exported from
 * `app-settings.defaults` for callers that read defaults from there; it cannot
 * be declared there, because that module imports this one.
 */
export const DEFAULT_AUTO_STOP_IDLE_HOURS = 6;

/**
 * When a cook that nobody ended is taken to be over: the readings have stopped
 * for this many hours.
 *
 * A block of its own rather than a bare field on the document, because the
 * document is saved block by block by several independent writers — a field
 * outside a block could only be saved by a writer that carried the whole
 * document, which is what block-wise saving exists to avoid.
 */
@Schema({ _id: false })
export class AutoStopSettings {
  /**
   * Hours of silence after which a cook still marked as smoking is stopped and
   * its finish backdated to its last reading. Defaulted from the one shipped
   * threshold above, so a change to it reaches newly written documents rather
   * than being contradicted here.
   */
  @ApiProperty()
  @Prop({ default: DEFAULT_AUTO_STOP_IDLE_HOURS })
  idleHours: number;
}

export const AutoStopSettingsSchema =
  SchemaFactory.createForClass(AutoStopSettings);

/**
 * One stamp of the cook log, as the settings document stores it.
 *
 * The shape is the `stamp-catalogue` module's {@link CookStamp}, restated as a
 * Mongoose sub-schema because that module is pure and knows nothing about
 * persistence — the contract lives there, and this is only how it is written
 * down. Sub-documents rather than a free-form array so a stored entry cannot
 * arrive at a client missing the fields every button is drawn from.
 */
@Schema({ _id: false })
export class StampEntry {
  /** The stamp's stable identity. Events are keyed by it, never by label. */
  @ApiProperty()
  @Prop({ required: true })
  key: string;

  @ApiProperty()
  @Prop({ required: true })
  label: string;

  /**
   * `type: String` spelled out because the field's TypeScript type is a union
   * of the six tone names: the metadata a union emits is `Object`, which
   * Mongoose refuses to infer a schema type from.
   */
  @ApiProperty({ enum: STAMP_TONES })
  @Prop({ type: String, required: true })
  tone: StampTone;

  /** A disabled stamp is not offered, and keeps every event ever logged on it. */
  @ApiProperty()
  @Prop({ default: true })
  enabled: boolean;

  /** Whether the user added it: a default may be disabled but never removed. */
  @ApiProperty()
  @Prop({ default: false })
  custom: boolean;
}

export const StampEntrySchema = SchemaFactory.createForClass(StampEntry);

/**
 * The cook log's own settings: the stamps a cook may be logged with.
 *
 * A block rather than a bare array on the document, like every other block
 * here, because the document has several independent writers and only a whole
 * block can be saved without disturbing what another one holds.
 */
@Schema({ _id: false })
export class CookLogSettings {
  @ApiProperty({ type: [StampEntry] })
  @Prop({ type: [StampEntrySchema], default: () => defaultStamps() })
  stamps: StampEntry[];
}

export const CookLogSettingsSchema =
  SchemaFactory.createForClass(CookLogSettings);

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

  @ApiProperty({ type: HeadsUpAlertSettings })
  @Prop({ type: HeadsUpAlertSettingsSchema, default: () => ({}) })
  headsUp: HeadsUpAlertSettings;

  @ApiProperty({ type: TargetPresets })
  @Prop({ type: TargetPresetsSchema, default: () => ({}) })
  targetPresets: TargetPresets;

  @ApiProperty({ type: AppearanceSettings })
  @Prop({ type: AppearanceSettingsSchema, default: () => ({}) })
  appearance: AppearanceSettings;

  @ApiProperty({ type: AutoStopSettings })
  @Prop({ type: AutoStopSettingsSchema, default: () => ({}) })
  autoStop: AutoStopSettings;

  @ApiProperty({ type: CookLogSettings })
  @Prop({ type: CookLogSettingsSchema, default: () => ({}) })
  cookLog: CookLogSettings;
}

export const ApplicationSettingsSchema =
  SchemaFactory.createForClass(ApplicationSettings);
