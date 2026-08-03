import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { NotificationSettings, PushSubscriptionPayload } from '../../api/types';
import { PushPermission, PushPort, PushPortProvider } from '../../push';
import { NotificationsCard } from './notifications';

const chamberAlertOn: NotificationSettings = {
  chamber: { enabled: true, low: 225, high: 275 },
};

const browserSubscription: PushSubscriptionPayload = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/browser-endpoint',
  expirationTime: null,
  keys: { p256dh: 'browser-p256dh', auth: 'browser-auth' },
};

/**
 * A recording stand-in for the browser's push machinery. The card must drive
 * this port and never `navigator`/`Notification`/`PushManager` directly, so
 * these tests configure the browser's answers instead of stubbing globals.
 */
const createFakePushPort = (
  overrides: {
    permission?: PushPermission;
    subscribe?: (key: string) => Promise<PushSubscriptionPayload>;
  } = {}
) => {
  const calls: string[] = [];
  const port: PushPort & { calls: string[]; subscribedWith: string[] } = {
    calls,
    subscribedWith: [],
    requestPermission: async () => {
      calls.push('requestPermission');
      return overrides.permission ?? 'granted';
    },
    subscribe: async (key: string) => {
      calls.push('subscribe');
      port.subscribedWith.push(key);
      return overrides.subscribe ? overrides.subscribe(key) : browserSubscription;
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
          <NotificationsCard />
        </SnackbarProvider>
      </PushPortProvider>
    </ApiClientProvider>
  );
};

describe('NotificationsCard', () => {
  test('shows the chamber range the smoker is configured to hold', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });

    renderCard(backend);

    expect(await screen.findByDisplayValue('225')).toBeInTheDocument();
    expect(screen.getByDisplayValue('275')).toBeInTheDocument();
  });

  test('reveals the range only while the alert is switched on', async () => {
    const backend = createFakeBackend();

    renderCard(backend);

    // A smoker that has never configured anything starts with the alert off,
    // and an off alert shows no controls that would do nothing.
    const toggle = await screen.findByLabelText('Temperature Alert');
    expect(screen.queryByLabelText('Low')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(await screen.findByLabelText('Low')).toBeInTheDocument();
    expect(screen.getByLabelText('High')).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByLabelText('Low')).not.toBeInTheDocument());
  });

  test('states in plain language what the configuration will do, and what an off alert will not', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });

    renderCard(backend);

    const summary = await screen.findByTestId('settings-chamber-summary');
    await waitFor(() => expect(summary).toHaveTextContent(/225°F–275°F/));
    expect(summary).toHaveTextContent(/2 minutes/);
    expect(summary).toHaveTextContent(/one alert per excursion/i);

    fireEvent.click(screen.getByLabelText('Temperature Alert'));

    await waitFor(() => expect(summary).toHaveTextContent(/will not be told/i));
  });

  test('persists an edited range when the settings page is left', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });

    const { unmount } = renderCard(backend);

    fireEvent.change(await screen.findByLabelText('Low'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('High'), { target: { value: '300' } });

    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings).toMatchObject({
        chamber: { enabled: true, low: 200, high: 300 },
      })
    );
  });

  test('persists switching the alert on for a smoker that had none configured', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);

    fireEvent.click(await screen.findByLabelText('Temperature Alert'));
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings).toMatchObject({
        chamber: { enabled: true, low: 225, high: 275 },
      })
    );
  });

  test('the send-test control asks permission, subscribes with the backend key, registers it and sends', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: 'BRuntimeKey' } });
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await waitFor(() => expect(backend.store.notifications.testSends).toBe(1));
    // Permission must be asked before subscribing: the prompt needs the click.
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    // The key comes from the backend at subscribe time, not a bundled constant.
    expect(port.subscribedWith).toEqual(['BRuntimeKey']);
    expect(backend.store.notifications.subscriptions).toEqual([browserSubscription]);
  });

  test('a denied permission stops before subscribing and tells the user', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'denied' });

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
    expect(port.calls).toEqual(['requestPermission']);
    expect(backend.store.notifications.testSends).toBe(0);
  });

  test('tells the user when the browser cannot do push at all', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'unsupported' });

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/does not support push notifications/i)).toBeInTheDocument();
    expect(port.calls).toEqual(['requestPermission']);
  });

  test('surfaces a failure to subscribe rather than swallowing it', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({
      subscribe: async () => {
        throw new Error('registration blew up');
      },
    });

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/could not send a test notification/i)).toBeInTheDocument();
    expect(backend.store.notifications.testSends).toBe(0);
  });

  // A server with no VAPID key is an operator misconfiguration no retry fixes,
  // so it must not read as the same generic failure a dropped request does.
  test('surfaces a backend with no push key configured, distinctly from a generic failure', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: null } });
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/not set up on the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not send a test notification/i)).not.toBeInTheDocument();
    expect(port.calls).toEqual(['requestPermission']);
  });

  // The backend answers 200 with a delivered count even when the push service
  // rejected every send, so ignoring the count would make "nothing arrived"
  // look exactly like success — losing the signal this control exists to give.
  test('reports a test send that reached no browsers instead of looking successful', async () => {
    const backend = createFakeBackend({ notifications: { deliveryFails: true } });
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/reached no browsers/i)).toBeInTheDocument();
    // The whole chain still ran — the failure is in delivery, not in the flow.
    expect(backend.store.notifications.testSends).toBe(1);
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
  });

  test('says nothing when the test notification is delivered', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await waitFor(() => expect(backend.store.notifications.testSends).toBe(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('raises the snackbar when loading the notification settings fails', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load notification settings.')).toBeInTheDocument();
  });
});
