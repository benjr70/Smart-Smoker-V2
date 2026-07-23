import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { NotificationSettings } from '../../api/types';
import { NotificationsCard } from './notifications';

const seededRule: NotificationSettings = {
  type: false,
  message: 'Chamber too hot',
  probe1: 'Chamber',
  op: '>',
  probe2: 'Probe 1',
  temperature: 250,
};

const renderCard = (backend: FakeBackend) => {
  const client = createApiClient(backend);
  return render(
    <ApiClientProvider client={client}>
      <SnackbarProvider>
        <NotificationsCard />
      </SnackbarProvider>
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

  test('raises the snackbar when loading the notification settings fails', async () => {
    const backend = createFakeBackend({ notifications: { settings: [seededRule] } });
    backend.injectFault({ method: 'get', path: 'notifications/settings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load notification settings.')).toBeInTheDocument();
  });
});
