/**
 * Frozen wire-shape types for the smoke-session websocket/serial protocol.
 *
 * These mirror, byte-for-byte, the shapes already shipped by the device
 * firmware, device-service, backend gateway, and the two host apps. They are
 * documented here so the protocol has exactly one definition. Do not add,
 * rename, or reorder fields without a coordinated protocol change across all
 * producers and consumers.
 */

/**
 * Raw temperature frame as emitted by the Arduino firmware over serial and
 * re-broadcast verbatim by device-service on the `temp` event. The firmware
 * prints string-quoted numbers (e.g. `{"Meat": "123.45", ...}`).
 */
export interface SerialReading {
  Meat: string;
  Meat2: string;
  Meat3: string;
  Chamber: string;
}

/**
 * A serial reading remapped into the snapshot/socket field naming, carrying the
 * client-injected timestamp. Temps stay strings; the client stamps the arrival
 * time locally (the serial frame has no clock).
 */
export interface ProbeReading {
  probeTemp1: string;
  probeTemp2: string;
  probeTemp3: string;
  chamberTemp: string;
  date: Date;
}

/**
 * The full live-session snapshot serialized onto the `events` socket message.
 * On the wire, `events` is a JSON *string* (not an object). Field order is the
 * shipped order and temps are strings; `date` is a {@link Date} that serializes
 * to an ISO-8601 string.
 */
export interface EventsSnapshot {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  probeTemp1: string;
  probeTemp2: string;
  probeTemp3: string;
  chamberTemp: string;
  smoking: boolean;
  date: Date;
}

/**
 * The numeric temperature DTO persisted via the HTTP batch endpoint
 * (`POST /temps/batch`). This is the third and final field naming for a single
 * reading: temps are parsed to real numbers and the reading's `date` is kept.
 */
export interface BatchTempDto {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
}

/**
 * The `smokeUpdate` payload. Unlike `events`, this rides the socket as a plain
 * *object* (never a JSON string). Exactly these five fields, in this order.
 */
export interface SmokeUpdate {
  smoking: boolean;
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
}

/**
 * The `events` payload after a JSON round-trip. Identical to
 * {@link EventsSnapshot} except `date` is the ISO-8601 string that survives
 * `JSON.parse` (there is no automatic `Date` revival on the wire).
 */
export interface EventsWireFrame {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  probeTemp1: string;
  probeTemp2: string;
  probeTemp3: string;
  chamberTemp: string;
  smoking: boolean;
  date: string;
}
