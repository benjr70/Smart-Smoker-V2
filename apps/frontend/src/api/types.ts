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
 * A single notification rule. Canonical here (relocated from the settings
 * component in an earlier slice) so API call sites depend only on the API types
 * module. Rules fetched from the backend also carry a persisted subdocument
 * `_id`/`__v` (and a server-managed `lastNotificationSent`) that are handled by
 * the client's notifications save projection.
 */
export interface NotificationSettings {
  type: boolean;
  message: string;
  probe1: string;
  op: string;
  probe2?: string;
  offset?: number;
  temperature?: number;
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
