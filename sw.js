// Each installed version serves a complete offline copy from the same release.
const appRoot = self.registration.scope;
const cachePrefix = "bench-marx:" + appRoot + ":";
const cacheName = cachePrefix + "e17b55188fbf45";
const appFiles = ["index.html", "style.css", "model.js", "art.js", "ui.js", "actions.js", "manifest.webmanifest", "touch-icon.png", "icon-192.png", "icon-512.png"].map(name => new URL(name, appRoot).href);
const entry = new URL("index.html", appRoot).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(appFiles.map(url => new Request(url, {cache: "reload"})));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  const key = url.href === appRoot ? entry : url.href;
  if (!appFiles.includes(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    return cached || fetch(event.request);
  })());
});
