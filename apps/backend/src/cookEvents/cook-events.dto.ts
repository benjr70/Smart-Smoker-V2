import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * A tap: which stamp was pressed and — for a stamp that was spoken rather than
 * tapped — when it was done.
 *
 * Deliberately the whole body. A tap sends the key alone, and its moment is the
 * server's clock. A stamp logged by voice is filled some minutes after it was
 * spoken of, so it may say when: a moment the service accepts only inside a
 * narrow window (see `CookEventsService.record`). The temperatures are never
 * the caller's — they are read from the stored series for whichever moment the
 * entry carries — and under the global whitelist pipe, a client that tried to
 * say more is refused rather than quietly ignored.
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

  @ApiPropertyOptional({
    description:
      'When it was done, for a stamp logged after the fact (a spoken one). ' +
      'Omitted, the entry is stamped by the server clock. Refused when it is ' +
      'in the future, more than 30 minutes past, or before the cook started.',
    example: '2026-08-25T12:00:00.000Z',
    type: Date,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  at?: Date;
}
