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
  CookEvent,
  ProbeTargetSetting,
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
export type { CookStamp, StampTone } from './cookStamps';
export {
  DEFAULT_STAMPS,
  STAMP_TONES,
  enabledStamps,
  isStampCatalogue,
  normalizeStamps,
  resolveStampLabel,
  resolveStampTone,
} from './cookStamps';
export type { WireCookEvent } from './cookEventFrames';
export { cookEventsFromWire } from './cookEventFrames';
export type { CookEventsSubscriptionPort, StampCatalogueSubscriptionPort } from './cookLogPorts';
export type {
  CookEventsReadPort,
  UseCookEventsOptions,
  UseCookEventsResult,
} from './useCookEvents';
export { useCookEvents } from './useCookEvents';
export type {
  StampCatalogueReadPort,
  UseStampCatalogueOptions,
  UseStampCatalogueResult,
} from './useStampCatalogue';
export { useStampCatalogue } from './useStampCatalogue';
export type {
  ApiClient,
  AppearanceResource,
  CookEventsResource,
  CookStampsResource,
  CompletionState,
  CookCompletionEstimate,
  CookServePlan,
  CookTimeline,
  CurrentCookTimeline,
  ServeVerdict,
  TimelineResource,
  StateResource,
  SmokeProfileResource,
  TempsResource,
  DeviceResource,
  ProbeTargetsResource,
  SessionResource,
} from './client';
export {
  DEFAULT_APPEARANCE_PREFERENCE,
  createApiClient,
  createProductionApiClient,
  getDefaultApiClient,
} from './client';
export type { SmokeEventPort } from './events';
export { noopEventPort } from './events';
export {
  createSocketCookEventsSubscription,
  createSocketEventPort,
  createSocketStampCatalogueSubscription,
} from './socketEventAdapter';
export { createSessionApi } from './sessionApiAdapter';
