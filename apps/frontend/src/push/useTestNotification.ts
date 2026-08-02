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
import {
  BLOCKED_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  NOT_DELIVERED_MESSAGE,
  TEST_FAILED_MESSAGE,
  UNSUPPORTED_MESSAGE,
} from './messages';
import { usePushPort } from './PushPortProvider';
import { registerForPush } from './registerForPush';

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
      // The card only offers this control once permission is granted, but the
      // grant can be revoked in browser settings without a reload, so confirm
      // it here rather than failing later with a confusing subscribe error.
      const permission = await port.requestPermission();
      if (permission === 'unsupported') {
        notify(UNSUPPORTED_MESSAGE);
        return;
      }
      if (permission !== 'granted') {
        notify(BLOCKED_MESSAGE);
        return;
      }
      await registerForPush(client, port);
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
  }, [client, notify, port]);

  return { sendTest, sending };
};
