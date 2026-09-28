// sw.js — Gestionnaire
// Cache-first pour les assets de l'app; chemins relatifs pour compatibilite GitHub Pages (sous-dossier).
const CACHE_NAME = "elimu-gestionnaire-v38";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./api.js", "./storage.js", "./sync.js", "./config.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png", "./assets/icon-512.png", "./assets/school-logo.png", "./assets/elimu-logo.png",
  "./assets/receipt-watermark.png", "./assets/receipt-stamp.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      ASSETS.map((a) => cache.add(a).catch(() => {}))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
