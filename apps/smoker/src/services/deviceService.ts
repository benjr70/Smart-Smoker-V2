import { getDefaultApiClient } from '../api';
import type { WifiManager } from '../api';

/**
 * WiFi credentials. Kept as the legacy lowercase alias so the existing
 * component imports (`wifiManager`) compile unchanged.
 */
export type wifiManager = WifiManager;

/**
 * @deprecated Thin shim over `getDefaultApiClient().device`. No longer mutates
 * `axios.defaults.baseURL` per call; the device-service base URL is bound once
 * inside the client's device transport. Returns `Promise<any>` to preserve the
 * legacy signature so the existing components compile unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectToWiFi = (creds: wifiManager): Promise<any> =>
  getDefaultApiClient().device.connectToWiFi(creds);

/** @deprecated Use `getDefaultApiClient().device.getConnection()` instead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getConnection = (): Promise<any> => getDefaultApiClient().device.getConnection();
