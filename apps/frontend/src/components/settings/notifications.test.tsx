import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { NotificationSettings, PushSubscriptionPayload } from '../../api/types';
import { PushPermission, PushPort, PushPortProvider } from '../../push';
import { NotificationsCard } from './notifications';

/** The probe rows as they are stored: by slot, with no names. */
const probeRows = (
  watched: Record<string, number> = {}
): NotificationSettings['probeTarget']['probes'] =>
  ['probe1', 'probe2', 'probe3'].map((slot, index) => ({
    slot,
    enabled: watched[slot] !== undefined,
    target: watched[slot] ?? 203,
    // Watched or not, these are targets nobody has typed in: the temperature is
    // whatever the app put there, which is what lets a session start seed it.
    targetSource: 'default' as const,
    name: `Probe ${index + 1}`,
  }));

/** The same rows as they go back over the wire: the names are not saved. */
const savedProbeRows = (watched: Record<string, number> = {}) =>
  probeRows(watched).map(({ slot, enabled, target, targetSource }) => ({
    slot,
    enabled,
    target,
    targetSource,
  }));

const chamberAlertOn: NotificationSettings = {
  chamber: { enabled: true, low: 225, high: 275 },
  probeTarget: { enabled: false, probes: probeRows() },
  smokeComplete: { enabled: false },
  targetPresets: { beef: 203, pork: 195, poultry: 165 },
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
 *
 * `permission` is what the browser already reports on mount and `onRequest` is
 * what the prompt resolves to — the two are separate because the interesting
 * states (never asked, then granted; already blocked, so never asked at all)
 * differ precisely in that gap. The default is a browser that has already
 * granted permission, which is the state most of these tests are not about.
 */
const createFakePushPort = (
  overrides: {
    permission?: PushPermission;
    onRequest?: PushPermission;
    subscribe?: (key: string) => Promise<PushSubscriptionPayload>;
  } = {}
) => {
  const calls: string[] = [];
  let permission: PushPermission = overrides.permission ?? 'granted';
  const port: PushPort & {
    calls: string[];
    subscribedWith: string[];
    /** The browser's answer changing under an open page, as a site-settings change does. */
    browserNowReports: (next: PushPermission) => void;
  } = {
    calls,
    subscribedWith: [],
    browserNowReports: (next: PushPermission) => {
      permission = next;
    },
    getPermission: () => permission,
    requestPermission: async () => {
      calls.push('requestPermission');
      permission = overrides.onRequest ?? (permission === 'default' ? 'granted' : permission);
      return permission;
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
        probeTarget: { enabled: false, probes: savedProbeRows() },
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
        probeTarget: { enabled: false, probes: savedProbeRows() },
      })
    );
  });

  // Turning on an alert is the user gesture the browser insists on before it
  // will show the permission prompt, and it is the only such gesture the card
  // offers — there is no separate "enable notifications" control.
  test('switching on an alert for the first time asks permission and subscribes this browser', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: 'BRuntimeKey' } });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    fireEvent.click(await screen.findByLabelText('Temperature Alert'));

    await waitFor(() =>
      expect(backend.store.notifications.subscriptions).toEqual([browserSubscription])
    );
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    // The key comes from the backend at subscribe time, not a bundled constant.
    expect(port.subscribedWith).toEqual(['BRuntimeKey']);
  });

  // Every further alert the user switches on is another chance to prompt twice
  // or take out a second subscription against the same browser; neither is
  // acceptable, and the browser is not the thing that stops it happening.
  test('switching an alert on again once subscribed neither re-prompts nor re-subscribes', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    // Act on the stored document rather than on the defaults the card paints
    // first: the load replaces those wholesale, so a toggle flipped before it
    // lands would be reverted under the test's feet.
    await screen.findByDisplayValue('225');
    const toggle = screen.getByLabelText('Temperature Alert');

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(port.calls).toEqual(['requestPermission', 'subscribe']));

    // Another alert switched on, and this one switched off and on again: none of
    // them is a browser the app has not already enlisted.
    fireEvent.click(screen.getByLabelText('Probe Target Reached'));
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByLabelText('Temperature Alert')).toBeChecked());

    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    expect(backend.store.notifications.subscriptions).toEqual([browserSubscription]);
  });

  // The chamber alert is not the only way in. A cook who only wants telling
  // when the meat is done switches on Probe Target Reached and nothing else, so
  // that toggle has to be a gesture that asks too — otherwise the one alert
  // they chose sits there armed against a browser that was never enlisted.
  test('switching on the probe target alert asks permission and subscribes just the same', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: 'BRuntimeKey' } });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    fireEvent.click(await screen.findByLabelText('Probe Target Reached'));

    await waitFor(() =>
      expect(backend.store.notifications.subscriptions).toEqual([browserSubscription])
    );
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    expect(port.subscribedWith).toEqual(['BRuntimeKey']);
  });

  // Notification settings are one document for the whole smoker, so an alert
  // switched on from one device is already on everywhere. A browser meeting it
  // for the first time never sees an off→on toggle, so without a way in of its
  // own it would never be prompted and never subscribe — the toggle would read
  // as armed while nothing could reach this browser at all.
  test('offers a way in when an alert is already on in a browser that has never been asked', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: chamberAlertOn },
      notifications: { publicKey: 'BRuntimeKey' },
    });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    const banner = await screen.findByTestId('settings-push-not-enabled');
    expect(banner).toHaveTextContent(/this browser/i);
    // Not the test control: nothing could be delivered here yet, so offering it
    // would only produce a failure the user cannot act on.
    expect(screen.queryByRole('button', { name: /send test/i })).not.toBeInTheDocument();
    expect(port.calls).toEqual([]);

    fireEvent.click(within(banner).getByRole('button', { name: /turn on/i }));

    await waitFor(() =>
      expect(backend.store.notifications.subscriptions).toEqual([browserSubscription])
    );
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    expect(port.subscribedWith).toEqual(['BRuntimeKey']);
    await waitFor(() =>
      expect(screen.queryByTestId('settings-push-not-enabled')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /send test/i })).toBeInTheDocument();
  });

  // The same gap, reached through the other alert: a smoker whose only alert is
  // Probe Target Reached is just as unable to hear from a browser that was
  // never asked, so the way in cannot be the chamber alert's alone.
  test('offers the same way in when the alert already on is the probe target one', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows({ probe1: 203 }) },
        },
      },
    });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    const banner = await screen.findByTestId('settings-push-not-enabled');
    fireEvent.click(within(banner).getByRole('button', { name: /turn on/i }));

    await waitFor(() =>
      expect(backend.store.notifications.subscriptions).toEqual([browserSubscription])
    );
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
  });

  // And the third alert, which is the one most likely to be a smoker's only
  // one: someone who only wants telling when the cook is done switches on
  // Smoke Complete and nothing else. Judging the way in by the other two alerts
  // would leave exactly that smoker with a browser that is never asked.
  test('offers the same way in when the alert already on is Smoke Complete', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: false, probes: probeRows({ probe1: 203 }) },
          smokeComplete: { enabled: true },
        },
      },
    });
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    const banner = await screen.findByTestId('settings-push-not-enabled');
    fireEvent.click(within(banner).getByRole('button', { name: /turn on/i }));

    await waitFor(() =>
      expect(backend.store.notifications.subscriptions).toEqual([browserSubscription])
    );
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
  });

  // Without this the toggles would sit there looking armed while nothing could
  // ever arrive, which is exactly the silence this whole overhaul is about.
  test('explains the dead end, and the way out of it, when the user denies the prompt', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'default', onRequest: 'denied' });

    renderCard(backend, port);

    expect(screen.queryByTestId('settings-push-blocked')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText('Temperature Alert'));

    const banner = await screen.findByTestId('settings-push-blocked');
    expect(banner).toHaveTextContent(/blocked/i);
    // Recovery lives in browser chrome the page cannot reach, so the banner has
    // to say where it is rather than just reporting the state.
    expect(banner).toHaveTextContent(/address bar/i);
    expect(banner).toHaveTextContent(/allow/i);
    expect(port.calls).toEqual(['requestPermission']);
  });

  // A block survives reloads, so the usual way to meet this state is to arrive
  // on the page already in it. Re-prompting is pointless — the browser
  // auto-denies — so the card must explain rather than ask again.
  test('shows the blocked banner on arrival when the browser is already blocking, without prompting', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'denied' });

    renderCard(backend, port);

    expect(await screen.findByTestId('settings-push-blocked')).toHaveTextContent(/blocked/i);
    expect(port.calls).toEqual([]);
  });

  test('says nothing about permission once the browser has granted it', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });

    renderCard(backend, createFakePushPort({ permission: 'granted' }));

    // Wait for the loaded settings, not merely the first paint, so the banner
    // is being judged against the card the user actually ends up looking at.
    await screen.findByDisplayValue('225');
    expect(screen.queryByTestId('settings-push-blocked')).not.toBeInTheDocument();
  });

  test('says nothing about permission before the user has been asked at all', async () => {
    const backend = createFakeBackend();

    renderCard(backend, createFakePushPort({ permission: 'default' }));

    await screen.findByLabelText('Temperature Alert');
    expect(screen.queryByTestId('settings-push-blocked')).not.toBeInTheDocument();
    // Nor the way in: with every alert off there is nothing this browser is
    // missing, and switching one on is the gesture that asks.
    expect(screen.queryByTestId('settings-push-not-enabled')).not.toBeInTheDocument();
  });

  // The configuration is worth keeping even when it cannot be delivered today:
  // unblocking in browser settings should be the only thing the user has to do
  // later, not re-entering the alert they already set up.
  test('keeps the alert the user configured even though the browser is blocking notifications', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          // Watching probes is not what this test is about: it is the visible
          // difference from the card's defaults, so waiting for the rows below
          // is waiting for the stored document to have replaced them.
          probeTarget: { enabled: true, probes: probeRows() },
        },
      },
    });
    const port = createFakePushPort({ permission: 'denied' });

    const { unmount } = renderCard(backend, port);

    await screen.findByTestId('settings-probe-rows');
    fireEvent.click(screen.getByLabelText('Temperature Alert'));
    fireEvent.change(screen.getByLabelText('Low'), { target: { value: '210' } });
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings).toMatchObject({
        chamber: { enabled: true, low: 210, high: 275 },
        probeTarget: { enabled: true, probes: savedProbeRows() },
      })
    );
    expect(backend.store.notifications.subscriptions).toEqual([]);
  });

  // Not the same state as a block: there is nothing to unblock, and prompting
  // would throw rather than ask, so the card says so and leaves it there.
  test('explains a browser that cannot do push at all, and does not prompt it', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'unsupported' });

    renderCard(backend, port);

    const banner = await screen.findByTestId('settings-push-unsupported');
    expect(banner).toHaveTextContent(/does not|cannot|no support/i);
    expect(screen.queryByTestId('settings-push-blocked')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Temperature Alert'));
    await waitFor(() => expect(screen.getByLabelText('Temperature Alert')).toBeChecked());
    expect(port.calls).toEqual([]);
  });

  // A test button that cannot possibly deliver anything is worse than no
  // button: it invites the user to conclude the whole feature is broken.
  test('offers the test notification only once the browser has granted permission', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'default', onRequest: 'granted' });

    renderCard(backend, port);

    await screen.findByLabelText('Temperature Alert');
    expect(screen.queryByRole('button', { name: /send test/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Temperature Alert'));

    expect(await screen.findByRole('button', { name: /send test/i })).toBeInTheDocument();
  });

  // Subscribing takes seconds on a first visit — service worker registration,
  // activation, then `pushManager.subscribe` — and a grant arrives well before
  // any of it finishes. Offering the test control inside that window invites a
  // second chain against the same registration: overlapping subscribes can make
  // one of them reject, and each would register its own copy with the backend.
  test('does not offer the test control mid-subscribe, and never subscribes this browser twice', async () => {
    const backend = createFakeBackend();
    let completeSubscribe: () => void = () => undefined;
    const port = createFakePushPort({
      permission: 'default',
      onRequest: 'granted',
      subscribe: () =>
        new Promise<PushSubscriptionPayload>(resolve => {
          completeSubscribe = () => resolve(browserSubscription);
        }),
    });

    renderCard(backend, port);

    fireEvent.click(await screen.findByLabelText('Temperature Alert'));
    // Permission granted, so the card knows push is possible — but this browser
    // has no subscription yet, and the chain that is taking one out is running.
    await waitFor(() => expect(port.calls).toEqual(['requestPermission', 'subscribe']));
    expect(screen.queryByRole('button', { name: /send test/i })).not.toBeInTheDocument();

    completeSubscribe();

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await waitFor(() => expect(backend.store.notifications.testSends).toBe(1));
    expect(port.calls).toEqual(['requestPermission', 'subscribe']);
    expect(backend.store.notifications.subscriptions).toEqual([browserSubscription]);
  });

  // Silence here is how the old subscribe-on-mount block hid this exact
  // failure, leaving a browser that looked armed and was not.
  test('reports a browser that could not be subscribed when the alert was switched on', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({
      permission: 'default',
      subscribe: async () => {
        throw new Error('registration blew up');
      },
    });

    renderCard(backend, port);

    fireEvent.click(await screen.findByLabelText('Temperature Alert'));

    expect(await screen.findByText(/could not turn on notifications/i)).toBeInTheDocument();
    expect(backend.store.notifications.subscriptions).toEqual([]);
  });

  test('reports a server with no push key when the alert is switched on, distinctly', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: null } });
    const port = createFakePushPort({ permission: 'default' });

    renderCard(backend, port);

    fireEvent.click(await screen.findByLabelText('Temperature Alert'));

    expect(await screen.findByText(/not set up on the server/i)).toBeInTheDocument();
    expect(port.calls).toEqual(['requestPermission']);
  });

  test('the send-test control subscribes with the backend key, registers it and sends', async () => {
    const backend = createFakeBackend({ notifications: { publicKey: 'BRuntimeKey' } });
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await waitFor(() => expect(backend.store.notifications.testSends).toBe(1));
    // No prompt: this browser has already granted permission, and re-asking
    // would be a browser call that can only return the answer already held.
    expect(port.calls).toEqual(['subscribe']);
    // The key comes from the backend at subscribe time, not a bundled constant.
    expect(port.subscribedWith).toEqual(['BRuntimeKey']);
    expect(backend.store.notifications.subscriptions).toEqual([browserSubscription]);
  });

  // Permission can be withdrawn in browser site settings while the page stays
  // open, so the control offered on a granted state can still meet a denial —
  // and afterwards the card has to keep telling the truth. A snackbar the user
  // can re-trigger for ever is not the same as saying the site is blocked.
  test('a grant revoked while the page is open stops the send and leaves the blocked banner behind', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'granted' });

    renderCard(backend, port);

    const button = await screen.findByRole('button', { name: /send test notification/i });
    port.browserNowReports('denied');
    fireEvent.click(button);

    expect(await screen.findByText(/allow notifications for this site/i)).toBeInTheDocument();
    expect(await screen.findByTestId('settings-push-blocked')).toHaveTextContent(/address bar/i);
    // And the control that can no longer do anything goes with it.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /send test/i })).not.toBeInTheDocument()
    );
    // Nothing to prompt for: a blocked browser auto-denies a second prompt.
    expect(port.calls).toEqual([]);
    expect(backend.store.notifications.testSends).toBe(0);
  });

  test('tells the user when the browser turns out not to do push at all', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort({ permission: 'granted' });

    renderCard(backend, port);

    const button = await screen.findByRole('button', { name: /send test notification/i });
    port.browserNowReports('unsupported');
    fireEvent.click(button);

    expect(await screen.findByText(/does not support push notifications/i)).toBeInTheDocument();
    expect(await screen.findByTestId('settings-push-unsupported')).toBeInTheDocument();
    expect(port.calls).toEqual([]);
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
    // The key is fetched before the browser is asked to subscribe, so a server
    // with none configured never reaches the browser at all.
    expect(port.calls).toEqual([]);
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
    expect(port.calls).toEqual(['subscribe']);
  });

  test('says nothing when the test notification is delivered', async () => {
    const backend = createFakeBackend();
    const port = createFakePushPort();

    renderCard(backend, port);

    fireEvent.click(await screen.findByRole('button', { name: /send test notification/i }));

    await waitFor(() => expect(backend.store.notifications.testSends).toBe(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('reveals a row per probe only while the Probe Target Reached alert is switched on', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });

    renderCard(backend);

    const toggle = await screen.findByLabelText('Probe Target Reached');
    expect(screen.queryByTestId('settings-probe-row-probe1')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await screen.findByTestId('settings-probe-row-probe1')).toBeInTheDocument();
    expect(screen.getByTestId('settings-probe-row-probe2')).toBeInTheDocument();
    expect(screen.getByTestId('settings-probe-row-probe3')).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(screen.queryByTestId('settings-probe-row-probe1')).not.toBeInTheDocument()
    );
  });

  // The rows are stored by slot; the names come from the cook that is set up
  // now. A row reading "probe1" would be the bug this slice exists to fix.
  test('names each probe row after the active cook, falling back to the slot label', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows({ probe1: 203 }) },
        },
      },
      smokeProfile: { current: { probe1Name: 'Brisket Flat', probe2Name: 'Pork Butt' } },
    });

    renderCard(backend);

    expect(await screen.findByText('Brisket Flat')).toBeInTheDocument();
    expect(screen.getByText('Pork Butt')).toBeInTheDocument();
    // The cook named neither probe 3 nor anything in that slot.
    expect(screen.getByText('Probe 3')).toBeInTheDocument();
  });

  test('names the probes being watched, and tags the first of them', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows({ probe2: 195, probe3: 165 }) },
        },
      },
      smokeProfile: { current: { probe2Name: 'Pork Butt', probe3Name: 'Ribs' } },
    });

    renderCard(backend);

    const summary = await screen.findByTestId('settings-probe-target-summary');
    await waitFor(() => expect(summary).toHaveTextContent(/Pork Butt at 195°F/));
    expect(summary).toHaveTextContent(/Ribs at 165°F/);
    // The unwatched probe is not something the cook is being told about.
    expect(summary).not.toHaveTextContent(/Probe 1/);

    // The mock tags the first watched probe, which is the second row here.
    const tagged = screen.getByTestId('settings-probe-eta');
    expect(screen.getByTestId('settings-probe-row-probe2')).toContainElement(tagged);
  });

  test('persists a probe newly watched and its edited target when the settings page is left', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows() },
        },
      },
      smokeProfile: { current: { probe1Name: 'Brisket Flat' } },
    });

    const { unmount } = renderCard(backend);

    fireEvent.click(await screen.findByLabelText('Watch Brisket Flat'));
    fireEvent.change(screen.getByLabelText('Brisket Flat target'), {
      target: { value: '198' },
    });

    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.probeTarget).toEqual({
        enabled: true,
        probes: [
          // The temperature was typed in, so it is the user's: a session start
          // seeds the other rows and leaves this one exactly here.
          { slot: 'probe1', enabled: true, target: 198, targetSource: 'user' },
          ...savedProbeRows().slice(1),
        ],
      })
    );
  });

  /**
   * Clearing the field is how anyone retypes a number, and abandoning that
   * half-edit is not a decision about the temperature. The row keeps the target
   * it had and stays the app's to seed — pinning it out of seeding here would
   * leave a chicken cook on the 203°F beef default with nothing on screen to
   * say why.
   */
  test('a target field cleared mid-edit claims nothing for the user', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows() },
        },
      },
      smokeProfile: { current: { probe1Name: 'Brisket Flat' } },
    });

    const { unmount } = renderCard(backend);

    fireEvent.click(await screen.findByLabelText('Watch Brisket Flat'));
    const target = screen.getByLabelText('Brisket Flat target');
    fireEvent.change(target, { target: { value: '' } });
    expect(target).toHaveValue(203);

    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings?.probeTarget?.probes[0]).toEqual({
        slot: 'probe1',
        enabled: true,
        target: 203,
        targetSource: 'default',
      })
    );
  });

  // Settings are the one screen whose whole job is to still be there tomorrow,
  // so what it saved on the way out has to be what it shows on the way back in.
  test('shows the watch state and targets it saved after a reload', async () => {
    const backend = createFakeBackend({
      appSettings: {
        settings: {
          chamber: { enabled: false, low: 225, high: 275 },
          probeTarget: { enabled: true, probes: probeRows() },
        },
      },
      smokeProfile: { current: { probe2Name: 'Pork Butt' } },
    });

    const { unmount } = renderCard(backend);
    fireEvent.click(await screen.findByLabelText('Watch Pork Butt'));
    fireEvent.change(screen.getByLabelText('Pork Butt target'), { target: { value: '195' } });
    unmount();
    await waitFor(() =>
      expect(backend.store.appSettings?.probeTarget?.probes[1]).toEqual({
        slot: 'probe2',
        enabled: true,
        target: 195,
        targetSource: 'user',
      })
    );

    // A reload is a fresh mount against the same backend.
    renderCard(backend);

    const watch = await screen.findByLabelText('Watch Pork Butt');
    expect(watch).toBeChecked();
    expect(screen.getByLabelText('Pork Butt target')).toHaveValue(195);
  });

  test('offers the Smoke Complete alert with the hint that says what it does', async () => {
    const backend = createFakeBackend();

    renderCard(backend);

    const toggle = await screen.findByLabelText('Smoke Complete');
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(/tell me when every probe i am watching has hit its target/i)
    ).toBeInTheDocument();
  });

  // Completion is measured against the probe watch list, and the two alerts are
  // switched on independently. Hiding the rows behind the per-probe alert would
  // make a Smoke Complete alert switched on by itself a toggle with no way to
  // say what it is waiting for — and so one that can never fire.
  test('reveals the probe rows for a Smoke Complete alert switched on by itself', async () => {
    const backend = createFakeBackend({
      appSettings: { settings: chamberAlertOn },
      smokeProfile: { current: { probe1Name: 'Brisket Flat' } },
    });

    renderCard(backend);

    // The stored chamber range only appears once the settings have arrived, so
    // waiting for it keeps the toggle below from being clicked mid-load.
    await screen.findByLabelText('Low');
    fireEvent.click(screen.getByLabelText('Smoke Complete'));

    expect(await screen.findByTestId('settings-probe-row-probe1')).toBeInTheDocument();
    // Named after the active cook, as the rows are under the other alert.
    expect(screen.getByLabelText('Watch Brisket Flat')).toBeInTheDocument();
    // Without the per-probe chatter being switched on to get them.
    expect(screen.getByLabelText('Probe Target Reached')).not.toBeChecked();
  });

  // The card's other alerts each state what the current configuration will do.
  // This one has to say it too, because "on but watching nothing" is a
  // configuration that looks armed and can never fire.
  test('says what Smoke Complete will do, including when it is watching nothing', async () => {
    const backend = createFakeBackend({
      smokeProfile: { current: { probe1Name: 'Brisket Flat' } },
    });

    renderCard(backend);

    const summary = await screen.findByTestId('settings-smoke-complete-summary');
    await waitFor(() => expect(summary).toHaveTextContent(/will not be told/i));

    fireEvent.click(screen.getByLabelText('Smoke Complete'));
    await waitFor(() => expect(summary).toHaveTextContent(/no probes are being watched/i));

    fireEvent.click(await screen.findByLabelText('Watch Brisket Flat'));
    await waitFor(() => expect(summary).toHaveTextContent(/Brisket Flat at 203°F/));
  });

  // Settings are the one screen whose whole job is to still be there tomorrow,
  // and a toggle that quietly forgets is worse than one that was never offered.
  test('shows the Smoke Complete alert still switched on after a reload', async () => {
    const backend = createFakeBackend();

    const { unmount } = renderCard(backend);
    fireEvent.click(await screen.findByLabelText('Smoke Complete'));
    unmount();

    await waitFor(() =>
      expect(backend.store.appSettings).toMatchObject({ smokeComplete: { enabled: true } })
    );

    // A reload is a fresh mount against the same backend. The toggle is painted
    // before the settings arrive, so this waits for what was stored rather than
    // for the control to exist.
    renderCard(backend);

    await waitFor(() => expect(screen.getByLabelText('Smoke Complete')).toBeChecked());
  });

  test('raises the snackbar when loading the notification settings fails', async () => {
    const backend = createFakeBackend({ appSettings: { settings: chamberAlertOn } });
    backend.injectFault({ method: 'get', path: 'appSettings', status: 500 });

    renderCard(backend);

    expect(await screen.findByText('Could not load notification settings.')).toBeInTheDocument();
  });
});
