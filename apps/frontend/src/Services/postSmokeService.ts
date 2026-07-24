import { getDefaultApiClient } from '../api';

/**
 * @deprecated Use the API client (`useApiClient().postSmoke`) instead. This is
 * the remaining delegating shim that preserves the legacy swallow-and-log
 * semantics (catch, `console.log`, resolve `undefined`) for the by-id delete.
 * The by-id read shim was removed once the history review screen migrated to the
 * {@link useReview} hook; the current-document load/save shims were removed once
 * the post-smoke form migrated to the {@link useCurrentResource} hook.
 */
/** @deprecated Use `useApiClient().postSmoke.deleteById` instead. */
export const deletePostSmokeById = async (id: string): Promise<void> => {
  try {
    await getDefaultApiClient().postSmoke.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};
