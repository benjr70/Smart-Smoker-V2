/**
 * Shared frontend API domain (wire) types.
 *
 * This module is the single place API domain types live so that services never
 * import types from React components. Additional resource types are added here
 * as each migration slice lands.
 */
import { TempData } from 'temperaturechart/src/tempChart';
import type { WeightUnits } from '../components/common/interfaces/enums';

export type { TempData };

/**
 * A smoke profile as seen by the frontend.
 *
 * The optional-on-the-wire `notes` and `woodType` fields are normalized to
 * empty strings inside the client's read path, so this domain type declares
 * them **non-optional**: callers never have to guard for `undefined`.
 */
export interface SmokeProfile {
  chamberName: string;
  probe1Name: string;
  probe2Name: string;
  probe3Name: string;
  notes: string;
  woodType: string;
}

/**
 * Pre-smoke domain type. Canonical here (the definition was relocated from the
 * component interface tree in the final cutover), so the client and every caller
 * import it from the API types module rather than reaching into a component.
 */
export interface PreSmoke {
  name?: string;
  meatType?: string;
  weight: {
    weight?: number;
    unit?: WeightUnits;
  };
  steps: string[];
  notes?: string;
}

/**
 * Post-smoke domain type. Canonical here (relocated from the React step
 * component in an earlier slice) so the service/client layer never imports a
 * domain type from a component.
 */
export interface PostSmoke {
  restTime: string;
  steps: string[];
  notes?: string;
}

/**
 * A smoke rating. Canonical here (relocated from the component interface tree in
 * the final cutover) so API call sites depend only on the API types module. The
 * persisted `_id` rides along on a fetched document and is stripped before the
 * outbound DTO is sent (see the client's ratings save projection).
 */
export interface rating {
  smokeFlavor: number;
  seasoning: number;
  tenderness: number;
  overallTaste: number;
  notes: string;
  _id?: string;
}

/**
 * The chamber Temperature Alert: whether it is on, and the range the chamber is
 * expected to hold. The alert stays silent until the chamber first reaches this
 * range, so the bounds describe the cook, not the preheat.
 */
export interface ChamberAlertSettings {
  enabled: boolean;
  low: number;
  high: number;
}

/**
 * One probe's row in the Probe Target Reached alert.
 *
 * Stored by `slot` and never by name, because a slot outlives a cook. `name` is
 * the display name the backend resolves from the active cook's smoke profile and
 * serves on the read — falling back to a generic slot label when nothing is set
 * up or the cook left that probe unnamed. It rides along on the read only; the
 * client's save projection strips it, and the backend rejects a save carrying it.
 */
export interface ProbeTargetEntry {
  slot: string;
  /** Whether this probe is being watched. */
  enabled: boolean;
  /** The temperature, °F, this probe's meat is done at. */
  target: number;
  name: string;
}

/** The Probe Target Reached alert: switched on as a whole, plus a row per probe. */
export interface ProbeTargetAlertSettings {
  enabled: boolean;
  probes: ProbeTargetEntry[];
}

/**
 * The notification settings document. Canonical here so API call sites depend
 * only on the API types module.
 *
 * It carries only what the user configures — the armed flags and fired markers
 * the server keeps while evaluating alerts live in a document of their own, and
 * never ride along on a save from the settings page. A document read back from
 * the backend also carries a persisted `_id`/`__v`, which the client's save
 * projection strips.
 */
export interface NotificationSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
}

/** The colour schemes the application can render in. */
export type ColorScheme = 'light' | 'dark';

/** What an operator can ask for: a fixed scheme, or "follow the device". */
export type AppearanceMode = ColorScheme | 'system';

/**
 * The installation-wide appearance preference as it goes over the wire: the
 * mode that was chosen, and what that choice resolved to on the client that
 * last wrote it.
 *
 * The resolved half is stored because a client with no colour preference of its
 * own cannot resolve "follow the device" — the touchscreen's browser reports
 * light whatever the garage looks like, so it reads this value instead of
 * asking. Declared here, alongside the other wire types, so the client and its
 * callers never import a domain type from the theme package through the API
 * layer; it is structurally the preference the shared appearance resolver reads
 * and writes.
 */
export interface AppearancePreference {
  mode: AppearanceMode;
  resolvedMode: ColorScheme;
}

/**
 * The application settings document: everything the installation configures,
 * whether or not it has anything to do with notifications.
 */
export interface ApplicationSettings {
  chamber: ChamberAlertSettings;
  probeTarget: ProbeTargetAlertSettings;
  appearance: AppearancePreference;
}

/**
 * The central smoke-session state singleton as seen by the frontend: which
 * smoke is current and whether it is actively smoking. Canonical here so
 * services and the client never import domain types from React land.
 */
export interface State {
  smokeId: string;
  smoking: boolean;
}

/**
 * The smoke aggregate root: a smoke owns its child documents by id
 * (pre-smoke, temperature series, post-smoke, profile, rating) plus its date
 * and lifecycle status. Mirrors the backend `Smoke` schema. Child ids are the
 * seam through which the delete cascade and review reads resolve the pieces.
 */
export interface Smoke {
  _id?: string;
  preSmokeId: string;
  tempsId: string;
  postSmokeId: string;
  smokeProfileId: string;
  ratingId: string;
  date: Date;
  status: number;
}

/**
 * The composed review read-model: a smoke parent plus its five resolved child
 * resources, the shape the history review screen renders. The deep client's
 * review-aggregate call fetches the parent, then the children in parallel, and
 * fills any absent piece with a typed default so a single missing child never
 * fails the whole read. Every field is non-optional: callers render it without
 * per-piece guards.
 */
export interface SmokeReview {
  smoke: Smoke;
  preSmoke: PreSmoke;
  smokeProfile: SmokeProfile;
  temps: TempData[];
  postSmoke: PostSmoke;
  rating: rating;
}

/**
 * A history row: the denormalized summary the history list renders per smoke.
 * Canonical here so the client's history read stays free of component imports.
 */
export interface SmokeHistory {
  name: string;
  meatType: string;
  weight: string;
  weightUnit: string;
  woodType: string;
  date: string;
  smokeId: string;
  overAllRating: string;
}

/**
 * A browser push subscription as it goes over the wire to
 * `notifications/subscribe` — the JSON form of the browser's `PushSubscription`
 * (`subscription.toJSON()`), which is exactly what the backend stores.
 */
export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
