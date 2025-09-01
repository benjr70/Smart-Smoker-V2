self.addEventListener('push', function (event) {
  if (event.data) {
    notification = JSON.parse(event.data.text());
  }
  const options = {
    body: notification.body,
    title: notification.title,
    icon: 'logo192.png',
    badge: 'logo192.png',
  };
  console.log('Push Notification', Notification.permission);
  event.waitUntil(self.registration.showNotification(notification.title, options));
});
