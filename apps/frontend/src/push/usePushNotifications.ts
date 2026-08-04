/**
 * This browser's whole relationship with push, in one hook.
 *
 * Permission and subscription are one state, not two, so they live together:
 * both entry points into push — switching on an alert, and asking for a test
 * notification — learn the same things about the browser, and what either one
 * learns has to reach the card's banners and controls. Splitting them was how a
 * grant revoked in browser settings could be discovered by the test button and
 * still leave the card claiming everything was fine.
 *
 * There is no "enable notifications" control in the product: switching on an
 * alert is the user gesture the permission prompt needs, so `enable` exists to
 * be called from a toggle (or, for a browser that arrives with the alert
 * already on, from the card's recovery banner).
 *
 * Everything browser-shaped is reached through the injected push port, so cards
 * using this hook are testable without stubbing `Notification`/`PushManager`.
 */
import { useCallback, useRef, useState } from 'react';
import { PushNotConfiguredError, useApiClient, useApiSnackbar } from '../api';
import {
  BLOCKED_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  NOT_DELIVERED_MESSAGE,
  SUBSCRIBE_FAILED_MESSAGE,
  TEST_FAILED_MESSAGE,
  UNSUPPORTED_MESSAGE,
} from './messages';
import { usePushPort } from './PushPortProvider';
import { PushPermission } from './pushPort';
import { registerForPush } from './registerForPush';

export interface PushNotifications {
  /** What the browser permits, as of the last time anything here asked it. */
  permission: PushPermission;
  /**
   * True while this browser is being enlisted — the prompt is open, or the
   * subscription is being taken out. Callers hold back controls that would
   * start a second chain against the same registration.
   */
  enabling: boolean;
  /**
   * Run from a user gesture when an alert is switched on. Prompts only from the
   * never-asked state — a browser that has already blocked us auto-denies a
   * second prompt, and a browser that has already granted needs none — and
   * subscribes at most once per session.
   */
  enable: () => Promise<void>;
  /** Runs the full permission → subscribe → register → send chain. */
  sendTest: () => Promise<void>;
  /** True while a test send is in flight, so callers can disable their control. */
  sending: boolean;
}

export const usePushNotifications = (): PushNotifications => {
  const client = useApiClient();
  const port = usePushPort();
  const notify = useApiSnackbar();
  // Read while rendering, so a browser that blocked us in a previous session is
  // known on the very first paint rather than after an effect has run.
  const [permission, setPermission] = useState<PushPermission>(() => port.getPermission());
  const [sending, setSending] = useState(false);
  const [enabling, setEnabling] = useState(false);
  // Refs, not state: these have to be true for the *next* call the moment this
  // one starts, and both entry points can be in flight at the same time.
  const pendingPrompt = useRef<Promise<PushPermission> | null>(null);
  const pendingRegistration = useRef<Promise<void> | null>(null);
  const enablesInFlight = useRef(0);

  /**
   * Where we stand with the browser right now, prompting only from the
   * never-asked state, and published so the card follows a grant that was
   * revoked in browser settings without a reload.
   */
  const refreshPermission = useCallback(async (): Promise<PushPermission> => {
    let current = port.getPermission();
    if (current === 'default') {
      // One prompt at a time: two alerts switched on together must not stack
      // two prompts, and the browser is not the thing that stops it happening.
      if (!pendingPrompt.current) {
        pendingPrompt.current = port.requestPermission().finally(() => {
          pendingPrompt.current = null;
        });
      }
      current = await pendingPrompt.current;
    }
    setPermission(current);
    return current;
  }, [port]);

  /**
   * One subscription per browser, however many callers want one. Both entry
   * points share the in-flight promise rather than starting a second
   * `pushManager.subscribe` against the same registration — overlapping
   * subscribes can make one of them reject, and each would register its own
   * copy with the backend. A failure clears the promise so the next attempt
   * genuinely retries instead of resolving against a browser never subscribed.
   */
  const ensureSubscribed = useCallback(async (): Promise<void> => {
    if (!pendingRegistration.current) {
      pendingRegistration.current = registerForPush(client, port).catch(error => {
        pendingRegistration.current = null;
        throw error;
      });
    }
    await pendingRegistration.current;
  }, [client, port]);

  const enable = useCallback(async () => {
    enablesInFlight.current += 1;
    setEnabling(true);
    try {
      if ((await refreshPermission()) !== 'granted') {
        return;
      }
      await ensureSubscribed();
    } catch (error) {
      notify(
        error instanceof PushNotConfiguredError ? NOT_CONFIGURED_MESSAGE : SUBSCRIBE_FAILED_MESSAGE
      );
    } finally {
      enablesInFlight.current -= 1;
      setEnabling(enablesInFlight.current > 0);
    }
  }, [ensureSubscribed, notify, refreshPermission]);

  const sendTest = useCallback(async () => {
    setSending(true);
    try {
      // The card only offers this control on a granted permission, but the
      // grant can be revoked in browser settings without a reload, so ask again
      // rather than failing later with a confusing subscribe error.
      const current = await refreshPermission();
      if (current === 'unsupported') {
        notify(UNSUPPORTED_MESSAGE);
        return;
      }
      if (current !== 'granted') {
        notify(BLOCKED_MESSAGE);
        return;
      }
      await ensureSubscribed();
      // A 200 here does not mean anything arrived: the backend reports how many
      // browsers the push service actually accepted, and zero is a failure the
      // user has to see — it is the whole diagnostic value of this control.
      const { sent } = await client.notifications.sendTest();
      if (sent === 0) {
        notify(NOT_DELIVERED_MESSAGE);
      }
    } catch (error) {
      notify(
        error instanceof PushNotConfiguredError ? NOT_CONFIGURED_MESSAGE : TEST_FAILED_MESSAGE
      );
    } finally {
      setSending(false);
    }
  }, [client, ensureSubscribed, notify, refreshPermission]);

  return { permission, enabling, enable, sendTest, sending };
};
