/**
 * Frontend API module — the one way to talk to the backend.
 *
 * Ports & adapters: a tiny transport port is the only seam that knows HTTP
 * exists (production = axios adapter, tests = in-memory fake backend); a deep
 * typed client sits above it; a React provider/hook injects the client. The
 * app-agnostic pieces — the port, the typed `ApiError`, the axios adapter and
 * the fake-backend kernel — live in the shared `api-transport` package and are
 * re-exported here so call sites keep importing from one place.
 */
export type { CookStamp, StampTone } from './cookStamps';
export { DEFAULT_STAMPS, STAMP_TONES } from './cookStamps';
export type {
  AutoStopSettings,
  ChamberAlertSettings,
  CompletionEstimate,
  CompletionState,
  CookEvent,
  CurrentSmokeTimeline,
  MeatStat,
  NotificationSettings,
  PostSmoke,
  PreSmoke,
  ProbeTargetAlertSettings,
  ProbeTargetEntry,
  PushSubscriptionPayload,
  Smoke,
  SmokeCompleteAlertSettings,
  SmokeHistory,
  SmokeProfile,
  SmokeReview,
  SmokeTimeline,
  State,
  StatRecord,
  Stats,
  TargetPresets,
  TargetSource,
  TempData,
  WoodStat,
  rating,
} from './types';
export type { FaultInjection, HttpMethod, RecordedRequest, TransportPort } from 'api-transport/src';
export { ApiError, createHttpTransport } from 'api-transport/src';
export { PushNotConfiguredError } from './errors';
export type { SmokeEventPort } from './events';
export { noopEventPort } from './events';
export { createSocketEventPort, createSocketCookEventsSubscription } from './socketEventAdapter';
export type { FakeBackend, FakeBackendSeed, StoredSmokeProfile } from './fakeBackend';
export { createFakeBackend } from './fakeBackend';
export type {
  ApiClient,
  AutoStopResource,
  CookEventsResource,
  HistoryResource,
  NotificationsResource,
  PostSmokeResource,
  PreSmokeResource,
  RatingsResource,
  SmokeProfileResource,
  SmokeResource,
  StateResource,
  StatsResource,
  TempsResource,
  TimelineResource,
} from './client';
export {
  DEFAULT_AUTO_STOP_SETTINGS,
  createApiClient,
  createProductionApiClient,
  defaultNotificationSettings,
  getDefaultApiClient,
} from './client';
export { ApiClientProvider, useApiClient } from './ApiClientProvider';
export type { SnackbarNotifier, SnackbarProviderProps } from './SnackbarProvider';
export { SnackbarProvider, useApiSnackbar } from './SnackbarProvider';
export type { UseCurrentResourceOptions } from './useCurrentResource';
export { useCurrentResource } from './useCurrentResource';
export type { UseHistoryResult } from './useHistory';
export { useHistory } from './useHistory';
export type { UseReviewResult } from './useReview';
export { useReview } from './useReview';
export type {
  CookEventsSubscriptionPort,
  UseCookEventsOptions,
  UseCookEventsResult,
} from './useCookEvents';
export { useCookEvents } from './useCookEvents';
export type { StatsStatus, UseStatsResult } from './useStats';
export { useStats } from './useStats';
