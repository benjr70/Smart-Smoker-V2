import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Min } from 'class-validator';

/**
 * A write of the Serve Plan against the cook in progress: when the food is
 * meant to hit the table, and how long the meat rests before it is carved.
 *
 * Both halves are optional and written independently, because that is how the
 * card writes them: a tap on "Serving at" moves dinner and says nothing about
 * the rest, and a tap on "Rest for" says nothing about dinner. A payload that
 * carried both every time would have the two steppers overwriting each other
 * whenever a second device had just moved the other one.
 */
export class ServePlanDto {
  @ApiProperty({
    required: false,
    type: Date,
    description: 'When the food is meant to hit the table.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  serveAt?: Date;

  /**
   * Whole minutes and never negative, for the reason the smoke's own field is:
   * the pull-by time is the serve time less this, and a negative rest would put
   * the pull after the serve.
   */
  @ApiProperty({
    required: false,
    minimum: 0,
    description: 'How long the meat rests before it is carved, in minutes.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  restMinutes?: number;
}
