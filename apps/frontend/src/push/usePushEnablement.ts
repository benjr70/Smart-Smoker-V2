/**
 * The permission half of the push relationship with this browser.
 *
 * There is no "enable notifications" control in the product: switching on an
 * alert is the user gesture, so this hook exists to be called from a toggle.
 * It owns the two things a settings card needs and nothing else — what the
 * browser currently permits (so the card can explain a blocked state and gate
 * the test control), and a single `enable()` that does the least possible:
 * prompt only when the browser has never been asked, subscribe only once.
 *
 * Everything browser-shaped is reached through the injected push port, so cards
 * using this hook are testable without stubbing `Notification`/`PushManager`.
 */
import { useCallback, useRef, useState } from 'react';
import { PushNotConfiguredError, useApiClient, useApiSnackbar } from '../api';
import { NOT_CONFIGURED_MESSAGE, SUBSCRIBE_FAILED_MESSAGE } from './messages';
import { usePushPort } from './PushPortProvider';
import { PushPermission } from './pushPort';
import { registerForPush } from './registerForPush';

export interface PushEnablement {
  /** What the browser permits right now, as far as this session has learned. */
  permission: PushPermission;
  /**
   * Run from a user gesture when an alert is switched on. Prompts only from the
   * never-asked state — a browser that has already blocked us auto-denies a
   * second prompt, and a browser that has already granted needs none — and
   * subscribes at most once per session.
   */
  enable: () => Promise<void>;
}

export const usePushEnablement = (): PushEnablement => {
  const client = useApiClient();
  const port = usePushPort();
  const notify = useApiSnackbar();
  // Read while rendering, so a browser that blocked us in a previous session is
  // known on the very first paint rather than after an effect has run.
  const [permission, setPermission] = useState<PushPermission>(() => port.getPermission());
  // A ref, not state: it must be true for the *next* call the moment this one
  // starts, or two toggles flipped in quick succession would both subscribe.
  const subscribed = useRef(false);

  const enable = useCallback(async () => {
    let current = port.getPermission();
    if (current === 'default') {
      current = await port.requestPermission();
    }
    // Always re-published, not just after a prompt: a user who unblocks the site
    // in browser settings and comes back to the toggle recovers here, without
    // having to work out that a reload was required.
    setPermission(current);
    if (current !== 'granted' || subscribed.current) {
      return;
    }
    subscribed.current = true;
    try {
      await registerForPush(client, port);
    } catch (error) {
      // Let the next toggle try again: a failure here leaves this browser
      // unsubscribed, so pretending otherwise would strand it silently.
      subscribed.current = false;
      notify(
        error instanceof PushNotConfiguredError ? NOT_CONFIGURED_MESSAGE : SUBSCRIBE_FAILED_MESSAGE
      );
    }
  }, [client, notify, port]);

  return { permission, enable };
};
