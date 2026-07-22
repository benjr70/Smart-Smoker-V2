import { GOLDEN_EVENTS_PAYLOAD } from '../wire/golden';
import { InvalidSessionConfigError } from './config';
import { createSessionStore } from './store';
import {
  createTestHarness,
  FakeCloudSocket,
  FakeDeviceFeed,
  FakeSessionApi,
  SteppingClock,
} from '../testing';

describe('session store — monitor role', () => {
  it('setName edits the draft and broadcasts the full five-field smokeUpdate', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    harness.store.setName('probe1', 'Brisket');

    expect(harness.store.getSnapshot().probe1Name).toBe('Brisket');
    expect(harness.socket.emittedSmokeUpdates).toHaveLength(1);
    expect(harness.socket.emittedSmokeUpdates[0]).toEqual({
      smoking: false,
      chamberName: 'Chamber',
      probe1Name: 'Brisket',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
    });
  });

  it('applies inbound smokeUpdate smoking only — never the names', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();
    harness.store.setName('probe1', 'Brisket');

    harness.socket.injectSmokeUpdate({
      smoking: true,
      chamberName: 'CLOBBER',
      probe1Name: 'CLOBBER',
      probe2Name: 'CLOBBER',
      probe3Name: 'CLOBBER',
    });

    const snap = harness.store.getSnapshot();
    expect(snap.smoking).toBe(true);
    expect(snap.probe1Name).toBe('Brisket');
    expect(snap.chamberName).toBe('Chamber');
    expect(snap.probe2Name).toBe('probe 2');
    expect(snap.probe3Name).toBe('probe 3');
  });

  it('applies an inbound events frame to temps and date', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    harness.socket.injectEvents(GOLDEN_EVENTS_PAYLOAD);

    const snap = harness.store.getSnapshot();
    expect(snap.chamberTemp).toBe('225.6');
    expect(snap.probeTemp1).toBe('120.4');
    expect(snap.probeTemp2).toBe('119.8');
    expect(snap.probeTemp3).toBe('118.2');
    expect(snap.date).toEqual(new Date('2026-07-14T12:00:00.000Z'));
  });

  const seededProfile = {
    chamberName: 'Smoker',
    probe1Name: 'Pork',
    probe2Name: 'Ribs',
    probe3Name: 'Wings',
    notes: 'low and slow',
    woodType: 'Hickory',
  };

  it('clear reloads the saved profile and resets the chart baseline', async () => {
    const harness = createTestHarness();
    harness.api.seedProfile(seededProfile).seedTemps([goldenTemp()]);
    harness.store.start();
    await harness.flush();
    harness.store.setName('probe1', 'edited-away');

    harness.socket.injectClear();
    await harness.flush();

    const snap = harness.store.getSnapshot();
    expect(snap.probe1Name).toBe('Pork');
    expect(snap.chamberName).toBe('Smoker');
    expect(snap.initialTemps).toEqual([]);
  });

  it('clear falls back to default names, smoking false, empty baseline on reload failure', async () => {
    const harness = createTestHarness();
    harness.api.seedProfile(seededProfile).seedSmoking(true).seedTemps([goldenTemp()]);
    harness.store.start();
    await harness.flush();
    expect(harness.store.getSnapshot().smoking).toBe(true);

    harness.api.failNext('getProfile');
    harness.socket.injectClear();
    await harness.flush();

    const snap = harness.store.getSnapshot();
    expect(snap.chamberName).toBe('Chamber');
    expect(snap.probe1Name).toBe('probe 1');
    expect(snap.probe2Name).toBe('probe 2');
    expect(snap.probe3Name).toBe('probe 3');
    expect(snap.smoking).toBe(false);
    expect(snap.initialTemps).toEqual([]);
  });

  it('refresh re-fetches the current temps into the snapshot baseline', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();
    expect(harness.store.getSnapshot().initialTemps).toEqual([]);

    const refreshed = [goldenTemp()];
    harness.api.seedTemps(refreshed);
    harness.socket.injectRefresh();
    await harness.flush();

    expect(harness.store.getSnapshot().initialTemps).toEqual(refreshed);
  });

  it('flushProfile saves the draft (names + notes + wood type) as of call time', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    harness.store.setName('chamber', 'Big Green Egg');
    harness.store.setNotes('spritz hourly');
    harness.store.setWoodType('Pecan');
    await harness.store.flushProfile();

    const saved = harness.api.calls.find(call => call.method === 'saveProfile');
    expect(saved?.args[0]).toEqual({
      chamberName: 'Big Green Egg',
      probe1Name: 'probe 1',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
      notes: 'spritz hourly',
      woodType: 'Pecan',
    });
  });

  it('flushProfile does not persist when the startup profile load never resolved', async () => {
    const harness = createTestHarness();
    // The profile load fails, so the draft is never hydrated from the backend.
    harness.api.failNext('getProfile');
    harness.store.start();
    await harness.flush();

    // Leaving the step now must NOT save the placeholder defaults over the
    // user's real saved profile.
    await harness.store.flushProfile();

    expect(harness.api.countCalls('saveProfile')).toBe(0);
  });

  it('surfaces a failing profile load in lastError while the session stays live', async () => {
    const harness = createTestHarness();
    harness.api.seedSmoking(true).failNext('getProfile');

    harness.store.start();
    await harness.flush();

    const snap = harness.store.getSnapshot();
    expect(snap.lastError).toEqual({ source: 'profile', message: expect.any(String) });
    // Session is still live: the concurrent state load succeeded and inbound
    // frames still update the snapshot.
    expect(snap.smoking).toBe(true);
    harness.socket.injectEvents(GOLDEN_EVENTS_PAYLOAD);
    expect(harness.store.getSnapshot().chamberTemp).toBe('225.6');
  });

  it('treats a null profile as a normal start: default names, no error', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    const snap = harness.store.getSnapshot();
    expect(snap.chamberName).toBe('Chamber');
    expect(snap.probe1Name).toBe('probe 1');
    expect(snap.lastError).toBeNull();
    expect(harness.api.countCalls('getProfile')).toBe(1);
  });

  it('surfaces a failing state load in lastError', async () => {
    const harness = createTestHarness();
    harness.api.failNext('getSmokingState');
    harness.store.start();
    await harness.flush();

    expect(harness.store.getSnapshot().lastError).toEqual({
      source: 'state',
      message: expect.any(String),
    });
  });

  it('surfaces a failing temps load in lastError', async () => {
    const harness = createTestHarness();
    harness.api.failNext('getCurrentTemps');
    harness.store.start();
    await harness.flush();

    expect(harness.store.getSnapshot().lastError).toEqual({
      source: 'temps',
      message: expect.any(String),
    });
  });

  it('clear with no saved profile resets to default names', async () => {
    const harness = createTestHarness();
    harness.api.seedProfile(seededProfile);
    harness.store.start();
    await harness.flush();
    expect(harness.store.getSnapshot().chamberName).toBe('Smoker');

    harness.api.seedProfile(null);
    harness.socket.injectClear();
    await harness.flush();

    const snap = harness.store.getSnapshot();
    expect(snap.chamberName).toBe('Chamber');
    expect(snap.probe1Name).toBe('probe 1');
    expect(snap.initialTemps).toEqual([]);
  });

  it('setName targets each of the four names', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    harness.store.setName('chamber', 'C');
    harness.store.setName('probe1', 'P1');
    harness.store.setName('probe2', 'P2');
    harness.store.setName('probe3', 'P3');

    const snap = harness.store.getSnapshot();
    expect([snap.chamberName, snap.probe1Name, snap.probe2Name, snap.probe3Name]).toEqual([
      'C',
      'P1',
      'P2',
      'P3',
    ]);
    expect(harness.socket.emittedSmokeUpdates).toHaveLength(4);
  });

  it('toggleSmoking flips persisted state, updates the snapshot, and broadcasts', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    await harness.store.toggleSmoking();

    expect(harness.store.getSnapshot().smoking).toBe(true);
    expect(harness.socket.emittedSmokeUpdates).toEqual([
      {
        smoking: true,
        chamberName: 'Chamber',
        probe1Name: 'probe 1',
        probe2Name: 'probe 2',
        probe3Name: 'probe 3',
      },
    ]);
  });

  it('surfaces a failing toggleSmoking in lastError instead of rejecting', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();
    harness.api.failNext('toggleSmoking');

    // The command must resolve (never reject) so a fire-and-forget caller does
    // not produce an unhandled rejection; the failure surfaces in the snapshot.
    await expect(harness.store.toggleSmoking()).resolves.toBeUndefined();

    expect(harness.store.getSnapshot().lastError).toEqual({
      source: 'state',
      message: expect.any(String),
    });
    // Persisted smoking is unchanged and no smokeUpdate was broadcast.
    expect(harness.store.getSnapshot().smoking).toBe(false);
    expect(harness.socket.emittedSmokeUpdates).toHaveLength(0);
  });

  it('refreshInitialTemps command re-fetches the baseline', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();
    const refreshed = [goldenTemp()];
    harness.api.seedTemps(refreshed);

    await harness.store.refreshInitialTemps();

    expect(harness.store.getSnapshot().initialTemps).toEqual(refreshed);
  });

  it('reflects connection-change signals in the snapshot', async () => {
    const harness = createTestHarness();
    harness.store.start();

    harness.socket.setConnected(true);
    expect(harness.store.getSnapshot().connected).toBe(true);
    harness.socket.setConnected(false);
    expect(harness.store.getSnapshot().connected).toBe(false);
  });

  it('start is idempotent', async () => {
    const harness = createTestHarness();
    harness.store.start();
    harness.store.start();
    await harness.flush();

    expect(harness.api.countCalls('getProfile')).toBe(1);
  });

  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();
    let calls = 0;
    const unsubscribe = harness.store.subscribe(() => {
      calls += 1;
    });

    harness.store.setNotes('a');
    expect(calls).toBe(1);
    unsubscribe();
    harness.store.setNotes('b');
    expect(calls).toBe(1);
  });

  it('stop detaches every port subscription — no callback fires after', async () => {
    const harness = createTestHarness();
    harness.store.start();
    await harness.flush();

    harness.store.stop();
    harness.socket.injectSmokeUpdate({
      smoking: true,
      chamberName: 'x',
      probe1Name: 'x',
      probe2Name: 'x',
      probe3Name: 'x',
    });
    harness.socket.injectEvents(GOLDEN_EVENTS_PAYLOAD);

    const snap = harness.store.getSnapshot();
    expect(snap.smoking).toBe(false);
    expect(snap.chamberTemp).toBe('0');
  });
});

describe('session store — construction', () => {
  const build = (role: 'monitor' | 'smoker', withFeed: boolean) =>
    createSessionStore({
      role,
      socket: new FakeCloudSocket(),
      api: new FakeSessionApi(),
      clock: new SteppingClock(),
      deviceFeed: withFeed ? new FakeDeviceFeed() : undefined,
    });

  it('throws when a monitor role is handed a device feed', () => {
    expect(() => build('monitor', true)).toThrow(InvalidSessionConfigError);
  });

  it('throws when a smoker role is constructed without a device feed', () => {
    expect(() => build('smoker', false)).toThrow(InvalidSessionConfigError);
  });

  it('constructs a valid monitor and smoker store', () => {
    expect(build('monitor', false)).toBeDefined();
    expect(build('smoker', true)).toBeDefined();
  });
});

function goldenTemp() {
  return {
    ChamberTemp: 225.6,
    MeatTemp: 120.4,
    Meat2Temp: 119.8,
    Meat3Temp: 118.2,
    date: new Date('2026-07-14T12:00:00.000Z'),
  };
}
