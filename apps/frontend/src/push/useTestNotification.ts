/**
 * The "send me a test notification" flow, in one place.
 *
 * Ordering matters and is the whole point: the permission prompt must run first
 * because it needs the click that triggered this, the VAPID key is read from
 * the backend at subscribe time (never from a bundled constant), the resulting
 * subscription is registered before a send is requested, and every failure is
 * surfaced on the snackbar instead of being swallowed the way the old
 * subscribe-on-mount block swallowed it.
 */
import { useCallback, useState } from 'react';
import { PushNotConfiguredError, useApiClient, useApiSnackbar } from '../api';
import { usePushPort } from './PushPortProvider';

export const BLOCKED_MESSAGE =
  'Notifications are blocked. Allow notifications for this site in your browser settings.';
export const UNSUPPORTED_MESSAGE = 'This browser does not support push notifications.';
export const FAILED_MESSAGE = 'Could not send a test notification.';
/**
 * The server has no VAPID key pair: a misconfiguration no retry will fix, so it
 * is worth its own message rather than the generic failure above.
 */
export const NOT_CONFIGURED_MESSAGE =
  'Push notifications are not set up on the server. Check its VAPID key configuration.';
/**
 * The send was accepted but delivered to nobody. The backend only logs a push
 * service rejection (a mismatched VAPID private key, or a 5xx) and answers 200
 * with a zero count, so without this the user would see no notification, no
 * error, and no way to tell the two apart.
 */
export const NOT_DELIVERED_MESSAGE =
  'The test notification reached no browsers. Check the server push configuration.';

export interface UseTestNotificationResult {
  /** Runs the full permission → subscribe → register → send chain. */
  sendTest: () => Promise<void>;
  /** True while the chain is in flight, so callers can disable their control. */
  sending: boolean;
}

export const useTestNotification = (): UseTestNotificationResult => {
  const client = useApiClient();
  const port = usePushPort();
  const notify = useApiSnackbar();
  const [sending, setSending] = useState(false);

  const sendTest = useCallback(async () => {
    setSending(true);
    try {
      const permission = await port.requestPermission();
      if (permission === 'unsupported') {
        notify(UNSUPPORTED_MESSAGE);
        return;
      }
      if (permission !== 'granted') {
        notify(BLOCKED_MESSAGE);
        return;
      }
      const publicKey = await client.notifications.getPublicKey();
      const subscription = await port.subscribe(publicKey);
      await client.notifications.registerSubscription(subscription);
      // A 200 here does not mean anything arrived: the backend reports how many
      // browsers the push service actually accepted, and zero is a failure the
      // user has to see — it is the whole diagnostic value of this control.
      const { sent } = await client.notifications.sendTest();
      if (sent === 0) {
        notify(NOT_DELIVERED_MESSAGE);
      }
    } catch (error) {
      notify(error instanceof PushNotConfiguredError ? NOT_CONFIGURED_MESSAGE : FAILED_MESSAGE);
    } finally {
      setSending(false);
    }
  }, [client, notify, port]);

  return { sendTest, sending };
};
