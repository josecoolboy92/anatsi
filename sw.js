// Offline cache: app files first, three.js from the CDN cached on first use.
const V = 'anatsi-v1';
const APP = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/util.js', 'js/core.js', 'js/carcass.js', 'js/models.js', 'js/cut.js', 'js/diagram.js', 'js/view3d.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // network first so updates arrive, cache when offline
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(req, c)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
  } else if (url.hostname.endsWith('jsdelivr.net')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(req, c)); return r; })));
  }
});
