/**
 * The history-list hook.
 *
 * Bundles the three things the history screen used to wire by hand: the smoke
 * history read (reversed to newest-first), a refresh, and the cascade-delete
 * remove operation. A failed read leaves the list empty and raises the app-root
 * failure snackbar instead of throwing into render (the old unguarded
 * `result.reverse()` crashed the screen on a failed fetch). A failed remove
 * likewise raises the snackbar and, because the delete is a single request the
 * backend either carries out or does not, the refreshed list still contains the
 * smoke so the delete is retryable.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { SmokeHistory } from './types';

/**
 * How the last read of the history went.
 *
 * Reported separately from the list because an empty list is not an answer on
 * its own: a history nobody has cooked into, one that has not been read yet,
 * and one whose read failed are all `[]`, and the screen says something
 * different — and something wrong, if it guesses — for each.
 */
export type HistoryStatus = 'loading' | 'loaded' | 'failed';

export interface UseHistoryResult {
  /** The history rows, newest-first. Empty while loading or after a failed read. */
  history: SmokeHistory[];
  /** Whether the list has been read yet, and whether reading it worked. */
  status: HistoryStatus;
  /** Re-reads the history list from the backend. */
  refresh: () => Promise<void>;
  /** Deletes a smoke — and everything recorded about it — then refreshes. */
  remove: (smokeId: string) => Promise<void>;
}

export function useHistory(): UseHistoryResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [history, setHistory] = useState<SmokeHistory[]>([]);
  const [status, setStatus] = useState<HistoryStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const list = await client.history.list();
      // Reverse to newest-first; guarded so a failed read never reaches here
      // with a non-array and crashes on `.reverse()`.
      setHistory([...list].reverse());
      setStatus('loaded');
    } catch {
      setHistory([]);
      setStatus('failed');
      notify('Could not load smoke history.');
    }
    // A re-read does not go back to `loading`: the list on screen stays the
    // answer to "what have I cooked" until a new one arrives, and blanking it
    // mid-refresh would flash an empty history at a user who has one.
  }, [client, notify]);

  const remove = useCallback(
    async (smokeId: string) => {
      try {
        await client.smoke.deleteCascade(smokeId);
      } catch {
        notify('Could not delete smoke.');
      }
      await refresh();
    },
    [client, notify, refresh]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, status, refresh, remove };
}
