import { TempData } from 'temperaturechart/src/tempChart';
import { getDefaultApiClient } from '../api';

/**
 * @deprecated Thin shim over `getDefaultApiClient().temps`. No longer mutates
 * `axios.defaults`; failures reject with the typed {@link ApiError}.
 */
export const getCurrentTemps = (): Promise<TempData[]> => getDefaultApiClient().temps.getCurrent();

/** @deprecated Use `getDefaultApiClient().temps.postBatch(batch)` instead. */
export const postTempsBatch = (batch: TempData[]): Promise<void> =>
  getDefaultApiClient().temps.postBatch(batch);
