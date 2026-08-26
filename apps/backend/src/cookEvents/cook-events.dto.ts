import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * A tap: which stamp was pressed, and nothing else.
 *
 * Deliberately the whole body. The moment is the server's clock and the
 * temperatures are read from the stored series (see `CookEventsService`), so a
 * client has nothing else to say — and under the global whitelist pipe, a
 * client that tried to say more is refused rather than quietly ignored.
 */
export class RecordCookEventDto {
  @ApiProperty({
    description:
      'The stamp pressed, by its catalogue key (e.g. `wood`, `wrap`).',
    example: 'wood',
  })
  @IsString()
  @IsNotEmpty()
  stampKey: string;
}
