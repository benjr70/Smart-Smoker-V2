/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { SmokeSessionProvider } from './SmokeSessionProvider';
import { useSmokeSession } from './useSmokeSession';
import { SessionConfig, SmokeProfile } from '../session';
import { encodeEvents } from '../wire/codecs';
import { FakeCloudSocket, FakeSessionApi, SteppingClock, flushPromises } from '../testing';

/** An `events` frame carrying a single chamber temperature, other fields inert. */
function eventsFrameWithChamberTemp(chamberTemp: string): string {
  return encodeEvents({
    chamberName: 'Chamber',
    probe1Name: 'probe 1',
    probe2Name: 'probe 2',
    probe3Name: 'probe 3',
    probeTemp1: '0',
    probeTemp2: '0',
    probeTemp3: '0',
    chamberTemp,
    smoking: false,
    date: new Date('2026-07-14T12:00:00.000Z'),
  });
}

/** Build a monitor-role config wired to the slice-2 fake kit (no socket/HTTP mocks). */
function monitorConfig(): {
  config: SessionConfig;
  socket: FakeCloudSocket;
  api: FakeSessionApi;
  clock: SteppingClock;
} {
  const socket = new FakeCloudSocket();
  const api = new FakeSessionApi();
  const clock = new SteppingClock();
  const config: SessionConfig = { role: 'monitor', socket, api, clock };
  return { config, socket, api, clock };
}

describe('SmokeSessionProvider lifecycle', () => {
  test('starts the session on mount and stops it on unmount', async () => {
    const { config, socket, api } = monitorConfig();

    const { unmount } = render(
      <SmokeSessionProvider config={config}>
        <div />
      </SmokeSessionProvider>
    );

    // start() ran on mount: the concurrent startup loads fired through the api port.
    await flushPromises();
    expect(api.countCalls('getProfile')).toBe(1);

    // ports attached: an inbound clear drives another profile reload.
    socket.injectClear();
    await flushPromises();
    expect(api.countCalls('getProfile')).toBe(2);

    unmount();

    // stop() ran on unmount: inbound frames no longer reach the store.
    socket.injectClear();
    await flushPromises();
    expect(api.countCalls('getProfile')).toBe(2);
  });
});

/** Renders the live chamber temperature straight off the flattened snapshot. */
function ChamberReadout(): JSX.Element {
  const session = useSmokeSession();
  return <div data-testid="chamber">{session.chamberTemp}</div>;
}

describe('useSmokeSession snapshot binding', () => {
  test('re-renders a consumer when an inbound frame changes the snapshot', async () => {
    const { config, socket } = monitorConfig();

    render(
      <SmokeSessionProvider config={config}>
        <ChamberReadout />
      </SmokeSessionProvider>
    );

    await act(async () => {
      await flushPromises();
    });
    expect(screen.getByTestId('chamber').textContent).toBe('0');

    await act(async () => {
      socket.injectEvents(eventsFrameWithChamberTemp('213'));
      await flushPromises();
    });

    expect(screen.getByTestId('chamber').textContent).toBe('213');
  });

  test('keeps command references stable across re-renders (behavior 5)', async () => {
    const { config, socket } = monitorConfig();
    const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
      <SmokeSessionProvider config={config}>{children}</SmokeSessionProvider>
    );

    const { result } = renderHook(() => useSmokeSession(), { wrapper });
    await act(async () => {
      await flushPromises();
    });

    const before = {
      toggleSmoking: result.current.toggleSmoking,
      setName: result.current.setName,
      setNotes: result.current.setNotes,
      flushProfile: result.current.flushProfile,
    };

    await act(async () => {
      socket.injectEvents(eventsFrameWithChamberTemp('457'));
      await flushPromises();
    });

    // The snapshot re-rendered...
    expect(result.current.chamberTemp).toBe('457');
    // ...but every command kept its identity.
    expect(result.current.toggleSmoking).toBe(before.toggleSmoking);
    expect(result.current.setName).toBe(before.setName);
    expect(result.current.setNotes).toBe(before.setNotes);
    expect(result.current.flushProfile).toBe(before.flushProfile);
  });
});

describe('useSmokeSession outside a provider', () => {
  test('throws a descriptive error naming the provider (behavior 3)', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ChamberReadout />)).toThrow(/SmokeSessionProvider/);

    consoleError.mockRestore();
  });
});

/** A notes editor that opts into the unmount flush and can edit its draft. */
function NotesEditor(): JSX.Element {
  const { notes, setNotes } = useSmokeSession({ flushProfileOnUnmount: true });
  return (
    <button data-testid="edit" onClick={() => setNotes('brisket day')}>
      {notes}
    </button>
  );
}

describe('useSmokeSession flushProfileOnUnmount', () => {
  test('saves the current draft exactly once on the consumer’s own unmount (behavior 4)', async () => {
    const { config, api } = monitorConfig();
    api.seedProfile({
      chamberName: 'Chamber',
      probe1Name: 'probe 1',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
      notes: '',
      woodType: '',
    });

    function Tree({ showEditor }: { showEditor: boolean }): JSX.Element {
      return (
        <SmokeSessionProvider config={config}>
          {showEditor ? <NotesEditor /> : null}
        </SmokeSessionProvider>
      );
    }

    const { rerender } = render(<Tree showEditor />);
    await act(async () => {
      await flushPromises();
    });

    // Edit the draft so the flush must save the CURRENT value, not the seed.
    act(() => {
      fireEvent.click(screen.getByTestId('edit'));
    });
    expect(api.countCalls('saveProfile')).toBe(0);

    // Unmount ONLY the consumer; the Provider (and its session) stay mounted.
    rerender(<Tree showEditor={false} />);
    await flushPromises();

    expect(api.countCalls('saveProfile')).toBe(1);
    const saved = api.calls.find(call => call.method === 'saveProfile');
    expect((saved?.args[0] as SmokeProfile).notes).toBe('brisket day');
  });

  test('swallows a rejected save-on-leave (e.g. no active smoke) without an unhandled rejection', async () => {
    const { config, api } = monitorConfig();
    api.seedProfile({
      chamberName: 'Chamber',
      probe1Name: 'probe 1',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
      notes: '',
      woodType: '',
    });

    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    function Tree({ showEditor }: { showEditor: boolean }): JSX.Element {
      return (
        <SmokeSessionProvider config={config}>
          {showEditor ? <NotesEditor /> : null}
        </SmokeSessionProvider>
      );
    }

    const { rerender } = render(<Tree showEditor />);
    await act(async () => {
      await flushPromises();
    });

    // The unmount flush hits a backend that rejects (no active smoke).
    api.failNext('saveProfile');
    rerender(<Tree showEditor={false} />);
    await flushPromises();
    // Let any rejection microtask settle before asserting.
    await flushPromises();

    process.off('unhandledRejection', unhandled);
    expect(api.countCalls('saveProfile')).toBe(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
