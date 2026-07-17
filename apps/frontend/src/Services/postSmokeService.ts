import { getDefaultApiClient } from '../api';
import { PostSmoke } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().postSmoke`) instead. These are
 * the remaining delegating shims that preserve the legacy swallow-and-log
 * semantics (catch, `console.log`, resolve `undefined`) for the by-id read and
 * delete still used by the history review screen and the delete cascade. They
 * will be deleted when those callers migrate in their own slices. The
 * current-document load/save shims were removed once the post-smoke form
 * migrated to the {@link useCurrentResource} hook.
 */
/** @deprecated Use `useApiClient().postSmoke.getById` instead. */
export const getPostSmokeById = async (id: string): Promise<PostSmoke> => {
  try {
    return await getDefaultApiClient().postSmoke.getById(id);
  } catch (error) {
    console.log(error);
    return undefined as unknown as PostSmoke;
  }
};

/** @deprecated Use `useApiClient().postSmoke.deleteById` instead. */
export const deletePostSmokeById = async (id: string): Promise<void> => {
  try {
    await getDefaultApiClient().postSmoke.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};
