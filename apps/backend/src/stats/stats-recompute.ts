/**
 * How a transition that changes what the archive holds makes the stored
 * statistics right again, without knowing what computes them.
 *
 * A port rather than `StatsService` because the dependency runs both ways: the
 * statistics derive how long every cook ran through the timeline, the timeline
 * asks which cook is active, and finishing the Active Cook is what makes the
 * statistics stale. Injecting the class would make that loop a constructor
 * chain Nest cannot build — and the Active Cook is depended on by everything,
 * so it is the edge that has to be a token. See {@link StatsRecomputeModule}
 * for the real implementation, and the recording fake in the Active Cook spec
 * for the other one.
 */
export const STATS_RECOMPUTE = 'STATS_RECOMPUTE';

export interface StatsRecomputePort {
  /**
   * Recompute the statistics of the whole archive, now.
   *
   * Now rather than marked-stale, because the pitmaster who finishes a cook
   * looks at their stats next and the numbers have to be right the moment the
   * screen opens.
   */
  recompute(): Promise<void>;
}
