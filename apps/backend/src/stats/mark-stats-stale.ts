import { Logger } from '@nestjs/common';
import { StatsService } from './stats.service';

const logger = new Logger('StatsStaleness');

/**
 * Say that a write has changed something the statistics are made of.
 *
 * Every collection a cook is spread across feeds the numbers on the Stats
 * screen — the meat and its weight, the wood, the rest time, the scores — and
 * an edit to any of them can leave those numbers wrong while the archive still
 * holds exactly as many completed cooks as the stored aggregate was told. The
 * count guard cannot see such an edit, so the writer has to say so.
 *
 * The flag, never a recompute: these are the writes that arrive in bursts (a
 * rating's sliders auto-save as they are dragged, a pre-smoke form saves as it
 * is filled in), and one rebuild at the next Stats read serves all of them.
 *
 * Failing to mark never fails the write. The document is already saved by the
 * time this runs, so throwing would answer a request that succeeded with a 500
 * and invite a retry that writes it twice; a missed flag costs stale numbers
 * until the next thing marks or the count moves, which is the lesser wrong.
 */
export const markStatsStale = async (
  stats: StatsService,
  what: string,
): Promise<void> => {
  try {
    await stats.markDirty();
  } catch (error) {
    logger.warn(
      `Statistics were not marked stale after a ${what} write; they may be served stale until the next change. ${error}`,
    );
  }
};
