import { STATS_RECOMPUTE, StatsRecomputePort } from '../stats-recompute';

/**
 * The stats-recompute port as a test gives it: recording, so a spec can hold a
 * finish to recounting the archive exactly once, and so a spec about anything
 * else never recounts it at all.
 *
 * The second implementation behind {@link StatsRecomputePort} — the reason the
 * port exists. Without it, a spec of the Active Cook would have to stand the
 * whole statistics module up behind the transition it is testing.
 *
 * Test-only — excluded from coverage collection.
 */
export interface FakeStatsRecompute extends StatsRecomputePort {
  recompute: jest.Mock<Promise<void>, []>;
}

/** A recording port, answering as a recompute that succeeded. */
export const fakeStatsRecompute = (): FakeStatsRecompute => ({
  recompute: jest.fn(async () => undefined),
});

/** The port as the provider a spec registers it under. */
export const statsRecomputeProvider = (
  port: StatsRecomputePort = fakeStatsRecompute(),
) => ({ provide: STATS_RECOMPUTE, useValue: port });
