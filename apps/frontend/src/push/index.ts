/**
 * Browser push module — the one way the app touches push.
 *
 * Ports & adapters, mirroring `src/api`: a port declares what the app needs
 * from the browser (permission, subscription), a browser adapter is the only
 * module allowed to touch `navigator`/`Notification`/`PushManager`, and a React
 * provider injects the port so components can be tested against a fake.
 */
export type { PushPermission, PushPort } from './pushPort';
export { createBrowserPushPort, getDefaultPushPort } from './browserPushAdapter';
export type { PushPortProviderProps } from './PushPortProvider';
export { PushPortProvider, usePushPort } from './PushPortProvider';
export type { PushNotifications } from './usePushNotifications';
export { usePushNotifications } from './usePushNotifications';
export {
  BLOCKED_BANNER_BODY,
  BLOCKED_BANNER_TITLE,
  NOT_ENABLED_BANNER_ACTION,
  NOT_ENABLED_BANNER_BODY,
  NOT_ENABLED_BANNER_TITLE,
  UNSUPPORTED_BANNER_BODY,
  UNSUPPORTED_BANNER_TITLE,
} from './messages';
