const SW_VERSION = '2026-01-24-2';
const CACHE_NAME = `posture-checker-${SW_VERSION}`;
const FILES_TO_CACHE = [
  './',
  './index.html',
  './index.js',
  './stats.js',
  './statsUI.js',
  './styles.css',
  './login.html',
  './login.js',
  './login-styles.css',
  './manifest.json',
  './sw.js',
  './warning.mp3'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(evt.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      return fetch(evt.request)
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const respClone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, respClone));
          }
          return networkResp;
        })
        .catch(() => {
          if (cached) return cached;
          if (evt.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
