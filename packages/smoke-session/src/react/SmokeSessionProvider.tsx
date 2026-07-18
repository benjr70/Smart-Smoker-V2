import React, { useEffect, useRef } from 'react';
import { createSessionStore, SessionConfig, SessionStore } from '../session';
import { SmokeSessionContext } from './context';

export interface SmokeSessionProviderProps {
  /**
   * The composition-root configuration (role + ports). Read once at first
   * render; later prop changes do not rebuild the store, so the socket lifetime
   * follows the Provider instance rather than any config identity.
   */
  config: SessionConfig;
  children: React.ReactNode;
}

/**
 * The session's composition-root binding: constructs the store exactly once
 * from `config`, {@link SessionStore.start | starts} it when the Provider
 * mounts, and {@link SessionStore.stop | stops} it when the Provider unmounts.
 *
 * This is the documented behavior change versus the legacy per-component
 * sockets: the websocket (and every other port subscription) lives and dies
 * with this Provider, so remounting a leaf component no longer churns a socket.
 */
export const SmokeSessionProvider = ({
  config,
  children,
}: SmokeSessionProviderProps): JSX.Element => {
  // Lazy-init through a ref so the store is created once for the Provider's
  // whole lifetime, never rebuilt on re-render.
  const storeRef = useRef<SessionStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createSessionStore(config);
  }
  const store = storeRef.current;

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return <SmokeSessionContext.Provider value={store}>{children}</SmokeSessionContext.Provider>;
};
