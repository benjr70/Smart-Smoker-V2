/**
 * Shared frontend API domain (wire) types.
 *
 * This module is the single place API domain types live so that services never
 * import types from React components. Additional resource types are added here
 * as each migration slice lands.
 */
import { TempData } from 'temperaturechart/src/tempChart';
import { preSmoke } from '../components/common/interfaces/preSmoke';

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
