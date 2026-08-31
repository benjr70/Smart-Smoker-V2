import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber } from 'class-validator';

import {
  DEFAULT_POINTS,
  MAX_POINTS,
  MIN_POINTS,
  pointsAsked,
} from './temp-series';

/**
 * How large a chart the caller wants.
 *
 * A size outside the range is not refused, only brought inside it, and a size
 * that is not a number at all falls back to the default: the caller asked for a
 * chart, and the nearest chart this endpoint draws is a better answer than an
 * error.
 *
 * The bringing-inside happens here, on the way in, rather than being left to
 * the service — so the value this class carries is always a size the endpoint
 * will actually serve, and the range and default published in the OpenAPI
 * schema describe what a caller gets rather than what it is refused for.
 */
export class TempSeriesQueryDto {
  @ApiPropertyOptional({
    description:
      `How many points to thin the cook to. A size outside ${MIN_POINTS}–${MAX_POINTS} is served at the nearest size in range, ` +
      `and a size that cannot be read as a number is served at ${DEFAULT_POINTS}, rather than either being refused.`,
    default: DEFAULT_POINTS,
    minimum: MIN_POINTS,
    maximum: MAX_POINTS,
  })
  // `?points=` with nothing after it is a caller who named the parameter
  // without choosing a size, which is the same as not naming it; `Number('')`
  // would otherwise read it as a request for zero points.
  @Transform(({ value }) =>
    pointsAsked(
      value === '' || value === undefined ? undefined : Number(value),
    ),
  )
  // Whatever the caller sent, the transform above has already made a servable
  // size of it, so this can never fail. It is here because a query class with
  // no constraints at all is a class `ValidationPipe` does not recognise, and
  // an unrecognised class is rejected wholesale — the one way this endpoint
  // could still answer a chart request with an error.
  @IsNumber()
  points?: number = DEFAULT_POINTS;
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
