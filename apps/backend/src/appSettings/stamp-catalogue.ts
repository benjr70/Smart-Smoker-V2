/**
 * The stamps a cook is logged with: what they are called, what colour they are
 * drawn in, and how an event that carries one is read back.
 *
 * Pure and dependency-free on purpose. A stamp is an identity (`key`) with a
 * display label hanging off it, and both the backend that records an event and
 * every client that draws one have to agree about that identity — so the
 * agreement lives in one module with no persistence, no Nest and no DTOs in it.
 *
 * This slice ships the defaults alone; the editable catalogue stored on the
 * application settings document arrives later, and arrives *here*, which is why
 * every resolver already takes the catalogue it resolves against.
 */

/**
 * The colours a stamp may be drawn in — named for what each one already means
 * on the chart (the chamber's line, the three probes) plus two the chart does
 * not use, so a stamp can stand apart from every reading on screen.
 */
export const STAMP_TONES = [
  'chamber',
  'p1',
  'p2',
  'p3',
  'amber',
  'sub',
] as const;

export type StampTone = (typeof STAMP_TONES)[number];

/** One entry of the catalogue. */
export interface CookStamp {
  /**
   * The stamp's stable identity. Events are keyed by it and never by the
   * label, so renaming a stamp renames its history rather than orphaning it.
   */
  key: string;
  /** What the button and the log row say. Display only. */
  label: string;
  tone: StampTone;
  /** Whether the stamp is offered. A disabled stamp keeps its history. */
  enabled: boolean;
  /** Whether the user added it — a default may be disabled but never removed. */
  custom: boolean;
}

/**
 * The six stamps a pitmaster who has configured nothing gets, in the order the
 * buttons are laid out. Frozen: the exported defaults are the one copy of this
 * decision, and a caller that edited them in place would change what every
 * later reader sees.
 */
const DEFAULTS: readonly CookStamp[] = Object.freeze([
  {
    key: 'wood',
    label: 'Added Wood',
    tone: 'amber',
    enabled: true,
    custom: false,
  },
  { key: 'wrap', label: 'Wrapped', tone: 'p1', enabled: true, custom: false },
  {
    key: 'spritz',
    label: 'Spritzed',
    tone: 'p2',
    enabled: true,
    custom: false,
  },
  { key: 'vent', label: 'Vent', tone: 'chamber', enabled: true, custom: false },
  { key: 'lid', label: 'Lid Open', tone: 'sub', enabled: true, custom: false },
  { key: 'sauce', label: 'Sauced', tone: 'p3', enabled: true, custom: false },
]);

/** The keys of the six defaults, in catalogue order. */
export const DEFAULT_STAMP_KEYS: readonly string[] = DEFAULTS.map(
  (stamp) => stamp.key,
);

/** A fresh, editable copy of the default catalogue. */
export const defaultStamps = (): CookStamp[] =>
  DEFAULTS.map((stamp) => ({ ...stamp }));

/** The catalogue entry for a key, or `undefined` when nothing carries it. */
export const findStamp = (
  key: string,
  catalogue: readonly CookStamp[] = DEFAULTS,
): CookStamp | undefined => catalogue.find((stamp) => stamp.key === key);

/**
 * What an event logged under `key` is called now.
 *
 * The catalogue wins over the snapshot, so a rename applies to everything ever
 * logged under that stamp; the snapshot is what keeps a since-removed custom
 * stamp's history legible rather than blank.
 */
export const resolveLabel = (
  key: string,
  snapshot: string,
  catalogue: readonly CookStamp[] = DEFAULTS,
): string => findStamp(key, catalogue)?.label ?? snapshot;

/** The colour an event logged under `key` is drawn in, resolved the same way. */
export const resolveTone = (
  key: string,
  snapshot: StampTone,
  catalogue: readonly CookStamp[] = DEFAULTS,
): StampTone => findStamp(key, catalogue)?.tone ?? snapshot;
