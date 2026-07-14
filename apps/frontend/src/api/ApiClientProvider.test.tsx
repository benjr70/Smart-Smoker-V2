import React from 'react';
import { renderHook } from '@testing-library/react';
import { ApiClientProvider, useApiClient } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend } from './fakeBackend';

describe('useApiClient', () => {
  test('returns the production default client when no provider is present', () => {
    const { result } = renderHook(() => useApiClient());
    expect(result.current.temps).toBeDefined();
    expect(typeof result.current.temps.getCurrent).toBe('function');
  });

  test('returns the injected client when wrapped in a provider', () => {
    const injected = createApiClient(createFakeBackend());
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={injected}>{children}</ApiClientProvider>
    );

    const { result } = renderHook(() => useApiClient(), { wrapper });

    expect(result.current).toBe(injected);
  });
});
