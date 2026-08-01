import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { NotificationSettings, PushSubscriptionPayload } from '../../api/types';
import { PushPermission, PushPort, PushPortProvider } from '../../push';
import { NotificationsCard } from './notifications';

const seededRule: NotificationSettings = {
  type: false,
  message: 'Chamber too hot',
  probe1: 'Chamber',
  op: '>',
  probe2: 'Probe 1',
  temperature: 250,
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
  test('loads the seeded notification rules from the injected client on mount', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    renderCard(backend);

    expect(await screen.findByDisplayValue('Chamber too hot')).toBeInTheDocument();
    expect(screen.getByText('New Rule')).toBeInTheDocument();
  });

  test('adds a new rule and persists the latest rules to the backend on unmount', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    const { unmount } = renderCard(backend);
    await screen.findByDisplayValue('Chamber too hot');

    fireEvent.click(screen.getByText('New Rule'));

    unmount();

    await waitFor(() => expect(backend.store.notifications.settings).toHaveLength(2));
    expect(backend.store.notifications.settings[0].message).toBe('Chamber too hot');
  });

  test('edits a rule message and persists the edited rules on unmount', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    const { unmount } = renderCard(backend);

    const messageField = await screen.findByDisplayValue('Chamber too hot');
    fireEvent.change(messageField, { target: { value: 'Chamber way too hot' } });
    expect(messageField).toHaveValue('Chamber way too hot');

    unmount();

    await waitFor(() =>
      expect(backend.store.notifications.settings[0].message).toBe('Chamber way too hot')
    );
  });

  test('toggling the temp switch reveals the probe-2 comparison fields', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    renderCard(backend);
    await screen.findByDisplayValue('Chamber too hot');

    // A temperature rule (type=false) shows a Temperature input; flipping the
    // switch to a probe-vs-probe rule (type=true) swaps in the offset field.
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(await screen.findByLabelText('offset')).toBeInTheDocument();
  });

  test('deletes a rule, leaving none, and persists the empty set on unmount', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    const { unmount } = renderCard(backend);
    await screen.findByDisplayValue('Chamber too hot');

    fireEvent.click(screen.getByLabelText('delete'));

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Chamber too hot')).not.toBeInTheDocument()
    );

    unmount();

    await waitFor(() => expect(backend.store.notifications.settings).toHaveLength(0));
  });

  test('new rules are independent objects — editing one does not corrupt another', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });

    renderCard(backend);
    await screen.findByDisplayValue('Chamber too hot');

    // Two fresh rules must not share a single object reference; if they did,
    // the row editor's in-place mutation would corrupt every rule at once.
    const newRule = screen.getByText('New Rule');
    fireEvent.click(newRule);
    fireEvent.click(newRule);

    const messageInputs = screen.getAllByTestId('settings-notification-message');
    expect(messageInputs).toHaveLength(3);

    fireEvent.change(messageInputs[1], { target: { value: 'first new rule only' } });

    expect(messageInputs[1]).toHaveValue('first new rule only');
    expect(messageInputs[2]).toHaveValue('');
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

  test('surfaces a backend with no push key configured', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: null } });
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    expect(await screen.findByText(/could not send a test notification/i)).toBeInTheDocument();
    expect(port.calls).toEqual(['requestPermission']);
  });

  test('raises the snackbar when loading the notification settings fails', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });
    backend.injectFault({ method: 'get', path: 'notifications/settings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load notification settings.')).toBeInTheDocument();
  });
});
