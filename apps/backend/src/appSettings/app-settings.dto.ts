import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TargetSource } from './app-settings.schema';
import { AppearanceMode, ColorScheme } from './appearance';

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
}
