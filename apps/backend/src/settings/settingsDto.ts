import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class Notifications {
  @ApiProperty()
  @IsNumber()
  MinMeatTemp: number;
  @ApiProperty()
  @IsNumber()
  MaxMeatTemp: number;
  @ApiProperty()
  @IsNumber()
  MinChamberTemp: number;
  @ApiProperty()
  @IsNumber()
  MaxChamberTemp: number;
}

export class CreateSettingsDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  id: string;
  @ApiProperty()
  @IsString()
  dataExportEmail: string;
  @ApiProperty({ type: Notifications })
  @ValidateNested()
  @Type(() => Notifications)
  notifications: Notifications;
}
