/**
 * Socket-backed event port — the production implementation of {@link SmokeEventPort}.
 *
 * This is the ONLY frontend API module allowed to import `socket.io-client`.
 * Isolating the socket here keeps the REST client transport-pure and removes
 * the last stray socket-creation site that used to live in the legacy smoker
 * service. It preserves that service's exact behavior: a fresh connection to
 * `WS_URL` (empty string when unset) on which a `clear` event carrying `true`
 * is emitted, read at emit time so the environment is honored per call.
 */
import { io } from 'socket.io-client';
import { SmokeEventPort } from './events';

export const createSocketEventPort = (): SmokeEventPort => ({
  emitClear: () => {
    const url = process.env.WS_URL ?? '';
    const socket = io(url);
    socket.emit('clear', true);
  },
});
