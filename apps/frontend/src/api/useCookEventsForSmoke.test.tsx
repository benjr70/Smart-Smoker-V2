import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { ApiClient, createApiClient } from './client';
import { FakeBackend, createFakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { useCookEventsForSmoke } from './useCookEventsForSmoke';

const stored = (): FakeBackend =>
  createFakeBackend({
    cookEvents: {
      current: [
        {
          _id: 'event-2',
          smokeId: 'smoke-7',
          stampKey: 'wrap',
          label: 'Wrapped',
          tone: 'p1',
          at: '2026-08-25T14:00:00.000Z',
          chamberTemp: 251,
        } as never,
        {
          _id: 'event-1',
          smokeId: 'smoke-7',
          stampKey: 'wood',
          label: 'Added Wood',
          tone: 'amber',
          at: '2026-08-25T12:00:00.000Z',
          chamberTemp: 243,
        } as never,
      ],
    },
  });

const renderForSmoke = (
  backend: FakeBackend,
  smokeId = 'smoke-7',
  bend: (client: ApiClient) => ApiClient = same => same
) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={bend(createApiClient(backend))}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(() => useCookEventsForSmoke(smokeId), { wrapper });
};

describe('the cook log of a stored smoke', () => {
  it('reads the log of the smoke it was asked about, oldest first', async () => {
    const backend = stored();
    const { result } = renderForSmoke(backend);

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events.map(event => event.label)).toEqual(['Added Wood', 'Wrapped']);
    expect(result.current.events[0].at).toEqual(new Date('2026-08-25T12:00:00.000Z'));
    expect(backend.requests.map(request => request.path)).toEqual(['cook-events/smoke/smoke-7']);
  });

  it('drops an entry the reader removed, without reading the log again', async () => {
    const backend = stored();
    const { result } = renderForSmoke(backend);
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    await act(async () => {
      expect(await result.current.remove('event-1')).toBe(true);
    });

    expect(result.current.events.map(event => event._id)).toEqual(['event-2']);
    expect(backend.requests.map(request => request.method)).toEqual(['get', 'delete']);
  });

  it('keeps the entry and says so when the backend refused to remove it', async () => {
    const backend = stored();
    const { result } = renderForSmoke(backend, 'smoke-7', client => ({
      ...client,
      cookEvents: {
        ...client.cookEvents,
        deleteById: () => Promise.reject(new Error('offline')),
      },
    }));
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    await act(async () => {
      expect(await result.current.remove('event-1')).toBe(false);
    });

    expect(result.current.events).toHaveLength(2);
  });

  it('shows an empty log for a cook whose log could not be read', async () => {
    const backend = stored();
    const { result } = renderForSmoke(backend, 'smoke-7', client => ({
      ...client,
      cookEvents: {
        ...client.cookEvents,
        listForSmoke: () => Promise.reject(new Error('offline')),
      },
    }));

    await waitFor(() => expect(result.current.events).toEqual([]));
  });

  it('asks about nothing until it has been told which cook', async () => {
    const backend = stored();
    const { result } = renderForSmoke(backend, '');

    await waitFor(() => expect(result.current.events).toEqual([]));
    expect(backend.requests).toEqual([]);
  });
});
