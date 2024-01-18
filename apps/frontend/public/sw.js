self.addEventListener('push', function(event) {
    const title = 'Push Notification';
    const options = {
      body: 'You have a new message!',
      // icon: 'images/icon.png',
      // badge: 'images/badge.png',
    };
    console.log('Push Notification', Notification.permission);
    event.waitUntil(self.registration.showNotification(title, options));
  });