// PRIME AI Service Worker for PWA
const CACHE_NAME = 'prime-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through fetch for dynamic Firestore real-time websockets
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
