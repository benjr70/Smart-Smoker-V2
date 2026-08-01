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
import { useApiClient, useApiSnackbar } from '../api';
import { usePushPort } from './PushPortProvider';

export const BLOCKED_MESSAGE =
  'Notifications are blocked. Allow notifications for this site in your browser settings.';
export const UNSUPPORTED_MESSAGE = 'This browser does not support push notifications.';
export const FAILED_MESSAGE = 'Could not send a test notification.';

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
      await client.notifications.sendTest();
    } catch {
      notify(FAILED_MESSAGE);
    } finally {
      setSending(false);
    }
  }, [client, notify, port]);

  return { sendTest, sending };
};
