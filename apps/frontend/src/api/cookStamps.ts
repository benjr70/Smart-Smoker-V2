/**
 * The stamps a cook is logged with, as this app knows them.
 *
 * Restated here rather than imported from the backend, exactly as the socket
 * event names are: the backend ships as its own bundle beside no copy of
 * itself. The keys are the contract — an event is recorded and read back by
 * `stampKey`, never by label — so the two copies may drift in wording without
 * drifting in meaning.
 *
 * This slice ships the defaults alone; the editable catalogue arrives later and
 * arrives over the API, which is why nothing below is a component's business.
 */

/** The colours a stamp may be drawn in. */
export const STAMP_TONES = ['chamber', 'p1', 'p2', 'p3', 'amber', 'sub'] as const;

export type StampTone = (typeof STAMP_TONES)[number];

export interface CookStamp {
  /** The stamp's stable identity, as the backend records it. */
  key: string;
  /** What the button says. Display only. */
  label: string;
  tone: StampTone;
}

/** The six stamps offered on a deployment nobody has configured. */
export const DEFAULT_STAMPS: readonly CookStamp[] = [
  { key: 'wood', label: 'Added Wood', tone: 'amber' },
  { key: 'wrap', label: 'Wrapped', tone: 'p1' },
  { key: 'spritz', label: 'Spritzed', tone: 'p2' },
  { key: 'vent', label: 'Vent', tone: 'chamber' },
  { key: 'lid', label: 'Lid Open', tone: 'sub' },
  { key: 'sauce', label: 'Sauced', tone: 'p3' },
];
