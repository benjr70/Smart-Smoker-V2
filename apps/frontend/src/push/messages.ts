/**
 * Everything push says to the user, in one place.
 *
 * The same three states — blocked, unsupported, server not configured — are
 * reachable from both the alert toggles and the test button, and a user who
 * meets one of them twice should not be told two different things about it.
 */

/** Snackbar copy for a permission that turned out to be denied mid-flow. */
export const BLOCKED_MESSAGE =
  'Notifications are blocked. Allow notifications for this site in your browser settings.';
export const UNSUPPORTED_MESSAGE = 'This browser does not support push notifications.';
export const TEST_FAILED_MESSAGE = 'Could not send a test notification.';
export const SUBSCRIBE_FAILED_MESSAGE =
  'Could not turn on notifications in this browser. The alert is saved, so try again.';
/**
 * The server has no VAPID key pair: a misconfiguration no retry will fix, so it
 * is worth its own message rather than the generic failures above.
 */
export const NOT_CONFIGURED_MESSAGE =
  'Push notifications are not set up on the server. Check its VAPID key configuration.';
/**
 * The send was accepted but delivered to nobody. The backend only logs a push
 * service rejection (a mismatched VAPID private key, or a 5xx) and answers 200
 * with a zero count, so without this the user would see no notification, no
 * error, and no way to tell the two apart.
 */
export const NOT_DELIVERED_MESSAGE =
  'The test notification reached no browsers. Check the server push configuration.';

/**
 * The inline banner shown in the notifications card when the browser is
 * blocking us. It has to carry recovery instructions: a user in this state has
 * no way back from inside the page, and the browser gives no hint where the
 * switch is.
 */
export const BLOCKED_BANNER_TITLE = 'Notifications are blocked';
export const BLOCKED_BANNER_BODY =
  'Your browser is blocking notifications for this site, so these alerts will not reach you. ' +
  'To unblock, open the padlock or site-settings icon next to the address bar, set ' +
  'Notifications to Allow, then reload this page. Your alert settings are saved either way.';

/**
 * The inline banner shown when an alert is switched on but this browser has
 * never been asked for permission. Alert settings are one document for the whole
 * smoker, so an alert switched on elsewhere arrives already on here, with no
 * off→on toggle left to carry the permission prompt — this banner is the gesture
 * instead, and without it such a browser could never be subscribed.
 */
export const NOT_ENABLED_BANNER_TITLE = 'This browser is not set up for notifications yet';
export const NOT_ENABLED_BANNER_BODY =
  'Your alerts are switched on, but this browser has not been asked whether it may show ' +
  'notifications, so nothing will reach you here until it is.';
export const NOT_ENABLED_BANNER_ACTION = 'Turn on notifications';

/** The inline banner shown when the browser has no push support at all. */
export const UNSUPPORTED_BANNER_TITLE = 'This browser cannot show notifications';
export const UNSUPPORTED_BANNER_BODY =
  'It has no support for push notifications, so these alerts will not reach you here. ' +
  'Your settings are still saved, and alerts will arrive in a browser that supports them.';
