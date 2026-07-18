import { WifiStatusPort } from 'smoke-session/src';
import { getConnection } from '../services/deviceService';

/**
 * The smoker-role wifi-status port, backed by the device-service connection
 * check. Resolves `true` when the device currently reports at least one wifi
 * network, mirroring the legacy home-screen `getConnection().length > 0` gate.
 * Only wired into the session at the composition root when wifi probing is
 * enabled (production), so the store never probes outside production.
 */
export function createWifiStatusAdapter(): WifiStatusPort {
  return {
    async getStatus(): Promise<boolean> {
      const connection = await getConnection();
      return Array.isArray(connection) && connection.length > 0;
    },
  };
}
