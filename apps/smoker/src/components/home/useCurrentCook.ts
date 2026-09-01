import { useEffect, useRef, useState } from 'react';
import { CurrentCookTimeline, getDefaultApiClient, TimelineResource } from '../../api';

/** Where the touchscreen reads the running cook — and everything on it — from. */
export type CurrentCookReadPort = Pick<TimelineResource, 'getCurrent'>;

/**
 * How often the running cook is re-read while a cook is on.
 *
 * The same minute the web card uses, and for the same reason: the cook is
 * derived from three collections on the backend on every read, and neither a
 * moment that is a couple of hours away nor a plan measured in quarter-hours
 * moves enough between one minute and the next for anybody standing at the
 * smoker to see it change.
 */
export const CURRENT_COOK_REFRESH_MS = 60_000;

/**
 * The cook that is running, as the backend last answered: its stamps, the
 * estimate of when it will be done, and the Serve Plan it is being judged
 * against.
 *
 * `null` until an answer has arrived, and while no cook is running — an idle
 * panel is not estimating anything, so it does not go on asking, and does not
 * go on showing the last cook's moment.
 *
 * "Running" is not the same as "smoking". The meat comes off before the cook is
 * finished with: the gesture that pulls it puts the smoker out *and* starts the
 * rest, and the rest is the one thing left worth showing on the glass. So the
 * cook is held — and re-read — while the backend still stamps a pull on it, and
 * let go the moment it stops: the answer either carries the stamp, or the cook
 * has been cleared away and there is nothing left to say about it.
 *
 * Everything on it is entirely the backend's: the estimate and the verdict are
 * recomputed from the readings, the settings and the user's own history on every
 * read, so this hook only decides *when* to ask. It asks when a cook starts and
 * every minute it goes on — the panel has no push channel for either, and the
 * readings that would move them arrive far too fast to re-derive anything on
 * each one.
 *
 * One read feeds every readout on the screen. A second poll for the plan would
 * be the same three collections derived twice a minute, and would let the ETA on
 * the bar and the verdict beside it come from two different moments of the same
 * cook.
 *
 * A read that fails leaves the last answer on the screen rather than an error.
 * The panel is the one screen with nowhere to go — no reload, no back button,
 * and a cook running — and a minute-old ETA beside a live clock is worth more
 * than a gap where it was.
 */
export const useCurrentCook = (
  smoking: boolean,
  source?: CurrentCookReadPort
): CurrentCookTimeline | null => {
  const [cook, setCook] = useState<CurrentCookTimeline | null>(null);

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
   * whose answer is on the screen.
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

  /**
   * Whether there is anything to keep asking about: a smoker that is on, or a
   * cook still on the screen after it has been put out — which is a rest, and
   * a rest is worth a minute's read of its own until the cook is cleared away.
   *
   * A flag rather than the cook itself, and one that does not move while a cook
   * is smoking, so a minute's answer about the same cook cannot tear the timer
   * down and start it again.
   */
  const asking = smoking || cook !== null;

  useEffect(() => {
    if (!asking) {
      // Nothing is cooking and nothing is resting: there is nothing to ask
      // about, and nothing the last cook's answer can still be true of.
      setCook(null);
      return undefined;
    }
    let reading = true;
    const read = (): void => {
      const readNumber = nextRead.current;
      nextRead.current += 1;
      void port
        .getCurrent()
        .then(current => {
          // The screen may have left the panel while this was being read: an
          // answer to a screen nobody is looking at is worth nothing.
          if (!reading || !onScreen.current) return;
          // A read overtaken by a newer one that is already on the bar is
          // history.
          if (readNumber < shownRead.current) return;
          shownRead.current = readNumber;
          // With the smoker on, whatever the backend says the cook is. With it
          // out, only a cook whose meat has been stamped off is still news —
          // its rest is still running. Anything else is a panel between cooks,
          // and it shows nothing rather than the last one's moment.
          setCook(current && (smoking || current.pullAt) ? current : null);
        })
        .catch(() => undefined);
    };
    // Asked straight away as well as on the minute, so that the moment the
    // smoker goes out — which is the moment the meat came off — the panel finds
    // out whether there is a rest to count rather than waiting a minute to ask.
    read();
    const refresh = setInterval(read, CURRENT_COOK_REFRESH_MS);
    return () => {
      reading = false;
      clearInterval(refresh);
    };
  }, [smoking, asking, port]);

  return cook;
};
