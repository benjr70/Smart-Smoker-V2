import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * A single notification rule. Mirrors `NotificationSetting` in the schema, with
 * class-validator decorators so the global whitelist/forbidNonWhitelisted pipe
 * accepts it. `_id` and `lastNotificationSent` are optional because the client
 * re-sends rules it previously loaded (which carry those persisted fields).
 */
export class NotificationSettingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty()
  @IsBoolean()
  type: boolean;

  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty()
  @IsString()
  probe1: string;

  @ApiProperty()
  @IsString()
  op: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  probe2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  offset?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastNotificationSent?: string;
}

export class NotificationSettingsDto {
  @ApiProperty({ type: [NotificationSettingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationSettingDto)
  settings: NotificationSettingDto[];
}
