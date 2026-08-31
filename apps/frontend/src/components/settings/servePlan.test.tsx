import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { PushPermission, PushPort, PushPortProvider } from '../../push';
import { ServePlanCard } from './servePlan';

/**
 * A recording stand-in for the browser's push machinery, as the notifications
 * card's tests use: the off-schedule alert is a push like any other, so
 * switching it on has to reach the same prompt rather than arming an alert
 * against a browser nobody enlisted.
 */
const createFakePushPort = (permission: PushPermission = 'granted') => {
  const calls: string[] = [];
  const port: PushPort & { calls: string[] } = {
    calls,
    getPermission: () => permission,
    requestPermission: async () => {
      calls.push('requestPermission');
      permission = permission === 'default' ? 'granted' : permission;
      return permission;
    },
    subscribe: async () => {
      calls.push('subscribe');
      return {
        endpoint: 'https://fcm.googleapis.com/fcm/send/browser-endpoint',
        expirationTime: null,
        keys: { p256dh: 'browser-p256dh', auth: 'browser-auth' },
      };
    },
  };
  return port;
};

const renderCard = (backend: FakeBackend, pushPort: PushPort = createFakePushPort()) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <PushPortProvider port={pushPort}>
        <SnackbarProvider>
          <ServePlanCard />
        </SnackbarProvider>
      </PushPortProvider>
    </ApiClientProvider>
  );
};

describe('ServePlanCard', () => {
  // The planner ships on, unlike every alert: an installation that has
  // configured nothing still draws the card on the cook screen, so a settings
  // page claiming it was off would contradict what the user can see.
  test('shows the shipped plan when nothing has been saved', async () => {
    renderCard(createFakeBackend());

    expect(await screen.findByLabelText('Serve Plan')).toBeChecked();
    expect(screen.getByLabelText('Off-schedule alert')).toBeChecked();
    expect(screen.getByTestId('settings-serve-plan-tolerance')).toHaveTextContent('30 min');
  });

  test('shows the plan the installation has stored', async () => {
    renderCard(
      createFakeBackend({
        appSettings: {
          settings: { servePlan: { enabled: true, driftAlert: false, driftMin: 60 } },
        },
      })
    );

    await waitFor(() => expect(screen.getByLabelText('Off-schedule alert')).not.toBeChecked());
    // The tolerance is what the silenced alert would have fired on, so it is
    // not shown while there is no alert to fire — but it is still what the
    // card holds, and switching the alert back on shows it again.
    expect(screen.queryByTestId('settings-serve-plan-tolerance')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Off-schedule alert'));

    expect(screen.getByTestId('settings-serve-plan-tolerance')).toHaveTextContent('60 min');
  });

  // Off means off: the alert and the tolerance are about a plan that is no
  // longer being made, so the page is not a set of controls that do nothing.
  test('hides the alert and the tolerance while the planner is switched off', async () => {
    renderCard(createFakeBackend());

    const planner = await screen.findByLabelText('Serve Plan');
    fireEvent.click(planner);

    await waitFor(() =>
      expect(screen.queryByLabelText('Off-schedule alert')).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId('settings-serve-plan-tolerance')).not.toBeInTheDocument();
  });

  // The tolerance says when the push arrives, so it is only worth asking about
  // while there is a push to arrive.
  test('hides the tolerance while the alert is switched off', async () => {
    renderCard(createFakeBackend());

    fireEvent.click(await screen.findByLabelText('Off-schedule alert'));

    await waitFor(() =>
      expect(screen.queryByTestId('settings-serve-plan-tolerance')).not.toBeInTheDocument()
    );
  });

  test('steps the tolerance by fifteen minutes at a tap', async () => {
    renderCard(createFakeBackend());

    const tolerance = await screen.findByTestId('settings-serve-plan-tolerance');
    fireEvent.click(screen.getByLabelText('More tolerance'));
    expect(tolerance).toHaveTextContent('45 min');

    fireEvent.click(screen.getByLabelText('Less tolerance'));
    fireEvent.click(screen.getByLabelText('Less tolerance'));
    expect(tolerance).toHaveTextContent('15 min');
  });

  // The backend refuses a tolerance outside the range, and this card saves on
  // the way out where a refusal is an edit nobody sees fail.
  test('will not step below the shortest tolerance or beyond the longest', async () => {
    renderCard(
      createFakeBackend({
        appSettings: {
          settings: { servePlan: { enabled: true, driftAlert: true, driftMin: 15 } },
        },
      })
    );

    const tolerance = await screen.findByText('15 min');
    fireEvent.click(screen.getByLabelText('Less tolerance'));
    expect(tolerance).toHaveTextContent('15 min');

    for (let step = 15; step < 180; step += 15) {
      fireEvent.click(screen.getByLabelText('More tolerance'));
    }
    expect(tolerance).toHaveTextContent('180 min');

    fireEvent.click(screen.getByLabelText('More tolerance'));
    expect(tolerance).toHaveTextContent('180 min');
  });

  // Settings are the one screen whose whole job is to still be there tomorrow —
  // and the card saves its own block, so the cards beside it keep theirs.
  test('stores an edited plan on leaving and shows it again on the way back in', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.click(await screen.findByLabelText('More tolerance'));
    fireEvent.click(screen.getByLabelText('Off-schedule alert'));
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.servePlan).toEqual({
        enabled: true,
        driftAlert: false,
        driftMin: 45,
      })
    );

    // A reload is a fresh mount against the same backend.
    renderCard(backend);

    await waitFor(() => expect(screen.getByLabelText('Off-schedule alert')).not.toBeChecked());
    fireEvent.click(screen.getByLabelText('Off-schedule alert'));
    expect(screen.getByTestId('settings-serve-plan-tolerance')).toHaveTextContent('45 min');
  });

  test('stores the planner being switched off', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.click(await screen.findByLabelText('Serve Plan'));
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.servePlan).toEqual({
        enabled: false,
        driftAlert: true,
        driftMin: 30,
      })
    );
  });

  test('says in plain language what the tolerance means', async () => {
    renderCard(createFakeBackend());

    const summary = await screen.findByTestId('settings-serve-plan-summary');
    expect(summary).toHaveTextContent(/30 min/);
    expect(summary).toHaveTextContent(/behind/i);
  });

  /**
   * Switching the alert on is the user gesture the permission prompt needs. A
   * browser that was never asked would leave the alert armed against a
   * subscription that does not exist, and the push would simply never arrive.
   */
  test('asks the browser for permission when the off-schedule alert is switched on', async () => {
    const port = createFakePushPort('default');
    renderCard(
      createFakeBackend({
        appSettings: {
          settings: { servePlan: { enabled: true, driftAlert: false, driftMin: 30 } },
        },
      }),
      port
    );

    await waitFor(() => expect(screen.getByLabelText('Off-schedule alert')).not.toBeChecked());
    fireEvent.click(screen.getByLabelText('Off-schedule alert'));

    await waitFor(() => expect(port.calls).toContain('requestPermission'));
  });

  // Switching it off is not a reason to prompt: nothing is being armed.
  test('does not prompt when the off-schedule alert is switched off', async () => {
    const port = createFakePushPort('default');
    renderCard(createFakeBackend(), port);

    fireEvent.click(await screen.findByLabelText('Off-schedule alert'));

    await waitFor(() =>
      expect(screen.queryByTestId('settings-serve-plan-tolerance')).not.toBeInTheDocument()
    );
    expect(port.calls).toEqual([]);
  });

  test('raises the snackbar when loading the plan fails', async () => {
    const backend = createFakeBackend();
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load the Serve Plan.')).toBeInTheDocument();
  });
});
