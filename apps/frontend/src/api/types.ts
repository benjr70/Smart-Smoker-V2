/**
 * Shared frontend API domain (wire) types.
 *
 * This module is the single place API domain types live so that services never
 * import types from React components. Additional resource types are added here
 * as each migration slice lands.
 */
import { TempData } from 'temperaturechart/src/tempChart';
import { preSmoke } from '../components/common/interfaces/preSmoke';
import { rating } from '../components/common/interfaces/rating';

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
 * Pre-smoke domain type. Re-exported from the existing shared interface so the
 * service layer imports it from the API module instead of reaching into a
 * component tree.
 */
export type PreSmoke = preSmoke;

/**
 * Post-smoke domain type. Relocated here from the React step component (which
 * now re-exports it) so the service/client layer never imports from a component.
 */
export interface PostSmoke {
  restTime: string;
  steps: string[];
  notes?: string;
}

/**
 * A smoke rating. The canonical definition still lives with the other shared
 * component interfaces; it is re-exported here so API call sites depend only on
 * the API types module. The persisted `_id` rides along on a fetched document
 * and is stripped before the outbound DTO is sent (see the client's ratings
 * save projection).
 */
export type { rating };

/**
 * A single notification rule. Relocated here from the settings component so API
 * call sites depend only on the API types module; the component re-exports it
 * for backward compatibility. Rules fetched from the backend also carry a
 * persisted subdocument `_id`/`__v` (and a server-managed `lastNotificationSent`)
 * that are handled by the client's notifications save projection.
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
 * smoke is current and whether it is actively smoking. This is the canonical
 * definition; the legacy `components/common/interfaces/state` module re-exports
 * it so services and the client never import domain types from React land.
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
 * A history row: the denormalized summary the history list renders per smoke.
 * Canonical here so the client's history read stays free of component imports;
 * `components/common/interfaces/history` re-exports it as `smokeHistory`.
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
