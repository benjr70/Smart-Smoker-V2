import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class KeysDto {
  @ApiProperty()
  @IsString()
  p256dh: string;

  @ApiProperty()
  @IsString()
  auth: string;
}

export class NotificationSubscriptionDto {
  @ApiProperty()
  @IsString()
  endpoint: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  expirationTime: number | null;

  @ApiProperty({ type: KeysDto })
  @ValidateNested()
  @Type(() => KeysDto)
  keys: KeysDto;
}
