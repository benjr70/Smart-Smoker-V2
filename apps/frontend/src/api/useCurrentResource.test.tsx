import '@testing-library/jest-dom';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider } from './ApiClientProvider';
import { createApiClient } from './client';
import { createFakeBackend, FakeBackend } from './fakeBackend';
import { SnackbarProvider } from './SnackbarProvider';
import { WeightUnits } from '../components/common/interfaces/enums';
import { PreSmoke } from './types';
import { useCurrentResource } from './useCurrentResource';

const preSmokeDefaults: PreSmoke = {
  name: '',
  meatType: '',
  weight: { unit: WeightUnits.LB },
  steps: [''],
  notes: '',
};

const renderPreSmokeHook = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApiClientProvider client={client}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </ApiClientProvider>
  );
  return renderHook(
    () =>
      useCurrentResource<PreSmoke>({
        initialValue: preSmokeDefaults,
        load: c => c.preSmoke.getCurrent(),
        save: (c, value) => c.preSmoke.saveCurrent(value),
        loadErrorMessage: 'Could not load pre-smoke.',
        saveErrorMessage: 'Could not save pre-smoke.',
      }),
    { wrapper }
  );
};

describe('useCurrentResource', () => {
  test('populates state from the backend on mount and saves the latest value on unmount', async () => {
    const backend = createFakeBackend({
      preSmoke: {
        current: {
          name: 'Seeded Brisket',
          meatType: 'Brisket',
          weight: { unit: WeightUnits.LB, weight: 12 },
          steps: ['Trim'],
          notes: 'Seeded notes',
        },
      },
    });

    const { result, unmount } = renderPreSmokeHook(backend);

    await waitFor(() => expect(result.current[0].name).toBe('Seeded Brisket'));

    act(() => {
      result.current[1](prev => ({ ...prev, name: 'Edited Brisket' }));
    });

    unmount();

    await waitFor(() => expect(backend.store.preSmoke.current?.name).toBe('Edited Brisket'));
  });

  test('keeps the initial defaults and raises the snackbar when the load fails', async () => {
    const backend = createFakeBackend({
      preSmoke: {
        current: {
          name: 'Never Loaded',
          meatType: 'Brisket',
          weight: { unit: WeightUnits.LB, weight: 12 },
          steps: ['Trim'],
          notes: '',
        },
      },
    });
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });

    const { result } = renderPreSmokeHook(backend);

    expect(await screen.findByText('Could not load pre-smoke.')).toBeInTheDocument();
    expect(result.current[0]).toEqual(preSmokeDefaults);
  });

  test('keeps defaults and raises no snackbar when the load resolves null (fresh smoke)', async () => {
    // Production backend returns 200 null for an empty current document (see
    // presmoke.service GetByCurrent). The hook must treat that as "nothing yet":
    // keep the initial defaults and stay silent — no spurious error snackbar on
    // every fresh smoke. The fake backend can only 404 an empty current, so the
    // null-resolve branch is exercised with a direct null-returning load.
    const backend = createFakeBackend();
    const client = createApiClient(backend);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={client}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </ApiClientProvider>
    );

    const load = jest.fn().mockResolvedValue(null);
    const save = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () =>
        useCurrentResource<PreSmoke>({
          initialValue: preSmokeDefaults,
          load,
          save: (_c, value) => save(value),
          loadErrorMessage: 'Could not load pre-smoke.',
          saveErrorMessage: 'Could not save pre-smoke.',
        }),
      { wrapper }
    );

    // Wait for the null-resolving load to run and its `.then` to settle, so the
    // null-guard's false branch (no setState, no snackbar) is genuinely taken.
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current[0]).toEqual(preSmokeDefaults);
    expect(screen.queryByText('Could not load pre-smoke.')).not.toBeInTheDocument();
  });

  test('keeps defaults when the load resolves an empty string (empty-body 200)', async () => {
    // A NestJS handler returning `null` serializes as an empty body that axios
    // surfaces as `''`. If that ever reaches the hook it must NOT become state:
    // an empty string is not a resource, and setting it would blank the form and
    // crash the component on `state.weight.weight`. The hook keeps the defaults.
    const backend = createFakeBackend();
    const client = createApiClient(backend);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={client}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </ApiClientProvider>
    );

    const load = jest.fn().mockResolvedValue('' as unknown as PreSmoke);
    const { result } = renderHook(
      () =>
        useCurrentResource<PreSmoke>({
          initialValue: preSmokeDefaults,
          load,
          save: jest.fn().mockResolvedValue(undefined),
          loadErrorMessage: 'Could not load pre-smoke.',
          saveErrorMessage: 'Could not save pre-smoke.',
        }),
      { wrapper }
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current[0]).toEqual(preSmokeDefaults);
    expect(screen.queryByText('Could not load pre-smoke.')).not.toBeInTheDocument();
  });

  test('raises the snackbar and does not throw when the unmount save fails', async () => {
    const backend = createFakeBackend({
      preSmoke: {
        current: {
          name: 'Seeded Brisket',
          meatType: 'Brisket',
          weight: { unit: WeightUnits.LB, weight: 12 },
          steps: ['Trim'],
          notes: '',
        },
      },
    });
    backend.injectFault({ method: 'post', path: 'presmoke', status: 500 });
    const client = createApiClient(backend);

    const Consumer = () => {
      const [preSmoke] = useCurrentResource<PreSmoke>({
        initialValue: preSmokeDefaults,
        load: c => c.preSmoke.getCurrent(),
        save: (c, value) => c.preSmoke.saveCurrent(value),
        loadErrorMessage: 'Could not load pre-smoke.',
        saveErrorMessage: 'Could not save pre-smoke.',
      });
      return <div data-testid="consumer">{preSmoke.name}</div>;
    };

    // The provider must outlive the consumer, so the teardown-time snackbar has
    // somewhere to render — the consumer is toggled off while the root stays up.
    const Harness = ({ show }: { show: boolean }) => (
      <ApiClientProvider client={client}>
        <SnackbarProvider>{show ? <Consumer /> : null}</SnackbarProvider>
      </ApiClientProvider>
    );

    const { rerender } = render(<Harness show={true} />);
    await screen.findByText('Seeded Brisket');

    expect(() => rerender(<Harness show={false} />)).not.toThrow();

    expect(await screen.findByText('Could not save pre-smoke.')).toBeInTheDocument();
  });

  test('falls back to a generic load message when none is supplied', async () => {
    const backend = createFakeBackend({ preSmoke: { current: undefined } });
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });
    const client = createApiClient(backend);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={client}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </ApiClientProvider>
    );

    renderHook(
      () =>
        useCurrentResource<PreSmoke>({
          initialValue: preSmokeDefaults,
          load: c => c.preSmoke.getCurrent(),
          save: (c, value) => c.preSmoke.saveCurrent(value),
        }),
      { wrapper }
    );

    expect(await screen.findByText('Failed to load.')).toBeInTheDocument();
  });

  test('the snackbar notifier is a no-op outside a provider', async () => {
    // Without a SnackbarProvider a load failure must not throw — the notifier
    // degrades to a no-op rather than crashing the tree.
    const backend = createFakeBackend({ preSmoke: { current: undefined } });
    backend.injectFault({ method: 'get', path: 'presmoke/', status: 500 });
    const client = createApiClient(backend);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiClientProvider client={client}>{children}</ApiClientProvider>
    );

    const { result } = renderHook(
      () =>
        useCurrentResource<PreSmoke>({
          initialValue: preSmokeDefaults,
          load: c => c.preSmoke.getCurrent(),
          save: (c, value) => c.preSmoke.saveCurrent(value),
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current[0]).toEqual(preSmokeDefaults));
  });
});
