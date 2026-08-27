/**
 * The stamps a cook is logged with, as the touchscreen knows them.
 *
 * Restated here rather than imported from the backend or the web application,
 * exactly as the socket event names and the wire types beside them are: each of
 * the three ships as its own bundle beside no copy of the others. The keys are
 * the contract — an event is recorded and read back by `stampKey`, never by
 * label — so the copies may drift in wording without drifting in meaning.
 *
 * Only what a panel does with a catalogue is here. The stamps are added,
 * renamed, recoloured and reordered on a phone, so nothing that edits one has
 * any business on a screen with no keyboard: the touchscreen reads the
 * catalogue, draws the enabled stamps in order, and names what has been logged.
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
  /** Whether the stamp is offered. A disabled stamp keeps its history. */
  enabled: boolean;
  /** Whether the user added it: a default may be disabled but never removed. */
  custom: boolean;
}

/** A default stamp, spelled out so the six below read as a table. */
const shipped = (key: string, label: string, tone: StampTone): CookStamp => ({
  key,
  label,
  tone,
  enabled: true,
  custom: false,
});

/** The six stamps offered on a deployment nobody has configured. */
export const DEFAULT_STAMPS: readonly CookStamp[] = [
  shipped('wood', 'Added Wood', 'amber'),
  shipped('wrap', 'Wrapped', 'p1'),
  shipped('spritz', 'Spritzed', 'p2'),
  shipped('vent', 'Vent', 'chamber'),
  shipped('lid', 'Lid Open', 'sub'),
  shipped('sauce', 'Sauced', 'p3'),
];

/**
 * A catalogue as this panel renders it: what the backend served, or the six
 * defaults when it served nothing.
 *
 * Nothing is repaired beyond that — the backend normalizes what it stores and
 * validates what it accepts, and a client second-guessing the served list would
 * offer buttons that disagree with the ones the phone is editing.
 */
export const normalizeStamps = (served: readonly CookStamp[] | null | undefined): CookStamp[] =>
  served && served.length > 0
    ? served.map(stamp => ({ ...stamp }))
    : DEFAULT_STAMPS.map(stamp => ({ ...stamp }));

/**
 * Whether an announced frame is a catalogue this panel can draw buttons from.
 *
 * The one check, wherever a catalogue arrives from: the socket boundary rejects
 * a frame with it, and the hook holding the catalogue applies the same test to
 * whatever channel handed it one. A row of buttons drawn out of something that
 * is not a catalogue is a row nobody in the garage can put right.
 */
export const isStampCatalogue = (payload: unknown): payload is CookStamp[] =>
  Array.isArray(payload) &&
  payload.every(
    stamp =>
      typeof stamp === 'object' &&
      stamp !== null &&
      typeof (stamp as CookStamp).key === 'string' &&
      typeof (stamp as CookStamp).label === 'string'
  );

/** The stamps a screen offers: the ones the user left switched on, in order. */
export const enabledStamps = (catalogue: readonly CookStamp[]): CookStamp[] =>
  catalogue.filter(stamp => stamp.enabled);

/** The catalogue entry for a key, or `undefined` when nothing carries it. */
const findStamp = (key: string, catalogue: readonly CookStamp[]): CookStamp | undefined =>
  catalogue.find(stamp => stamp.key === key);

/**
 * What an event logged under `key` is called now.
 *
 * The catalogue wins over the snapshot, so renaming a stamp on a phone renames
 * every marker ever logged under it here; the snapshot is what keeps a
 * since-removed custom stamp's history legible rather than blank.
 */
export const resolveStampLabel = (
  key: string,
  snapshot: string,
  catalogue: readonly CookStamp[]
): string => findStamp(key, catalogue)?.label ?? snapshot;

/** The colour such an event is drawn in, resolved the same way. */
export const resolveStampTone = (
  key: string,
  snapshot: StampTone,
  catalogue: readonly CookStamp[]
): StampTone => findStamp(key, catalogue)?.tone ?? snapshot;
