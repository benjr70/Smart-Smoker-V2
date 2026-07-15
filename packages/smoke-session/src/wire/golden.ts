import { BatchTempDto, EventsSnapshot, EventsWireFrame, ProbeReading, SmokeUpdate } from './types';

/**
 * Golden payloads: the single, canonical example of every frozen wire shape.
 *
 * These are plain literals — no JSON or float parsing happens here (all of that
 * is quarantined in `codecs.ts`). They are exported from the package root so
 * other suites (e.g. the backend gateway spec, host-app tests, e2e harnesses)
 * can assert against exactly the same bytes this package pins, instead of
 * hand-rolling their own copies of the protocol.
 */

/** Fixed timestamp used across the golden set so encoded output is stable. */
export const GOLDEN_DATE = new Date('2026-07-14T12:00:00.000Z');

/**
 * Raw serial frame exactly as the firmware prints it: string-quoted temps with
 * the firmware's spacing.
 */
export const GOLDEN_SERIAL_FRAME =
  '{"Meat": "120.4","Meat2": "119.8","Meat3": "118.2","Chamber": "225.6"}';

/** The {@link GOLDEN_SERIAL_FRAME} decoded, stamped with {@link GOLDEN_DATE}. */
export const GOLDEN_PROBE_READING: ProbeReading = {
  probeTemp1: '120.4',
  probeTemp2: '119.8',
  probeTemp3: '118.2',
  chamberTemp: '225.6',
  date: GOLDEN_DATE,
};

/** Canonical live-session snapshot fed to the `events` encoder. */
export const GOLDEN_EVENTS_SNAPSHOT: EventsSnapshot = {
  chamberName: 'Chamber',
  probe1Name: 'probe 1',
  probe2Name: 'probe 2',
  probe3Name: 'probe 3',
  probeTemp1: '120.4',
  probeTemp2: '119.8',
  probeTemp3: '118.2',
  chamberTemp: '225.6',
  smoking: true,
  date: GOLDEN_DATE,
};

/**
 * The exact `events` payload string {@link GOLDEN_EVENTS_SNAPSHOT} encodes to:
 * frozen field order, string temps, boolean `smoking`, ISO-8601 `date`.
 */
export const GOLDEN_EVENTS_PAYLOAD =
  '{"chamberName":"Chamber","probe1Name":"probe 1","probe2Name":"probe 2","probe3Name":"probe 3","probeTemp1":"120.4","probeTemp2":"119.8","probeTemp3":"118.2","chamberTemp":"225.6","smoking":true,"date":"2026-07-14T12:00:00.000Z"}';

/** {@link GOLDEN_EVENTS_PAYLOAD} decoded — note `date` is the ISO string. */
export const GOLDEN_EVENTS_FRAME: EventsWireFrame = {
  chamberName: 'Chamber',
  probe1Name: 'probe 1',
  probe2Name: 'probe 2',
  probe3Name: 'probe 3',
  probeTemp1: '120.4',
  probeTemp2: '119.8',
  probeTemp3: '118.2',
  chamberTemp: '225.6',
  smoking: true,
  date: '2026-07-14T12:00:00.000Z',
};

/** Canonical `smokeUpdate` object envelope (five fields, in order). */
export const GOLDEN_SMOKE_UPDATE: SmokeUpdate = {
  smoking: true,
  chamberName: 'Chamber',
  probe1Name: 'probe 1',
  probe2Name: 'probe 2',
  probe3Name: 'probe 3',
};

/** Canonical numeric batch DTO for {@link GOLDEN_PROBE_READING}. */
export const GOLDEN_BATCH_DTO: BatchTempDto = {
  ChamberTemp: 225.6,
  MeatTemp: 120.4,
  Meat2Temp: 119.8,
  Meat3Temp: 118.2,
  date: GOLDEN_DATE,
};
