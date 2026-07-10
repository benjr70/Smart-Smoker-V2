import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { SmokeStatus } from './smoke.schema';

export class SmokeDto {
  @ApiProperty()
  @IsString()
  preSmokeId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tempsId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  postSmokeId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  smokeProfileId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  ratingId?: string;

  @ApiProperty()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiProperty({ enum: SmokeStatus })
  @IsEnum(SmokeStatus)
  status: SmokeStatus;
}
