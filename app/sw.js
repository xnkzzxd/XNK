// Cache-first untuk berkas app dan dua pustaka statis; panggilan ke Apps Script tidak pernah di-cache.
const V = 'xnk-app-v1';
const FILES = ['./', './index.html', './app.js', './manifest.webmanifest', '../foods/foods.min.json', '../exercises/exercises.min.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
