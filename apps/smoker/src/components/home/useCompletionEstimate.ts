import { useEffect, useRef, useState } from 'react';
import { CookCompletionEstimate, TimelineResource, getDefaultApiClient } from '../../api';

/** Where the touchscreen reads the running cook, and its estimate, from. */
export type CurrentCookReadPort = Pick<TimelineResource, 'getCurrent'>;

/**
 * How often the running cook is re-read while a cook is on.
 *
 * The same minute the web card uses, and for the same reason: the estimate is
 * derived from three collections on the backend on every read, and a moment
 * that is a couple of hours away does not move enough between one minute and
 * the next for anybody standing at the smoker to see it change.
 */
export const ESTIMATE_REFRESH_MS = 60_000;

/**
 * When the cook that is running will be done, as the backend last answered.
 *
 * `null` until an answer has arrived, and while no cook is running — an idle
 * panel is not estimating anything, so it does not ask, and does not go on
 * showing the last cook's moment.
 *
 * The estimate itself is entirely the backend's: it is recomputed from the
 * readings, the settings and the user's own history on every read, so this hook
 * only decides *when* to ask. It asks when a cook starts and every minute it
 * goes on — the panel has no push channel for the estimate, and the readings
 * that would move it arrive far too fast to re-derive it on each one.
 *
 * A read that fails leaves the last answer on the screen rather than an error.
 * The panel is the one screen with nowhere to go — no reload, no back button,
 * and a cook running — and a minute-old ETA beside a live clock is worth more
 * than a gap where it was.
 */
export const useCompletionEstimate = (
  smoking: boolean,
  source?: CurrentCookReadPort
): CookCompletionEstimate | null => {
  const [estimate, setEstimate] = useState<CookCompletionEstimate | null>(null);

  // The appliance's own backend unless the screen was handed a source. The
  // client behind it is built once, on first use, and hands back the same
  // resource every time — so this is a stable value to hang the reads off.
  const port = source ?? getDefaultApiClient().timeline;

  /**
   * Whether the screen is still on the panel. A read is a request to a box that
   * may be a house away, and the answer to one is worth nothing once the screen
   * that asked has gone — or once the cook it was about has been put out.
   */
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
    };
  }, []);

  /**
   * Which read is which: the number the next one is given, and the newest one
   * whose answer is on the bar.
   *
   * The panel asks again every minute whether or not the last answer has
   * arrived, so a read held up by a slow link can land behind a newer one. It
   * is not cancelled by that newer one — an answer is worth having whichever
   * read fetched it, and dropping the older one outright would leave the bar
   * bare whenever the newer read fails, which is the one thing this hook
   * promises not to do. Newer simply beats older: a late answer is news about a
   * cook the screen has already been told more recent news of, and drawing it
   * would take a time off the bar for a whole minute.
   */
  const nextRead = useRef(0);
  const shownRead = useRef(-1);

  useEffect(() => {
    if (!smoking) {
      // Nothing is being cooked to anything, so there is nothing to ask about
      // and nothing the last cook's answer can still be true of.
      setEstimate(null);
      return undefined;
    }
    let reading = true;
    const read = (): void => {
      const readNumber = nextRead.current;
      nextRead.current += 1;
      void port
        .getCurrent()
        .then(current => {
          // The cook may have been put out, or the screen left the panel, while
          // this was being read: neither leaves an answer worth showing.
          if (!reading || !onScreen.current) return;
          // A read overtaken by a newer one that is already on the bar is
          // history.
          if (readNumber < shownRead.current) return;
          shownRead.current = readNumber;
          setEstimate(current?.estimate ?? null);
        })
        .catch(() => undefined);
    };
    read();
    const refresh = setInterval(read, ESTIMATE_REFRESH_MS);
    return () => {
      reading = false;
      clearInterval(refresh);
    };
  }, [smoking, port]);

  return estimate;
};
