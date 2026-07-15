import { WireDecodeError } from './errors';
import {
  BatchTempDto,
  EventsSnapshot,
  EventsWireFrame,
  ProbeReading,
  SerialReading,
  SmokeUpdate,
} from './types';

/**
 * The single quarantine point for the frozen wire protocol. Every
 * `JSON.parse`, `JSON.stringify`, and `parseFloat` that touches a protocol
 * payload lives in this module and nowhere else in the package.
 */

/**
 * Decode a raw serial frame into a {@link ProbeReading}.
 *
 * Maps the firmware's `Meat`/`Meat2`/`Meat3`/`Chamber` fields onto the
 * snapshot probe fields and stamps the caller-supplied timestamp. Rejects
 * malformed input deterministically (never a partial reading): a frame that is
 * not valid JSON, or that is missing any of the four temperature fields, throws
 * rather than returning half a reading.
 */
export function decodeSerialReading(raw: string, date: Date): ProbeReading {
  let parsed: Partial<SerialReading>;
  try {
    parsed = JSON.parse(raw) as Partial<SerialReading>;
  } catch (cause) {
    throw new WireDecodeError(`serial frame is not valid JSON: ${raw}`, {
      cause,
    });
  }

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    parsed.Meat === undefined ||
    parsed.Meat2 === undefined ||
    parsed.Meat3 === undefined ||
    parsed.Chamber === undefined
  ) {
    throw new WireDecodeError(`serial frame is missing a temperature field: ${raw}`);
  }

  return {
    probeTemp1: parsed.Meat,
    probeTemp2: parsed.Meat2,
    probeTemp3: parsed.Meat3,
    chamberTemp: parsed.Chamber,
    date,
  };
}

/**
 * Encode a live-session snapshot into the frozen `events` payload: a JSON
 * *string* whose fields appear in the shipped order, with string temps, a
 * boolean `smoking`, and `date` as an ISO-8601 string. The object is rebuilt
 * field-by-field so the serialized key order never depends on the caller's
 * object shape.
 */
export function encodeEvents(snapshot: EventsSnapshot): string {
  return JSON.stringify({
    chamberName: snapshot.chamberName,
    probe1Name: snapshot.probe1Name,
    probe2Name: snapshot.probe2Name,
    probe3Name: snapshot.probe3Name,
    probeTemp1: snapshot.probeTemp1,
    probeTemp2: snapshot.probeTemp2,
    probeTemp3: snapshot.probeTemp3,
    chamberTemp: snapshot.chamberTemp,
    smoking: snapshot.smoking,
    date: snapshot.date,
  });
}

/**
 * Decode an `events` payload string back into its wire frame. `date` remains
 * the ISO-8601 string it was serialized as (there is no automatic `Date`
 * revival), so this is the exact inverse of {@link encodeEvents} up to that
 * projection. Throws {@link WireDecodeError} on non-JSON input.
 */
export function decodeEvents(payload: string): EventsWireFrame {
  try {
    return JSON.parse(payload) as EventsWireFrame;
  } catch (cause) {
    throw new WireDecodeError(`events payload is not valid JSON: ${payload}`, {
      cause,
    });
  }
}

/**
 * Build the `smokeUpdate` payload — the single source of the five-field update
 * object broadcast on both a smoking toggle and a probe rename. Returns a plain
 * object (the wire envelope for this event is an object, not a JSON string) and
 * copies only the five frozen fields, so no extra property on the caller's
 * input can ever drift onto the wire.
 */
export function buildSmokeUpdate(update: SmokeUpdate): SmokeUpdate {
  return {
    smoking: update.smoking,
    chamberName: update.chamberName,
    probe1Name: update.probe1Name,
    probe2Name: update.probe2Name,
    probe3Name: update.probe3Name,
  };
}

/**
 * Map a probe reading to the numeric batch DTO persisted over HTTP. String
 * temps are parsed to floats (the only place `parseFloat` is applied to a
 * protocol value) and the reading's `date` is carried through unchanged.
 */
export function toBatchDto(reading: ProbeReading): BatchTempDto {
  return {
    ChamberTemp: parseFloat(reading.chamberTemp),
    MeatTemp: parseFloat(reading.probeTemp1),
    Meat2Temp: parseFloat(reading.probeTemp2),
    Meat3Temp: parseFloat(reading.probeTemp3),
    date: reading.date,
  };
}
