import { io, Socket } from 'socket.io-client';
import { DeviceFeedPort, Unsubscribe } from '../session/ports';

/**
 * The second of two files (with `./cloud-socket`) allowed to import
 * `socket.io-client`. The smoker role consumes the device serial feed only
 * through {@link DeviceFeedPort}; the store and its tests never touch a socket.
 */

/**
 * A live device feed, plus the two lifecycle members a host needs beyond the
 * port: the current {@link connected} flag and {@link close}.
 */
export interface DeviceFeedAdapter extends DeviceFeedPort {
  /** Whether the underlying socket is currently connected. */
  readonly connected: boolean;
  /** Disconnect and detach every listener; no callback fires afterwards. */
  close(): void;
}

/**
 * Open a socket.io connection to device-service at `url` and expose it as a
 * {@link DeviceFeedAdapter}. Each `temp` frame is delivered to `onReading` as
 * the raw serial JSON string, byte-for-byte off the wire.
 */
export function createDeviceFeedAdapter(url: string): DeviceFeedAdapter {
  const socket: Socket = io(url);

  return {
    get connected(): boolean {
      return socket.connected;
    },
    onReading(listener: (raw: string) => void): Unsubscribe {
      const handler = (raw: unknown): void => listener(raw as string);
      socket.on('temp', handler);
      return () => {
        socket.off('temp', handler);
      };
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
    close(): void {
      socket.close();
      socket.removeAllListeners();
    },
  };
}
