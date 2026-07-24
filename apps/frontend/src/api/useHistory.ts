/**
 * The history-list hook.
 *
 * Bundles the three things the history screen used to wire by hand: the smoke
 * history read (reversed to newest-first), a refresh, and the cascade-delete
 * remove operation. A failed read leaves the list empty and raises the app-root
 * failure snackbar instead of throwing into render (the old unguarded
 * `result.reverse()` crashed the screen on a failed fetch). A failed remove
 * likewise raises the snackbar and, because the client's cascade deletes the
 * parent last, the refreshed list still contains the smoke so the delete is
 * retryable.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';
import { SmokeHistory } from './types';

export interface UseHistoryResult {
  /** The history rows, newest-first. Empty while loading or after a failed read. */
  history: SmokeHistory[];
  /** Re-reads the history list from the backend. */
  refresh: () => Promise<void>;
  /** Cascade-deletes a smoke and refreshes the list. */
  remove: (smokeId: string) => Promise<void>;
}

export function useHistory(): UseHistoryResult {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [history, setHistory] = useState<SmokeHistory[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await client.history.list();
      // Reverse to newest-first; guarded so a failed read never reaches here
      // with a non-array and crashes on `.reverse()`.
      setHistory([...list].reverse());
    } catch {
      setHistory([]);
      notify('Could not load smoke history.');
    }
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

  return { history, refresh, remove };
}
