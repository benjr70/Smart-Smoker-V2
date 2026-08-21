/**
 * The archive-statistics hook.
 *
 * One read, and the two things a screen has to know about it: what the archive
 * says, and whether it has been read at all. Nothing is derived here — the
 * numbers arrive finished from the backend, which is the whole point of the
 * stats endpoint.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { Stats } from './types';

/**
 * How the last read of the statistics went.
 *
 * Reported separately from the figures because their absence is not an answer
 * on its own: an archive nobody has cooked into and one whose read failed both
 * have no numbers to show, and the screen says something different — and
 * something wrong, if it guesses — for each.
 */
export type StatsStatus = 'loading' | 'loaded' | 'failed';

export interface UseStatsResult {
  /** The archive statistics, or `null` while loading and after a failed read. */
  stats: Stats | null;
  status: StatsStatus;
  /** Re-reads the statistics from the backend. */
  refresh: () => Promise<void>;
}

export function useStats(): UseStatsResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<StatsStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      setStats(await client.stats.get());
      setStatus('loaded');
    } catch {
      // Cleared rather than left stale: figures that no longer came back are
      // not the current state of the archive, and a screen showing them beside
      // a failure notice would be claiming both at once.
      setStats(null);
      setStatus('failed');
      notify('Could not load your stats.');
    }
  }, [client, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, status, refresh };
}
