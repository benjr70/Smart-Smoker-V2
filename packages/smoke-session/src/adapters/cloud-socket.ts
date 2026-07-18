import { io, Socket } from 'socket.io-client';
import { CloudSocketPort, Unsubscribe } from '../session/ports';
import { SmokeUpdate } from '../wire/types';

/**
 * The one of two files (with `./device-feed`) allowed to import
 * `socket.io-client`. Everything else in the package speaks to the cloud
 * websocket exclusively through {@link CloudSocketPort}, so the store and its
 * tests never touch a socket.
 */

/**
 * A live cloud socket, plus the two lifecycle members a host needs beyond the
 * port itself: the current {@link connected} flag and {@link close} to tear the
 * connection down.
 */
export interface CloudSocketAdapter extends CloudSocketPort {
  /** Whether the underlying socket is currently connected. */
  readonly connected: boolean;
  /** Disconnect and detach every listener; no callback fires afterwards. */
  close(): void;
}

/**
 * Open a socket.io connection to the backend gateway at `url` and expose it as a
 * {@link CloudSocketAdapter}. Inbound frames map to the port's `on*` handlers;
 * the four typed emits ride the wire as the gateway expects: an object for
 * `smokeUpdate`, the truthy `clear` signal, the raw JSON *string* for `events`,
 * and a bare `refresh` signal with no payload.
 */
export function createCloudSocketAdapter(url: string): CloudSocketAdapter {
  const socket: Socket = io(url);

  const subscribe = (event: string, handler: (...args: unknown[]) => void): Unsubscribe => {
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  };

  return {
    get connected(): boolean {
      return socket.connected;
    },
    onEvents(listener: (payload: string) => void): Unsubscribe {
      return subscribe('events', payload => listener(payload as string));
    },
    onSmokeUpdate(listener: (update: SmokeUpdate) => void): Unsubscribe {
      return subscribe('smokeUpdate', update => listener(update as SmokeUpdate));
    },
    onClear(listener: () => void): Unsubscribe {
      return subscribe('clear', () => listener());
    },
    onRefresh(listener: () => void): Unsubscribe {
      return subscribe('refresh', () => listener());
    },
    onConnectionChange(listener: (connected: boolean) => void): Unsubscribe {
      const onConnect = (): void => listener(true);
      const onDisconnect = (): void => listener(false);
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
      };
    },
    emitSmokeUpdate(update: SmokeUpdate): void {
      socket.emit('smokeUpdate', update);
    },
    emitClear(): void {
      socket.emit('clear', true);
    },
    emitEvents(payload: string): void {
      socket.emit('events', payload);
    },
    emitRefresh(): void {
      socket.emit('refresh');
    },
    close(): void {
      socket.close();
      socket.removeAllListeners();
    },
  };
}
