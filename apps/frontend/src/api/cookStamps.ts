/**
 * The stamps a cook is logged with, as this app knows them.
 *
 * Restated here rather than imported from the backend, exactly as the socket
 * event names are: the backend ships as its own bundle beside no copy of
 * itself. The keys are the contract — an event is recorded and read back by
 * `stampKey`, never by label — so the two copies may drift in wording without
 * drifting in meaning.
 *
 * The catalogue is editable and arrives over the API; the defaults below are
 * what a client renders until it has been told otherwise — on first paint, and
 * on a deployment whose settings document predates the block.
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
 * The most stamps the catalogue may hold, as the backend enforces it. Restated
 * here so the editor can stop offering "+ Add stamp" before a save is refused,
 * rather than letting the user write a thirteenth and be told no.
 */
export const MAX_STAMPS = 12;

/** The longest label a button can carry, as the backend enforces it. */
export const MAX_STAMP_LABEL = 16;

/**
 * A catalogue as this app renders it: what the backend served, or the six
 * defaults when it served nothing.
 *
 * Nothing is repaired beyond that — the backend normalizes what it stores and
 * validates what it accepts, and a client second-guessing the served list would
 * show buttons that disagree with the ones the settings page is editing.
 */
export const normalizeStamps = (served: readonly CookStamp[] | null | undefined): CookStamp[] =>
  served && served.length > 0
    ? served.map(stamp => ({ ...stamp }))
    : DEFAULT_STAMPS.map(s => ({ ...s }));

/** The stamps a screen offers: the ones the user left switched on, in order. */
export const enabledStamps = (catalogue: readonly CookStamp[]): CookStamp[] =>
  catalogue.filter(stamp => stamp.enabled);

/** Crockford's base32 alphabet, as a ULID is spelled. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A fresh `custom-<ulid>` key.
 *
 * Minted on the client because the key has to exist before the list carrying it
 * is posted, and a ULID rather than a counter because two browsers adding a
 * stamp at the same moment must not mint one identity between them — that would
 * merge two different stamps' histories and neither user would be told.
 */
const newCustomStampKey = (): string => {
  const time = Date.now();
  let key = '';
  for (let index = 9; index >= 0; index -= 1) {
    key = CROCKFORD[Math.floor(time / 32 ** (9 - index)) % 32] + key;
  }
  for (let index = 0; index < 16; index += 1) {
    key += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return `custom-${key}`;
};

/** A user-added stamp as the editor starts it: named, coloured and on. */
export const newCustomStamp = (): CookStamp => ({
  key: newCustomStampKey(),
  label: 'New stamp',
  tone: 'amber',
  enabled: true,
  custom: true,
});

/** The catalogue entry for a key, or `undefined` when nothing carries it. */
const findStamp = (key: string, catalogue: readonly CookStamp[]): CookStamp | undefined =>
  catalogue.find(stamp => stamp.key === key);

/**
 * What an event logged under `key` is called now.
 *
 * The catalogue wins over the snapshot, so renaming a stamp renames every entry
 * and every marker ever logged under it; the snapshot is what keeps a
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

/**
 * Whether the catalogue is exactly the shipped one.
 *
 * What the settings page shows its Reset button by: offering to restore
 * defaults to somebody who is already on them is a button that does nothing.
 * Order counts, because reordering is one of the edits Reset undoes.
 */
export const isDefaultCatalogue = (catalogue: readonly CookStamp[]): boolean =>
  catalogue.length === DEFAULT_STAMPS.length &&
  catalogue.every((stamp, index) => {
    const shippedStamp = DEFAULT_STAMPS[index];
    return (
      stamp.key === shippedStamp.key &&
      stamp.label === shippedStamp.label &&
      stamp.tone === shippedStamp.tone &&
      stamp.enabled === shippedStamp.enabled
    );
  });
