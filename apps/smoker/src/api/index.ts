/**
 * Smoker API module — the one way to talk to the cloud API and the local device
 * service.
 *
 * Ports & adapters: a tiny transport port is the only seam that knows HTTP
 * exists (production = axios adapter, tests = in-memory fake backend); a deep
 * typed client bound to two base URLs sits above it; a session adapter satisfies
 * the shared `smoke-session` port. The legacy service functions are thin shims
 * over the default client. The app-agnostic pieces — the port, the typed
 * `ApiError`, the axios adapter and the fake-backend kernel — live in the shared
 * `api-transport` package and are re-exported here so call sites keep importing
 * from one place.
 */
export type {
  AppearanceMode,
  AppearancePreference,
  BatchTempDto,
  ColorScheme,
  SmokeProfile,
  SmokingState,
  State,
  TempData,
  WifiManager,
} from './types';
export type { FaultInjection, HttpMethod, RecordedRequest, TransportPort } from 'api-transport/src';
export { ApiError, createHttpTransport } from 'api-transport/src';
export type { FakeBackend, FakeBackendSeed, StoredSmokeProfile } from './fakeBackend';
export { createFakeBackend } from './fakeBackend';
export type {
  ApiClient,
  AppearanceResource,
  StateResource,
  SmokeProfileResource,
  TempsResource,
  DeviceResource,
} from './client';
export {
  DEFAULT_APPEARANCE_PREFERENCE,
  createApiClient,
  createProductionApiClient,
  getDefaultApiClient,
} from './client';
export { createSessionApi } from './sessionApiAdapter';
