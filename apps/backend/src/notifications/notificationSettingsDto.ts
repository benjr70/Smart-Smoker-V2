import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, ValidateNested } from 'class-validator';

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
 * The notification settings document.
 *
 * Carries only what the user owns. The machine's own bookkeeping (armed flags,
 * excursion timing, fired markers) is a separate document, so a save from the
 * settings page can never be a partial write of something evaluation also
 * touches.
 */
export class NotificationSettingsDto {
  @ApiProperty({ type: ChamberAlertDto })
  @ValidateNested()
  @Type(() => ChamberAlertDto)
  chamber: ChamberAlertDto;
}
