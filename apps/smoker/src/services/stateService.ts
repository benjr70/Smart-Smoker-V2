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
 * @deprecated Use `getDefaultApiClient().smokeProfile.getCurrent()` instead.
 * Returns the normalized profile (notes/woodType default to empty strings) and
 * rejects with the typed error on failure — the legacy swallow-and-resolve-
 * `undefined` path is gone.
 */
export const getCurrentSmokeProfile = async (): Promise<smokeProfile> => {
  const profile = await getDefaultApiClient().smokeProfile.getCurrent();
  return profile as smokeProfile;
};
