import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { ServePlanDto } from './serve-plan.dto';
import { SmokeStatus } from './smoke.schema';

/**
 * A write of a cook, plan included: the Serve Plan's two fields are inherited
 * rather than restated, so the rest rule ("whole minutes, never negative") is
 * one rule on both write paths.
 *
 * They are optional here like everything but the two required fields — the
 * writers that rebuild this payload to link a child document say nothing about
 * the plan rather than clearing it.
 */
export class SmokeDto extends ServePlanDto {
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
