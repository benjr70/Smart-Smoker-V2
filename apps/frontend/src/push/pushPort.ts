/**
 * Push port — the seam for the browser's push machinery.
 *
 * Service worker registration, `Notification.requestPermission()` and
 * `PushManager.subscribe()` are browser globals that a component test cannot
 * exercise without stubbing `navigator`/`window`. Rather than let the settings
 * components reach for them, they call this tiny injected port: production
 * supplies the browser-backed adapter (see browserPushAdapter), tests supply a
 * fake. Mirrors the {@link SmokeEventPort} pattern used for the client's one
 * websocket side-effect.
 */
import { PushSubscriptionPayload } from '../api/types';

/**
 * The outcome of asking for notification permission. `unsupported` is this
 * app's addition to the browser's three states: it means the browser has no
 * service worker or push support at all, which callers surface the same way as
 * a denial rather than crashing on a missing global.
 */
export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushPort {
  /**
   * The browser's current answer, without prompting: `default` when it has
   * never been asked, `granted`/`denied` once it has, `unsupported` when this
   * browser cannot do push at all. Synchronous because the browser exposes it
   * as a plain property — a component can read it while rendering, which is
   * what lets the blocked banner appear on mount rather than a tick later.
   */
  getPermission(): PushPermission;
  /**
   * Prompt for notification permission and resolve the resulting state. Must be
   * called from a user gesture — browsers ignore (or auto-deny) a prompt that
   * is not. Never rejects: an unsupported browser resolves `unsupported`.
   */
  requestPermission(): Promise<PushPermission>;
  /**
   * Register the service worker and subscribe this browser to push with the
   * given VAPID application server key, resolving the subscription in the wire
   * shape the backend stores. Rejects when registration or subscription fails
   * so the caller can surface it.
   */
  subscribe(applicationServerKey: string): Promise<PushSubscriptionPayload>;
}
