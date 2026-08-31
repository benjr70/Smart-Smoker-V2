import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

import { DEFAULT_POINTS, MAX_POINTS, MIN_POINTS } from './temp-series';

/**
 * How large a chart the caller wants.
 *
 * A size outside the range is not refused, only brought inside it (see
 * `pointsAsked`): the caller asked for a chart, and the nearest chart this
 * endpoint draws is a better answer than an error.
 */
export class TempSeriesQueryDto {
  @ApiPropertyOptional({
    description: `How many points to thin the cook to; clamped to ${MIN_POINTS}–${MAX_POINTS}.`,
    default: DEFAULT_POINTS,
    minimum: MIN_POINTS,
    maximum: MAX_POINTS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  points?: number;
}

/** One point of a chart-ready cook, as the API answers it. */
export class TempSampleDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'When the readings behind this point were taken, or null for readings stored without a date.',
  })
  date: string | null;

  @ApiProperty({ type: Number, nullable: true })
  chamberTemp: number | null;

  @ApiProperty({ type: Number, nullable: true })
  probe1Temp: number | null;

  @ApiProperty({ type: Number, nullable: true })
  probe2Temp: number | null;

  @ApiProperty({ type: Number, nullable: true })
  probe3Temp: number | null;
}
