const APP_CACHE = "miller-clash-shell-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./app.config.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-144x144.png",
  "./assets/icons/icon-192x192.png",
  "./assets/icons/icon-512x512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Only cache same-origin app shell files.
  // All external requests (Supabase, sports APIs) bypass the SW entirely so
  // data is always fresh — this prevents stale bets, balances, and match results.
  if (url.origin !== self.location.origin) return;

  // Network-first for app shell: always try to fetch the latest version.
  // Fall back to cache only when the user is offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
