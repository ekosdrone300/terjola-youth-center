importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCw5vnwCWalEe5AIFcXnsT7-AOnitT3BpI",
  authDomain: "terjola-center.firebaseapp.com",
  projectId: "terjola-center",
  storageBucket: "terjola-center.firebasestorage.app",
  messagingSenderId: "6937368256",
  appId: "1:6937368256:web:4334ccca4db6044a363f25"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// როცა საიტი ჩაკეცილია, ეკრანზე მესიჯის გამოტანა
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});