/*
 * FrameLocal service worker (browser / PWA use only; the Android APK bundles its files locally).
 * Stale-while-revalidate: opens instantly offline, refreshes itself in the background when online.
 * Bump VERSION when you ship changes so old caches are dropped.
 * Made by Ashraf
 */
const VERSION = 'framelocal-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/utils.js',
  'js/db.js',
  'js/image.js',
  'js/native.js',
  'js/app.js',
  'vendor/tailwindcss-browser.js',
  'vendor/capacitor.js',
  'fonts/manrope-latin-wght-normal.woff2',
  'fonts/fraunces-latin-wght-normal.woff2',
  'fonts/fraunces-latin-wght-italic.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('index.html'));
      return cached || network;
    })
  );
});
