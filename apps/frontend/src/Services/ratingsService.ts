import { getDefaultApiClient } from '../api';
import { rating } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().ratings`) instead. These are
 * one-line delegating shims that preserve the legacy swallow-and-log semantics
 * (catch, `console.log`, resolve `undefined`) until every caller has migrated,
 * at which point they will be deleted. The create-vs-update routing and the
 * DTO-whitelist projection now live inside the client.
 */
export const getCurrentRatings = async (): Promise<rating> => {
  try {
    return await getDefaultApiClient().ratings.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as rating;
  }
};

/** @deprecated Use `useApiClient().ratings.save` (id-less create) instead. */
export const setCurrentRatings = async (rating: rating): Promise<rating> => {
  try {
    return await getDefaultApiClient().ratings.save({ ...rating, _id: undefined });
  } catch (error) {
    console.log(error);
    return undefined as unknown as rating;
  }
};

/** @deprecated Use `useApiClient().ratings.save` (with id -> update) instead. */
export const updateRatings = async (rating: rating): Promise<rating> => {
  try {
    return await getDefaultApiClient().ratings.save(rating);
  } catch (error) {
    console.log(error);
    return undefined as unknown as rating;
  }
};

/** @deprecated Use `useApiClient().ratings.deleteById` instead. */
export const deleteRatingsById = async (id: string): Promise<void> => {
  try {
    await getDefaultApiClient().ratings.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};
