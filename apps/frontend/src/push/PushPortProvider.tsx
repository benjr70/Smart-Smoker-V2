/**
 * React injection seam for the push port.
 *
 * Components read the port through {@link usePushPort}, which defaults to the
 * browser-backed adapter — so production code needs no provider. Tests wrap the
 * tree in {@link PushPortProvider} to inject a fake port and never touch
 * `navigator`, `window.Notification` or `PushManager`. Mirrors
 * {@link ApiClientProvider}.
 */
import React, { createContext, useContext } from 'react';
import { PushPort } from './pushPort';
import { getDefaultPushPort } from './browserPushAdapter';

const PushPortContext = createContext<PushPort | null>(null);

export interface PushPortProviderProps {
  port: PushPort;
  children: React.ReactNode;
}

export const PushPortProvider = ({ port, children }: PushPortProviderProps): JSX.Element => (
  <PushPortContext.Provider value={port}>{children}</PushPortContext.Provider>
);

/** Returns the injected port, or the browser adapter when unprovided. */
export const usePushPort = (): PushPort => useContext(PushPortContext) ?? getDefaultPushPort();
