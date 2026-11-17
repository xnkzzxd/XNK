// Service worker landing xnk.web.id: hanya halaman depan dan gambarnya (supaya bisa dipasang dan terbuka tanpa sinyal).
// Halaman coach (/<slug>/…) TIDAK disentuh: permintaan itu tidak dijawab di sini, jadi langsung ke jaringan atau ke
// service worker coach itu sendiri. Cache lain tidak pernah dihapus (awalan coach: "xnk-page-<slug>~").
var CACHE = 'xnk-hub-__HASH__';
var OWN = /^\/(|index\.html|manifest\.webmanifest|img\/[^/]+)$/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['/', '/manifest.webmanifest', '/img/icon-192.png']); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('xnk-hub-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !OWN.test(u.pathname)) return;
  var key = u.pathname === '/index.html' ? '/' : u.pathname;
  // Jaringan dulu (isi selalu terbaru), salinan bila tanpa sinyal.
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ca) { ca.put(key, c); }); }
    return r;
  }).catch(function () { return caches.match(key); }));
});
