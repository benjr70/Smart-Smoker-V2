/**
 * Smart Smoker service worker.
 *
 * Renders delivered pushes and brings the app to the front when one is tapped.
 * Kept dependency-free and copied verbatim into the build; exercised by
 * src/push/serviceWorker.test.ts, which loads this exact file.
 */

// The app's real icon, shipped from public/. The previous payload pointed at a
// placeholder path that does not exist, so notifications rendered with the
// browser's default glyph.
var APP_ICON = '/logo192.png';
var DEFAULT_TITLE = 'Smart Smoker';
var DEFAULT_BODY = 'Your smoker has an update.';
var APP_URL = '/';

function readPayload(event) {
  // A push can legitimately arrive with no data (some push services send an
  // empty "wake up" message). Reading it must never throw, or the worker dies
  // and every later notification is lost with it.
  if (!event || !event.data) {
    return {};
  }
  try {
    return JSON.parse(event.data.text()) || {};
  } catch (error) {
    return {};
  }
}

self.addEventListener('install', function () {
  // Don't sit in "waiting" behind the previous worker.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  // Take control of already-open tabs immediately, so an updated worker is not
  // stranded until every tab has been closed.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var payload = readPayload(event);
  var options = {
    body: payload.body || DEFAULT_BODY,
    icon: payload.icon || APP_ICON,
    badge: payload.badge || APP_ICON,
    data: { url: payload.url || APP_URL },
  };
  event.waitUntil(self.registration.showNotification(payload.title || DEFAULT_TITLE, options));
});

self.addEventListener('notificationclick', function (event) {
  if (event.notification && event.notification.close) {
    event.notification.close();
  }
  var data = (event.notification && event.notification.data) || {};
  var target = data.url || APP_URL;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        // Focus an app window that is already open rather than opening a second
        // one; only open a window when there is nothing to focus.
        for (var i = 0; i < windowClients.length; i += 1) {
          if (windowClients[i] && windowClients[i].focus) {
            return windowClients[i].focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
