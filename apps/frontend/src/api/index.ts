/**
 * Frontend API module — the one way to talk to the backend.
 *
 * Ports & adapters: a tiny transport port is the only seam that knows HTTP
 * exists (production = axios adapter, tests = in-memory fake backend); a deep
 * typed client sits above it; a React provider/hook injects the client.
 */
export type {
  NotificationSettings,
  PostSmoke,
  PreSmoke,
  Smoke,
  SmokeHistory,
  SmokeProfile,
  State,
  TempData,
  rating,
} from './types';
export type { HttpMethod, TransportPort } from './transport';
export { ApiError } from './transport';
export { createHttpTransport } from './httpAdapter';
export type { SmokeEventPort } from './events';
export { noopEventPort } from './events';
export { createSocketEventPort } from './socketEventAdapter';
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
  HistoryResource,
  NotificationsResource,
  PostSmokeResource,
  PreSmokeResource,
  RatingsResource,
  SmokeProfileResource,
  SmokeResource,
  StateResource,
  TempsResource,
} from './client';
export { createApiClient, createProductionApiClient, getDefaultApiClient } from './client';
export { ApiClientProvider, useApiClient } from './ApiClientProvider';
