/**
 * App-specific API errors.
 *
 * Transport-level failures are already typed as `ApiError` (status + body) in
 * the shared api-transport package. This module holds the errors the deep
 * client raises about the *domain* rather than the wire, so callers can branch
 * on a type instead of matching on a message string.
 */

/**
 * The backend served no VAPID public key: push is not set up on that
 * deployment. Distinct from a transient failure because the two need different
 * answers — this one is an operator misconfiguration that no retry will fix, so
 * the UI says so instead of showing a generic "try again" error.
 */
export class PushNotConfiguredError extends Error {
  constructor(message = 'Push notifications are not configured on the server.') {
    super(message);
    this.name = 'PushNotConfiguredError';
    // Required for `instanceof` to work when compiled down to ES5 (the
    // frontend's tsconfig target), where subclassing built-ins breaks the
    // prototype chain.
    Object.setPrototypeOf(this, PushNotConfiguredError.prototype);
  }
}
