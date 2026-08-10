import { ApiProperty } from '@nestjs/swagger';

export class SmokeHistory {
  @ApiProperty()
  name: string;
  @ApiProperty()
  meatType: string;
  @ApiProperty()
  weight: string;
  @ApiProperty()
  weightUnit: string;
  @ApiProperty()
  woodType: string;
  @ApiProperty()
  date: string;
  @ApiProperty()
  smokeId: string;
  @ApiProperty()
  overAllRating: string;
  /**
   * How long the cook ran, in milliseconds, or `null` when nothing recorded
   * enough to say — a cook from before the stamps existed that also kept no
   * readings. The card renders that absence as an em-dash rather than as a
   * zero-length cook.
   */
  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;
}
