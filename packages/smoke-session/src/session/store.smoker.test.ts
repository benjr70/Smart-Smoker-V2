import { decodeEvents } from '../wire/codecs';
import { GOLDEN_SERIAL_FRAME } from '../wire/golden';
import { createTestHarness } from '../testing';

/**
 * A well-formed serial frame with caller-chosen temps, in the firmware's
 * string-quoted shape. Lets a test vary readings and later assert the exact
 * numbers that survived batching.
 */
function serialFrame(temps: {
  meat: string;
  meat2: string;
  meat3: string;
  chamber: string;
}): string {
  return JSON.stringify({
    Meat: temps.meat,
    Meat2: temps.meat2,
    Meat3: temps.meat3,
    Chamber: temps.chamber,
  });
}

describe('session store — smoker role', () => {
  describe('offline batching', () => {
    it('characterization: keeps every 11th reading while disconnected (23 → 2 pending)', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      for (let i = 0; i < 23; i += 1) {
        harness.deviceFeed!.injectReading(GOLDEN_SERIAL_FRAME);
      }
      await harness.flush();

      expect(harness.socket.emittedEvents).toHaveLength(0);
      expect(harness.api.countCalls('postTempsBatch')).toBe(0);
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(2);
    });

    it('reconnect + one reading POSTs the batch, then refresh, then events, in order', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      for (let i = 0; i < 23; i += 1) {
        harness.deviceFeed!.injectReading(
          serialFrame({ meat: '100', meat2: '101', meat3: '102', chamber: '103' })
        );
      }
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(2);

      harness.socket.setConnected(true);
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '120.4', meat2: '119.8', meat3: '118.2', chamber: '225.6' })
      );
      await harness.flush();

      expect(harness.api.countCalls('postTempsBatch')).toBe(1);
      const posted = harness.api.calls.find(c => c.method === 'postTempsBatch');
      expect(posted?.args[0]).toEqual([
        { ChamberTemp: 103, MeatTemp: 100, Meat2Temp: 101, Meat3Temp: 102, date: expect.any(Date) },
        { ChamberTemp: 103, MeatTemp: 100, Meat2Temp: 101, Meat3Temp: 102, date: expect.any(Date) },
      ]);
      expect(harness.socket.outbound).toEqual(['refresh', 'events']);
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(0);
    });

    it('retains the batch and emits no refresh on a failed POST, then retries on the next reading', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      for (let i = 0; i < 23; i += 1) {
        harness.deviceFeed!.injectReading(
          serialFrame({ meat: '50', meat2: '51', meat3: '52', chamber: '53' })
        );
      }
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(2);

      harness.socket.setConnected(true);
      harness.api.failNext('postTempsBatch');
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '60', meat2: '61', meat3: '62', chamber: '63' })
      );
      await harness.flush();

      // Fix 2: the batch is retained and no refresh was announced.
      expect(harness.api.countCalls('postTempsBatch')).toBe(1);
      expect(harness.socket.emittedRefreshes).toBe(0);
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(2);
      // The live reading still went out.
      expect(harness.socket.outbound).toEqual(['events']);

      // Next connected reading retries the retained batch successfully.
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '70', meat2: '71', meat3: '72', chamber: '73' })
      );
      await harness.flush();

      expect(harness.api.countCalls('postTempsBatch')).toBe(2);
      expect(harness.socket.emittedRefreshes).toBe(1);
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(0);
      expect(harness.socket.outbound).toEqual(['events', 'refresh', 'events']);
    });

    it('guards against re-entrant flushes: a reading mid-flush does not start a second POST', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      for (let i = 0; i < 23; i += 1) {
        harness.deviceFeed!.injectReading(
          serialFrame({ meat: '1', meat2: '2', meat3: '3', chamber: '4' })
        );
      }
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(2);

      harness.socket.setConnected(true);
      const release = harness.api.holdPostTempsBatch();

      // First connected reading starts the flush, which now blocks on the gate.
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '5', meat2: '6', meat3: '7', chamber: '8' })
      );
      await harness.flush();
      expect(harness.api.countCalls('postTempsBatch')).toBe(1);
      expect(harness.socket.emittedRefreshes).toBe(0);

      // Second reading arrives while the flush is in flight — no second POST.
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '5', meat2: '6', meat3: '7', chamber: '8' })
      );
      await harness.flush();
      expect(harness.api.countCalls('postTempsBatch')).toBe(1);

      // Release the gate: the single flush completes once.
      release();
      await harness.flush();
      expect(harness.api.countCalls('postTempsBatch')).toBe(1);
      expect(harness.socket.emittedRefreshes).toBe(1);
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(0);
    });
  });

  describe('connected live feed', () => {
    it('emits an events frame whose decoded payload matches the snapshot', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();
      harness.socket.setConnected(true);

      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '120.4', meat2: '119.8', meat3: '118.2', chamber: '225.6' })
      );
      await harness.flush();

      expect(harness.socket.emittedEvents).toHaveLength(1);
      const frame = decodeEvents(harness.socket.emittedEvents[0]);
      const snap = harness.store.getSnapshot();
      expect(frame).toEqual({
        chamberName: snap.chamberName,
        probe1Name: snap.probe1Name,
        probe2Name: snap.probe2Name,
        probe3Name: snap.probe3Name,
        probeTemp1: '120.4',
        probeTemp2: '119.8',
        probeTemp3: '118.2',
        chamberTemp: '225.6',
        smoking: snap.smoking,
        date: snap.date.toISOString(),
      });
      expect(harness.api.countCalls('postTempsBatch')).toBe(0);
    });
  });

  describe('inbound smokeUpdate', () => {
    it('applies both smoking AND the names (unlike the monitor role)', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      harness.socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Offset',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Wings',
      });

      const snap = harness.store.getSnapshot();
      expect(snap.smoking).toBe(true);
      expect(snap.chamberName).toBe('Offset');
      expect(snap.probe1Name).toBe('Brisket');
      expect(snap.probe2Name).toBe('Ribs');
      expect(snap.probe3Name).toBe('Wings');
    });
  });

  describe('inbound clear (relayed cloud clear-signal)', () => {
    it('resets labels to the saved profile and clears the chart baseline on a clear', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.api.seedProfile({
        chamberName: 'Reset Chamber',
        probe1Name: 'Reset 1',
        probe2Name: 'Reset 2',
        probe3Name: 'Reset 3',
        notes: '',
        woodType: '',
      });
      harness.api.seedTemps([
        { ChamberTemp: 200, MeatTemp: 100, Meat2Temp: 101, Meat3Temp: 102, date: new Date() },
      ]);
      harness.store.start();
      await harness.flush();

      // Drift the labels away from the profile, as an in-progress smoke would.
      harness.socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Offset',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Wings',
      });
      expect(harness.store.getSnapshot().initialTemps).toHaveLength(1);

      harness.socket.injectClear();
      await harness.flush();

      const snap = harness.store.getSnapshot();
      expect(snap.chamberName).toBe('Reset Chamber');
      expect(snap.probe1Name).toBe('Reset 1');
      expect(snap.probe2Name).toBe('Reset 2');
      expect(snap.probe3Name).toBe('Reset 3');
      expect(snap.initialTemps).toEqual([]);
    });

    it('falls back to default labels and stops smoking when the profile reload fails', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      harness.socket.injectSmokeUpdate({
        smoking: true,
        chamberName: 'Offset',
        probe1Name: 'Brisket',
        probe2Name: 'Ribs',
        probe3Name: 'Wings',
      });

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
  });

  describe('malformed device frames', () => {
    it('surfaces the error, leaves temps unchanged, and keeps processing readings', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '10', meat2: '11', meat3: '12', chamber: '200' })
      );
      expect(harness.store.getSnapshot().chamberTemp).toBe('200');

      harness.deviceFeed!.injectReading('not even json');

      const afterBad = harness.store.getSnapshot();
      expect(afterBad.lastError).toEqual({ source: 'device', message: expect.any(String) });
      // Temps are untouched by the dropped frame.
      expect(afterBad.chamberTemp).toBe('200');
      expect(afterBad.probeTemp1).toBe('10');

      // The session is still live: the next well-formed reading updates temps.
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '20', meat2: '21', meat3: '22', chamber: '300' })
      );
      expect(harness.store.getSnapshot().chamberTemp).toBe('300');
    });
  });

  describe('immutable capture (nice-to-have)', () => {
    it('freezes a kept sample as of capture time; later readings do not mutate it', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      // Eleven readings at 100 → the 11th is kept (pending 1).
      for (let i = 0; i < 11; i += 1) {
        harness.deviceFeed!.injectReading(
          serialFrame({ meat: '1', meat2: '2', meat3: '3', chamber: '100' })
        );
      }
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(1);

      // Ten more readings at 999 → none kept, but the live snapshot moves on.
      for (let i = 0; i < 10; i += 1) {
        harness.deviceFeed!.injectReading(
          serialFrame({ meat: '9', meat2: '9', meat3: '9', chamber: '999' })
        );
      }
      expect(harness.store.getSnapshot().chamberTemp).toBe('999');
      expect(harness.store.getSnapshot().pendingBatchSize).toBe(1);

      harness.socket.setConnected(true);
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '8', meat2: '8', meat3: '8', chamber: '888' })
      );
      await harness.flush();

      const posted = harness.api.calls.find(c => c.method === 'postTempsBatch');
      // The kept sample still carries its capture-time temps, not 999 or 888.
      expect(posted?.args[0]).toEqual([
        { ChamberTemp: 100, MeatTemp: 1, Meat2Temp: 2, Meat3Temp: 3, date: expect.any(Date) },
      ]);
    });
  });

  describe('wifi probing (nice-to-have)', () => {
    const frame = () => serialFrame({ meat: '1', meat2: '2', meat3: '3', chamber: '4' });

    it('probes at most once per throttle window regardless of reading rate', async () => {
      const harness = createTestHarness({ role: 'smoker', wifiThrottleMs: 5000 });
      harness.wifi!.setStatus(true);
      harness.store.start();
      await harness.flush();

      // Three readings inside one window → a single probe.
      harness.deviceFeed!.injectReading(frame());
      harness.deviceFeed!.injectReading(frame());
      harness.deviceFeed!.injectReading(frame());
      await harness.flush();
      expect(harness.wifi!.callCount).toBe(1);
      expect(harness.store.getSnapshot().wifiConnected).toBe(true);

      // Still inside the window after a sub-throttle step → no new probe.
      harness.clock.step(4999);
      harness.deviceFeed!.injectReading(frame());
      await harness.flush();
      expect(harness.wifi!.callCount).toBe(1);

      // Cross the window → exactly one more probe, reflected in the snapshot.
      harness.clock.step(1);
      harness.wifi!.setStatus(false);
      harness.deviceFeed!.injectReading(frame());
      await harness.flush();
      expect(harness.wifi!.callCount).toBe(2);
      expect(harness.store.getSnapshot().wifiConnected).toBe(false);
    });

    it('never probes when wifi is not configured', async () => {
      const harness = createTestHarness({ role: 'smoker' });
      harness.store.start();
      await harness.flush();

      harness.deviceFeed!.injectReading(frame());
      await harness.flush();

      // Default indicator stays connected when nothing probes.
      expect(harness.store.getSnapshot().wifiConnected).toBe(true);
    });

    it('survives a wifi probe failure, keeping the last known status', async () => {
      const harness = createTestHarness({ role: 'smoker', wifiThrottleMs: 1000 });
      harness.wifi!.setStatus(true);
      harness.store.start();
      await harness.flush();

      // First probe succeeds → connected.
      harness.deviceFeed!.injectReading(frame());
      await harness.flush();
      expect(harness.store.getSnapshot().wifiConnected).toBe(true);

      // Next window's probe rejects: the session survives and keeps the value.
      harness.clock.step(1000);
      harness.wifi!.failNext();
      harness.deviceFeed!.injectReading(frame());
      await harness.flush();
      expect(harness.store.getSnapshot().wifiConnected).toBe(true);

      // And it still processes the next reading normally.
      harness.deviceFeed!.injectReading(
        serialFrame({ meat: '9', meat2: '9', meat3: '9', chamber: '99' })
      );
      expect(harness.store.getSnapshot().chamberTemp).toBe('99');
    });
  });
});
