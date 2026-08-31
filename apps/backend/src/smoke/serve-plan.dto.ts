import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Min } from 'class-validator';
import { ServePlan } from './serve-plan';

/**
 * A write of the Serve Plan: when the food is meant to hit the table, and how
 * long the meat rests before it is carved.
 *
 * The one declaration of what a plan write may say — {@link SmokeDto} extends
 * it, so the plan reaching a cook through the whole-smoke update path and the
 * plan reaching it through the planner card are validated by the same rules
 * rather than by two copies free to drift apart.
 *
 * Both halves are optional and written independently, because that is how the
 * card writes them: a tap on "Serving at" moves dinner and says nothing about
 * the rest, and a tap on "Rest for" says nothing about dinner. A payload that
 * carried both every time would have the two steppers overwriting each other
 * whenever a second device had just moved the other one.
 */
export class ServePlanDto implements ServePlan {
  /**
   * `null` clears the serve time, and with it the plan: a pitmaster who
   * abandons the plan mid-cook sends one, and the timeline stops answering a
   * `servePlan` block. Omitted entirely leaves whatever is stored alone.
   */
  @ApiProperty({
    required: false,
    type: Date,
    nullable: true,
    description:
      'When the food is meant to hit the table; null clears the plan.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  serveAt?: Date | null;

  /**
   * Whole minutes and never negative: the pull-by time is the serve time less
   * this, and a negative rest would put the pull after the serve. `null` clears
   * the rest, which pulls at the serve time.
   */
  @ApiProperty({
    required: false,
    minimum: 0,
    nullable: true,
    description: 'How long the meat rests before it is carved, in minutes.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  restMinutes?: number | null;
}
