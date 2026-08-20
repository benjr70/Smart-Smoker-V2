import { ApiProperty } from '@nestjs/swagger';

/**
 * One of the four personal records — the cook that holds it, and the number it
 * holds it with.
 *
 * The value is deliberately raw (milliseconds, pounds, °F, a 0–10 score) rather
 * than a formatted string: what a record reads as is the screen's business, and
 * two clients write the same number differently.
 */
export class StatRecordDto {
  /** The smoke that holds the record, so a screen can link to it. */
  @ApiProperty()
  smokeId: string;

  /**
   * What to call it: the cook's name, or — for the many cooks nobody named —
   * its meat and the day it was cooked.
   */
  @ApiProperty()
  label: string;

  /** The day it was cooked, ISO, or `null` for a cook with no date recorded. */
  @ApiProperty({ nullable: true, type: String })
  date: string | null;

  /** The record itself, in the unit of whichever record this is. */
  @ApiProperty()
  value: number;
}

/** How much of one meat has been cooked, and how often. */
export class MeatStatDto {
  /** The most frequent spelling of the meat's name. */
  @ApiProperty()
  meatType: string;

  @ApiProperty()
  sessions: number;

  /** Pounds cooked, normalized from however each cook was weighed. */
  @ApiProperty()
  pounds: number;
}

/** How often one wood has been burned. */
export class WoodStatDto {
  /** The most frequent spelling of the wood's name. */
  @ApiProperty()
  woodType: string;

  @ApiProperty()
  sessions: number;
}

/** The four cooks worth bragging about. */
export class StatsRecordsDto {
  @ApiProperty({ nullable: true, type: StatRecordDto })
  highestRated: StatRecordDto | null;

  @ApiProperty({ nullable: true, type: StatRecordDto })
  longestCook: StatRecordDto | null;

  @ApiProperty({ nullable: true, type: StatRecordDto })
  heaviestCut: StatRecordDto | null;

  /**
   * The hottest the chamber ever ran. `null` until the peak is stamped onto
   * finished cooks — no cook recorded one before that, and a record nobody
   * holds is not a record.
   */
  @ApiProperty({ nullable: true, type: StatRecordDto })
  hottestChamber: StatRecordDto | null;
}

/** The average score in each of the four rating categories. */
export class CategoryAveragesDto {
  @ApiProperty({ nullable: true, type: Number })
  smokeFlavor: number | null;

  @ApiProperty({ nullable: true, type: Number })
  seasoning: number | null;

  @ApiProperty({ nullable: true, type: Number })
  tenderness: number | null;

  @ApiProperty({ nullable: true, type: Number })
  overallTaste: number | null;
}

/**
 * Everything the Stats screen shows, already derived.
 *
 * Every aggregate is nullable and every one of them is `null` for an archive
 * with nothing completed in it: a user who has never finished a cook has not
 * cooked for zero hours, they have no average at all, and a screen handed zeros
 * would say so in numbers. `totalSessions` is the one figure that is always a
 * number, and it is what tells the screen which of the two it is looking at.
 */
export class StatsDto {
  /** How many completed cooks these figures were derived from. */
  @ApiProperty()
  totalSessions: number;

  /** Time on the smoker across every cook whose length is known, ms. */
  @ApiProperty({ nullable: true, type: Number })
  totalCookMs: number | null;

  /** Meat cooked across every session, pounds. */
  @ApiProperty({ nullable: true, type: Number })
  totalPounds: number | null;

  /** Roughly how many people that fed. */
  @ApiProperty({ nullable: true, type: Number })
  approximateServings: number | null;

  /** Mean overall-taste score across the cooks that were rated, 0–10. */
  @ApiProperty({ nullable: true, type: Number })
  averageRating: number | null;

  /** Mean length of the cooks whose length is known, ms. */
  @ApiProperty({ nullable: true, type: Number })
  averageCookMs: number | null;

  /** Rest after the smoker, summed across every cook, ms. */
  @ApiProperty({ nullable: true, type: Number })
  totalRestMs: number | null;

  /** How many distinct woods have been burned. */
  @ApiProperty()
  woodTypeCount: number;

  /** How many distinct meats have been cooked. */
  @ApiProperty()
  meatTypeCount: number;

  @ApiProperty({ type: StatsRecordsDto })
  records: StatsRecordsDto;

  /** Per-meat totals, most-cooked first. */
  @ApiProperty({ type: [MeatStatDto] })
  byMeat: MeatStatDto[];

  /** Per-wood totals, most-burned first. */
  @ApiProperty({ type: [WoodStatDto] })
  byWood: WoodStatDto[];

  @ApiProperty({ type: CategoryAveragesDto })
  categoryAverages: CategoryAveragesDto;
}
