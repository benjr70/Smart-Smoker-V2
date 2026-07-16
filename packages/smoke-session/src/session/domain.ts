/**
 * Session-level domain types shared by the store, its ports, and the shipped
 * fakes. These are the app-facing shapes (profile draft, smoking state, probe
 * names); the byte-level wire shapes live in `../wire`.
 */

/**
 * A smoke profile as the session cares about it: the four probe/chamber names
 * plus the free-text notes and wood type. Mirrors the frontend `SmokeProfile`
 * domain type — notes and wood type are non-optional (normalized to empty
 * strings by the API adapter) so the store never guards for `undefined`.
 */
export interface SmokeProfile {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  notes: string;
  woodType: string;
}

/** The persisted smoking flag, as returned by the state endpoints. */
export interface SmokingState {
  smoking: boolean;
}

/**
 * Explicit session role. `monitor` is the web viewer/editor (this slice);
 * `smoker` is the touchscreen device host (a later slice). The role is passed
 * in configuration, never inferred from which ports happen to be present.
 */
export type SessionRole = 'monitor' | 'smoker';

/**
 * Which name the {@link import('./store').SessionStore.setName} command edits.
 * One command target replaces the four copy-pasted host rename clones.
 */
export type NameTarget = 'chamber' | 'probe1' | 'probe2' | 'probe3';

/** Where a surfaced startup/runtime failure originated. */
export type SessionErrorSource = 'profile' | 'state' | 'temps';

/**
 * A startup or load failure surfaced honestly in the snapshot instead of being
 * swallowed by `console.log`. `message` is the human-readable cause.
 */
export interface SessionError {
  source: SessionErrorSource;
  message: string;
}

/** The four names the session starts with when no profile has been saved yet. */
export const DEFAULT_PROBE_NAMES = {
  chamberName: 'Chamber',
  probe1Name: 'probe 1',
  probe2Name: 'probe 2',
  probe3Name: 'probe 3',
} as const;
