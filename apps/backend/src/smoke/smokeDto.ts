import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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

  /**
   * When the food is meant to hit the table. Optional like every other field
   * here but the two required ones: a cook is created without a plan, and the
   * writers that rebuild this payload to link a child document say nothing
   * about the plan rather than clearing it.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  serveAt?: Date;

  /**
   * How long the meat rests before it is carved, in minutes — the cook's one
   * canonical rest. Whole minutes and never negative: the pull-by time is serve
   * time less this, and a negative rest would put the pull after the serve.
   */
  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  restMinutes?: number;

  @ApiProperty({ enum: SmokeStatus })
  @IsEnum(SmokeStatus)
  status: SmokeStatus;
}
