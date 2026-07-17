/**
 * Smoker API module — the one way to talk to the cloud API and the local device
 * service.
 *
 * Ports & adapters: a tiny transport port is the only seam that knows HTTP
 * exists (production = axios adapter, tests = in-memory fake backend); a deep
 * typed client bound to two base URLs sits above it; a session adapter satisfies
 * the shared `smoke-session` port. The legacy service functions are thin shims
 * over the default client.
 */
export type {
  BatchTempDto,
  SmokeProfile,
  SmokingState,
  State,
  TempData,
  WifiManager,
} from './types';
export type { HttpMethod, TransportPort } from './transport';
export { ApiError } from './transport';
export { createHttpTransport } from './httpAdapter';
export type {
  FakeBackend,
  FakeBackendSeed,
  FaultInjection,
  RecordedRequest,
  StoredSmokeProfile,
} from './fakeBackend';
export { createFakeBackend } from './fakeBackend';
export type {
  ApiClient,
  StateResource,
  SmokeProfileResource,
  TempsResource,
  DeviceResource,
} from './client';
export { createApiClient, createProductionApiClient, getDefaultApiClient } from './client';
export { createSessionApi } from './sessionApiAdapter';
