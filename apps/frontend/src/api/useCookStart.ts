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
 * one that finds it — and on a slow refresh besides, because the cook does not
 * only change from this screen. The touchscreen presses Finish, or another
 * client clears the session, and neither moves this screen's smoking flag:
 * without the refresh the bar would go on counting a cook that is over. The web
 * client has no push channel for the session, so re-asking is the only way it
 * learns; once a minute is far cheaper than the once-a-second render the clock
 * already does, and the cost is two small reads.
 */
import { useEffect, useRef, useState } from 'react';
import { useApiClient } from './ApiClientProvider';
import { useApiSnackbar } from './SnackbarProvider';

/** How often the recorded start is re-read while the screen is open. */
export const COOK_START_REFRESH_MS = 60_000;

export function useCookStart(smoking: boolean): Date | null {
  const client = useApiClient();
  const notify = useApiSnackbar();
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  // Whether the failure on screen has already been reported. A backend that
  // stays down is re-read on every refresh, and one snackbar a minute about the
  // same outage is noise; the next successful read re-arms the message.
  const reported = useRef(false);

  useEffect(() => {
    let active = true;
    const read = (): void => {
      client.timeline
        .getCurrent()
        .then(timeline => {
          if (!active) {
            return;
          }
          reported.current = false;
          setStartedAt(timeline?.startedAt ?? null);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          // A stamp we can no longer confirm is not one to keep counting: the
          // read may have failed precisely because the cook it belonged to is
          // gone. The clock stops rather than running on, and the next
          // successful read starts it again.
          setStartedAt(null);
          if (!reported.current) {
            reported.current = true;
            notify('Could not load the cook timer.');
          }
        });
    };
    read();
    const refresh = setInterval(read, COOK_START_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(refresh);
    };
    // notify is a stable context callback; re-read on the session's smoking
    // state (or a replaced client), and on the refresh above for everything
    // that happens away from this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoking, client]);

  return startedAt;
}
