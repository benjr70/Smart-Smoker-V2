import { getDefaultApiClient } from '../api';
import { PostSmoke } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().postSmoke`) instead. These are
 * delegating shims that preserve the legacy swallow-and-log semantics (catch,
 * `console.log`, resolve `undefined`) until every caller has migrated, at which
 * point they will be deleted. The outbound DTO projection (strip persisted
 * `_id`/`__v`) now lives in the client's `postSmoke.saveCurrent`.
 */
export const getCurrentPostSmoke = async (): Promise<PostSmoke> => {
  try {
    return await getDefaultApiClient().postSmoke.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as PostSmoke;
  }
};

/** @deprecated Use `useApiClient().postSmoke.saveCurrent` instead. */
export const setCurrentPostSmoke = async (postSmoke: PostSmoke): Promise<PostSmoke | undefined> => {
  try {
    return await getDefaultApiClient().postSmoke.saveCurrent(postSmoke);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

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
