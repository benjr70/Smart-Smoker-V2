/**
 * The subscribe-and-register chain, in one place.
 *
 * Both entry points into push — switching on your first alert, and asking for a
 * test notification — need the same three steps in the same order, and the
 * order is the part that is easy to get wrong: the VAPID key is read from the
 * backend at subscribe time (never from a bundled constant, which is how this
 * feature was broken for its entire life), the browser subscribes against that
 * key, and only then is the resulting subscription handed to the backend to
 * store. Rejects rather than swallowing, so callers can say what went wrong.
 */
import { ApiClient } from '../api';
import { PushPort } from './pushPort';

export const registerForPush = async (client: ApiClient, port: PushPort): Promise<void> => {
  const publicKey = await client.notifications.getPublicKey();
  const subscription = await port.subscribe(publicKey);
  await client.notifications.registerSubscription(subscription);
};
