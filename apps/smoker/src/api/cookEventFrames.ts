/**
 * The cook log as it travels: over HTTP and over the websocket alike.
 *
 * One module because it is one frame. The REST read and the `cookEventsUpdate`
 * announcement carry the very same rows — JSON dates as strings, temperatures
 * that may be absent — and a screen must not be able to tell which of the two
 * a list arrived on. Normalizing in both places from here is what guarantees
 * that.
 */
import { StampTone } from './cookStamps';
import { CookEvent } from './types';

/**
 * A cook event as JSON carries it: the moment is a string, since JSON has no
 * date, and a temperature the pit never reported is absent rather than null —
 * which is what the normalization below exists to settle.
 */
export type WireCookEvent = Omit<
  CookEvent,
  'at' | 'tone' | 'chamberTemp' | 'probe1Temp' | 'probe2Temp' | 'probe3Temp'
> & {
  at: string | Date;
  tone: string;
  chamberTemp?: number | null;
  probe1Temp?: number | null;
  probe2Temp?: number | null;
  probe3Temp?: number | null;
};

/** A moment off the wire, or `null` when it is not one. */
const asMoment = (value: string | Date | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const moment = value instanceof Date ? value : new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment;
};

/**
 * The log, normalized: every moment a `Date`, every unreported temperature
 * `null`, in the order the cook happened.
 *
 * The order is part of the shape, as it is for a temperature series. The log is
 * a sequence — markers along a chart, and the times printed on the buttons that
 * made them — and no screen should have to know which order the collection was
 * asked for. A row carrying no readable moment is dropped rather than plotted
 * at the epoch: an event nobody can place in the cook is worse than one that is
 * missing.
 */
export const cookEventsFromWire = (raw: WireCookEvent[] | null | undefined): CookEvent[] =>
  (raw ?? [])
    .map(event => ({ event, at: asMoment(event.at) }))
    .filter((row): row is { event: WireCookEvent; at: Date } => row.at !== null)
    .map(({ event, at }) => ({
      _id: event._id,
      smokeId: event.smokeId,
      stampKey: event.stampKey,
      label: event.label,
      tone: event.tone as StampTone,
      at,
      chamberTemp: event.chamberTemp ?? null,
      probe1Temp: event.probe1Temp ?? null,
      probe2Temp: event.probe2Temp ?? null,
      probe3Temp: event.probe3Temp ?? null,
    }))
    .sort((one, other) => one.at.getTime() - other.at.getTime());
