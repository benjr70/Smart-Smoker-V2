import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TargetSource } from './app-settings.schema';
import { AppearanceMode, ColorScheme } from './appearance';
import { MAX_STAMP_LABEL, STAMP_TONES, StampTone } from './stamp-catalogue';

/**
 * The chamber Temperature Alert as the settings page sends it: on or off, and
 * the range the chamber is expected to hold.
 */
export class ChamberAlertDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsNumber()
  low: number;

  @ApiProperty()
  @IsNumber()
  high: number;
}

/**
 * One probe's row as the settings page saves it.
 *
 * Deliberately no `name`: the name shown against the row is resolved from the
 * active cook's smoke profile and served on the read, so it is not the user's to
 * set — and the strict validation edge rejects a document that tries.
 */
export class ProbeTargetEntryDto {
  @ApiProperty()
  @IsString()
  slot: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsNumber()
  target: number;

  /**
   * Where that target came from. Optional: a client older than preset seeding
   * sends a row without it, which reads back as the shipped default — the same
   * thing an untouched row means.
   */
  @ApiProperty({ enum: ['default', 'preset', 'user'], required: false })
  @IsOptional()
  @IsIn(['default', 'preset', 'user'])
  targetSource?: TargetSource;

  /**
   * How many minutes before this probe reaches its target the cook wants to be
   * warned, or `null` for not at all.
   *
   * Optional, and `null` is how the row is cleared rather than a field left
   * out: a client that saves the whole row has to be able to say "no heads-up
   * on this probe", which an absent field cannot distinguish from an older
   * client that has never heard of the setting.
   *
   * Whole minutes, at least one and at most two hours: a lead of zero is the
   * alert the Probe Target Reached alert already sends, and one longer than the
   * projection is worth would fire in the first hour of a brisket.
   */
  @ApiProperty({ minimum: 1, maximum: 120, required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  leadMinutes?: number | null;
}

/**
 * The default target temperature per meat category, as the settings page's
 * Default target temps card saves it.
 */
export class TargetPresetsDto {
  @ApiProperty()
  @IsNumber()
  beef: number;

  @ApiProperty()
  @IsNumber()
  pork: number;

  @ApiProperty()
  @IsNumber()
  poultry: number;
}

/** The Probe Target Reached alert as the settings page sends it. */
export class ProbeTargetAlertDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: [ProbeTargetEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbeTargetEntryDto)
  probes: ProbeTargetEntryDto[];
}

/**
 * The Smoke Complete alert as the settings page sends it.
 *
 * Only a switch: the cook it describes is the probe watch list above, so there
 * is nothing else for the page to send and nothing here that could contradict
 * it.
 */
export class SmokeCompleteAlertDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

/**
 * The heads-up alert as the settings page sends it: a switch and nothing else.
 *
 * How long before each probe's target the cook wants warning is on the probe
 * row above, because it is per probe — a second copy of it here could only
 * disagree with the row the user is looking at.
 */
export class HeadsUpAlertDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

/**
 * The installation's appearance as a client sends it: the mode that was chosen,
 * and what that choice resolved to on the client writing it.
 *
 * That the two agree is checked in the service rather than here — it is a
 * relationship between the fields, not a fact about either one, and the same
 * rule has to hold for a block merged onto a stored document as for one that
 * arrived whole.
 */
export class AppearanceDto {
  @ApiProperty({ enum: ['light', 'dark', 'system'] })
  @IsIn(['light', 'dark', 'system'])
  mode: AppearanceMode;

  @ApiProperty({ enum: ['light', 'dark'] })
  @IsIn(['light', 'dark'])
  resolvedMode: ColorScheme;
}

/**
 * The auto-stop idle threshold as the settings screen sends it: how many hours
 * of silence mean the cook is over.
 *
 * A minimum of one hour rather than none: a threshold of zero (or below) would
 * make every cook stale the moment a reading was a second late, so the app
 * would stop live cooks and backdate their finish. The floor is refused here
 * rather than clamped, so a client that sends nonsense is told rather than
 * silently given a different setting from the one on its screen.
 */
export class AutoStopDto {
  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  idleHours: number;
}

/**
 * One stamp of the cook log, as the stamp editor sends it.
 *
 * Every field is required: the editor saves the whole list, so a stamp arriving
 * without its colour or its enabled flag is a client bug rather than a partial
 * edit, and storing it would leave a button nobody can account for. The rules
 * that are about the *list* — unique keys, the six defaults present, at most
 * twelve — are checked in the service, because they are facts about the
 * catalogue rather than about any one entry.
 */
export class StampEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ minLength: 1, maxLength: MAX_STAMP_LABEL })
  @IsString()
  @Length(1, MAX_STAMP_LABEL)
  label: string;

  @ApiProperty({ enum: STAMP_TONES })
  @IsIn(STAMP_TONES as unknown as string[])
  tone: StampTone;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsBoolean()
  custom: boolean;
}

/** The cook log's stamps, as the settings page's editor saves them. */
export class CookLogDto {
  @ApiProperty({ type: [StampEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StampEntryDto)
  stamps: StampEntryDto[];
}

/**
 * The application settings document.
 *
 * Carries only what the user owns. The machine's own bookkeeping (armed flags,
 * excursion timing, fired markers) is a separate document, so a save from the
 * settings page can never be a partial write of something evaluation also
 * touches.
 *
 * Every block is optional because the document has several independent writers:
 * the settings page saves the alerts, its Default target temps card saves the
 * presets, and a browser that repaints itself saves the appearance. Each sends
 * its own block and the service leaves the others alone.
 */
export class ApplicationSettingsDto {
  @ApiProperty({ type: ChamberAlertDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChamberAlertDto)
  chamber?: ChamberAlertDto;

  @ApiProperty({ type: ProbeTargetAlertDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProbeTargetAlertDto)
  probeTarget?: ProbeTargetAlertDto;

  @ApiProperty({ type: SmokeCompleteAlertDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmokeCompleteAlertDto)
  smokeComplete?: SmokeCompleteAlertDto;

  @ApiProperty({ type: HeadsUpAlertDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeadsUpAlertDto)
  headsUp?: HeadsUpAlertDto;

  @ApiProperty({ type: TargetPresetsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetPresetsDto)
  targetPresets?: TargetPresetsDto;

  @ApiProperty({ type: AppearanceDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppearanceDto)
  appearance?: AppearanceDto;

  @ApiProperty({ type: AutoStopDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AutoStopDto)
  autoStop?: AutoStopDto;

  @ApiProperty({ type: CookLogDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CookLogDto)
  cookLog?: CookLogDto;
}
