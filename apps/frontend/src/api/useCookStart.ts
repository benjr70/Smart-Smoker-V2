/**
 * When the cook that is set up right now started.
 *
 * The one input the elapsed clock needs, read from the server rather than
 * remembered in the browser: the stamp is a fact about the cook, so a phone
 * that reloads, or is picked up six hours in, shows the cook's real age instead
 * of starting again from zero.
 *
 * It re-reads whenever smoking is switched, because switching it on is what
 * writes the stamp in the first place — the read that follows the toggle is the
 * one that finds it.
 */
import { useEffect, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';

export function useCookStart(smoking: boolean): Date | null {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [startedAt, setStartedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    client.timeline
      .getCurrent()
      .then(timeline => {
        if (active) {
          setStartedAt(timeline?.startedAt ?? null);
        }
      })
      .catch(() => {
        notify('Could not load the cook timer.');
      });
    return () => {
      active = false;
    };
    // notify is a stable context callback; re-read only when the session's
    // smoking state changes (or the client itself is replaced).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoking, client]);

  return startedAt;
}
