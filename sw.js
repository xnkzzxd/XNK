/*
 * XNK — service worker halaman pembungkus. Hanya menyimpan halaman ini, layar "Catat offline", ikon, dan dua pustaka
 * statis (gerakan, makanan) supaya halaman bisa dibuka tanpa sinyal. Aplikasi Apps Script di iframe tidak disentuh.
 * Satu sumber di XNK; salinan di BookingPT-Client dibuat oleh tools/sync-offline.js.
 */
var CACHE = 'xnk-off-v1';
var SHELL = ['/', '/index.html', '/offline.js', '/offline-host.js', '/offline.css', '/manifest.webmanifest', '/favicon.ico', '/icon-192.png', '/apple-touch-icon.png'];
var LIBS = ['https://xnk.my.id/exercises/exercises.min.json', 'https://xnk.my.id/foods/foods.min.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Berkas yang tidak ada (mis. logo di salah satu situs) tidak menggagalkan pemasangan.
    return Promise.all(SHELL.concat(LIBS).map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('xnk-off-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Hanya halaman pembungkus; halaman lain (mis. /demo/) tidak boleh menimpa salinan '/'.
  if (req.mode === 'navigate' && url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Halaman: jaringan dulu (selalu versi terbaru), tanpa sinyal pakai salinan.
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('/', copy); });
      return res;
    }).catch(function () { return caches.match('/').then(function (r) { return r || caches.match('/index.html'); }); }));
    return;
  }
  var lib = LIBS.indexOf(url.origin + url.pathname) !== -1;
  if (lib || (url.origin === self.location.origin && SHELL.indexOf(url.pathname) !== -1)) {
    // Berkas statis: salinan dulu, lalu diperbarui di belakang.
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } return res; });
      if (hit) { net.catch(function () {}); return hit; }
      return net;
    }));
  }
});
