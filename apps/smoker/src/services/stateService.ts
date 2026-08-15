import { getDefaultApiClient } from '../api';
import type { SmokeProfile, State as ApiState } from '../api';

/**
 * The persisted state document. Re-exported from the API types so components
 * keep importing it from here unchanged while the shape lives in one place.
 */
export type State = ApiState;

/**
 * The current smoke profile shape. Kept as the legacy lowercase alias so the
 * existing component imports (`smokeProfile`) compile unchanged.
 */
export type smokeProfile = SmokeProfile;

/**
 * @deprecated Thin shim over `getDefaultApiClient().state`. No longer mutates
 * `axios.defaults`; failures reject with the typed {@link ApiError} instead of a
 * swallowed `undefined`.
 */
export const toggleSmoking = (): Promise<State> => getDefaultApiClient().state.toggleSmoking();

/** @deprecated Use `getDefaultApiClient().state.getState()` instead. */
export const getState = (): Promise<State> => getDefaultApiClient().state.getState();

/**
 * When the cook that is set up right now started, or `null` when nothing has
 * been started. Projected off the client's timeline read so the session port
 * adapter keeps importing every cloud read from this one place.
 *
 * A caller that already knows which smoke the state names (the session store
 * learns it from its own state load) passes the id and the stamp is read
 * directly; without one, the client composes the state read itself.
 */
export const getCookStart = async (smokeId?: string): Promise<Date | null> => {
  const client = getDefaultApiClient();
  const timeline = smokeId
    ? await client.timeline.getById(smokeId)
    : await client.timeline.getCurrent();
  return timeline?.startedAt ?? null;
};

/**
 * @deprecated Use `getDefaultApiClient().smokeProfile.getCurrent()` instead.
 * Returns the normalized profile (notes/woodType default to empty strings) and
 * rejects with the typed error on failure — the legacy swallow-and-resolve-
 * `undefined` path is gone.
 */
export const getCurrentSmokeProfile = async (): Promise<smokeProfile> => {
  const profile = await getDefaultApiClient().smokeProfile.getCurrent();
  return profile as smokeProfile;
};
