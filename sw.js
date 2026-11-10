"use strict";

const cachePrefix = `harmonies-app-${self.registration.scope}-`;
const cacheName = `${cachePrefix}v1`;
const appFiles = [
  "./", "index.html", "leaderboard.html", "styles.css", "records.js", "script.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];
const appUrls = appFiles.map((file) => new URL(file, self.registration.scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appUrls)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  url.search = "";
  if (event.request.method !== "GET" || !appUrls.includes(url.href)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(event.request, { cacheName, ignoreSearch: true });
    if (cached) return cached;
    return Response.error();
  }));
});