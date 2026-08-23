/**
 * Socket-backed event port — the production implementation of {@link
 * SmokeEventPort}.
 *
 * The panel's third and last socket, alongside the session's feed and the
 * appearance subscription: a connection opened to say one thing — that the cook
 * the state pointed at is gone — and nothing else. It is opened at emit time,
 * so an appliance that never recovers a session never opens it, and the cloud
 * URL is read then too, the way the rest of this app reads it.
 *
 * This and the appearance subscription are the only modules in the smoker app
 * allowed to import `socket.io-client`; the API client itself stays
 * transport-pure and reaches the wire only through this port.
 */
import { io } from 'socket.io-client';
import { SmokeEventPort } from './events';

export const createSocketEventPort = (): SmokeEventPort => ({
  emitClear: () => {
    const socket = io(process.env.REACT_APP_CLOUD_URL ?? '');
    socket.emit('clear', true);
  },
});
