import { TempData } from 'temperaturechart/src/tempChart';
import { getDefaultApiClient } from '../api';

/**
 * @deprecated Use the API client (`useApiClient().temps`) instead. These are
 * one-line delegating shims that preserve the legacy swallow-and-log semantics
 * (catch, `console.log`, resolve `undefined`) until every caller has migrated,
 * at which point they will be deleted.
 */
export const getCurrentTemps = async (): Promise<TempData[]> => {
  try {
    return await getDefaultApiClient().temps.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as TempData[];
  }
};

/** @deprecated Use `useApiClient().temps.getById` instead. */
export const getTempsById = async (id: string): Promise<TempData[]> => {
  try {
    return await getDefaultApiClient().temps.getById(id);
  } catch (error) {
    console.log(error);
    return undefined as unknown as TempData[];
  }
};

/** @deprecated Use `useApiClient().temps.deleteById` instead. */
export const deleteTempsById = async (id: string): Promise<void> => {
  try {
    await getDefaultApiClient().temps.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};
