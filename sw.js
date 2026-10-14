// Service worker for סדרת חינוך · טבריה (Sadach2026)
// All apps on itairosenblum-hash.github.io share ONE origin, so caches are shared too.
// Everything here is namespaced to this app only: unique cache prefix, cleanup touches
// only our own caches, and we only handle requests inside /Sadach2026/.
const APP_PREFIX = 'sadach2026-chinuch-';
const CACHE_NAME = APP_PREFIX + 'v18';
const SCOPE_PATH = new URL('./', self.location).pathname; // "/Sadach2026/"

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './sadach-logistics.ics'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // Delete ONLY old caches of this app — never other apps' caches on the origin
        if (key.indexOf(APP_PREFIX) === 0 && key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignore anything outside this app (other repos on the origin, Firebase, Google APIs, CDNs)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(SCOPE_PATH) !== 0) return;

  // Network-first: always fresh content online, cached copy when offline
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {   // always revalidate — GitHub Pages caches pages for 10 min
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
