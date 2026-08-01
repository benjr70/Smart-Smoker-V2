import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class Weight {
  @ApiProperty()
  @IsString()
  unit: string;
  /**
   * Absent until the cook has actually weighed the meat. The wizard saves
   * whenever the user leaves the step, which is routinely before that — so
   * requiring a number here rejected every partially-filled pre-smoke and
   * surfaced as "Could not save pre-smoke details." A supplied weight is still
   * held to being a number; only its absence is allowed.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  weight?: number;
}

export class PreSmokeDto {
  @ApiProperty()
  @IsString()
  name: string;
  @ApiProperty()
  @IsString()
  meatType: string;
  @ApiProperty({ type: Weight })
  @ValidateNested()
  @Type(() => Weight)
  weight: Weight;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  steps: string[];
  @ApiProperty()
  @IsString()
  notes: string;
}
