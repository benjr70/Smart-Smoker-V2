# Push Notifications

## Set up

This app uses the [npm web push](https://www.npmjs.com/package/web-push) module

This requires you to generate VAPID keys. These keys are one time generated and stored in github secrets. to generate these key run this code and copy the printed keys
```
const vapidKeys = webpush.generateVAPIDKeys();

// Prints 2 URL Safe Base64 Encoded Strings
console.log(vapidKeys.publicKey, vapidKeys.privateKey);
```

Once that is done put those keys into your .env.local and you should be good to test

## How it works


In the frontend add on start up we:

1. The code checks if the serviceWorker property is in the navigator object. This is to ensure that the user's browser supports service workers.

2. If service workers are supported, the service worker file located at /sw.js is registered.

3. Once the service worker is registered successfully, the code checks if the PushManager property is in the window object. This is to ensure that the user's browser supports push notifications.

4. If push notifications are supported, the code subscribes to push notifications using the pushManager.subscribe method. The userVisibleOnly: true option means that the push subscription will only be used for messages whose effect is made visible to the user. The applicationServerKey is set to the result of the urlBase64ToUint8Array method called with the VAPID_PUBLIC_KEY environment variable. This key is used to identify your server to the push service.

5. Once the user is subscribed to push notifications, the subscription is sent to the server. This is done by making a POST request to the /notifications/subscribe endpoint on your server, with the subscription as the request body.

6. The backend server will then save the subscription into the DB if it is unique

7. In the events.gateway for the websocket lives our pushNotification function that will detect when and what to send as a push notification to the user 

