/**
 * Smoker API domain (wire) types.
 *
 * The single place the smoker's API domain types live so services never import
 * types from React components. The canonical smoke-session domain types
 * (`SmokeProfile`, `SmokingState`, `BatchTempDto`) are re-exported from the
 * shared `smoke-session` package so the port adapter and the client agree on
 * shapes; this module must never redefine them.
 */
import type { TempData } from 'temperaturechart/src/tempChart';
import type { BatchTempDto, SmokeProfile, SmokingState } from 'smoke-session';

export type { TempData, BatchTempDto, SmokeProfile, SmokingState };

/**
 * The persisted state document as returned by the backend `state` endpoints:
 * the current smoke id plus the smoking flag. The session port only cares about
 * `smoking`, but the legacy `getState`/`toggleSmoking` shims return the whole
 * document, so the full shape lives here.
 */
export interface State {
  smokeId: string;
  smoking: boolean;
}

/**
 * WiFi credentials posted to the device service. Relocated here from the
 * component-facing service so the client layer owns the shape; the service
 * re-exports it for backward compatibility.
 */
export interface WifiManager {
  ssid: string;
  password: string;
}
