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
  /**
   * Everything written about the cook — the pre-smoke, smoke, post-smoke and
   * review notes — in that order, with the stages nobody wrote anything for
   * left out.
   *
   * Carried on the list row because the history search reads notes: a user
   * looking for "the one I spritzed with apple juice" remembers the words, not
   * which screen they typed them on. Flattened to a bare list because the
   * search treats every note alike, and the list never shows them.
   */
  @ApiProperty({ type: [String] })
  notes: string[];
}
