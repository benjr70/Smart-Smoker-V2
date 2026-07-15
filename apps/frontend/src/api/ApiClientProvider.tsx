/**
 * React injection seam for the API client.
 *
 * Components read the client through {@link useApiClient}, which defaults to the
 * production instance — so production code needs no provider. Tests wrap the
 * tree in {@link ApiClientProvider} to inject a fake-backend-backed client.
 */
import React, { createContext, useContext } from 'react';
import { ApiClient, getDefaultApiClient } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

export interface ApiClientProviderProps {
  client: ApiClient;
  children: React.ReactNode;
}

export const ApiClientProvider = ({ client, children }: ApiClientProviderProps): JSX.Element => (
  <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
);

/** Returns the injected client, or the production default when unprovided. */
export const useApiClient = (): ApiClient => useContext(ApiClientContext) ?? getDefaultApiClient();
