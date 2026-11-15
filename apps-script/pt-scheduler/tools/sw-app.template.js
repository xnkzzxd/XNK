/*
 * XNK — service worker halaman statis (Phase AAA). Dibuat oleh tools/build-static.js dari templat ini; jangan ubah hasilnya.
 * Menyimpan halaman, berkas berhash (tema, skrip, layar "Catat offline"), config.js, dan pustaka statis (gerakan, makanan,
 * peta otot, animasi gerakan) supaya halaman bisa dibuka tanpa sinyal. Aplikasi Apps Script (doPost) tidak disentuh.
 * Cakupan = folder tempat berkas ini berada; sw.js di akar (pembungkus lama) tetap terpisah dan tidak berubah.
 * Penyimpanan cache itu satu per origin dan dipakai bersama service worker lain (app/sw.js: 'xnk-app-v…', pembungkus lama:
 * 'xnk-off-…', salinan lain berkas ini di cakupan lain), jadi tiap worker hanya menghapus awalannya sendiri.
 */
var HASH = '__HASH__';
// Awalan cache mengikuti cakupan worker (akar dan /next/ menjalankan berkas ini bersamaan di origin yang sama dan tidak boleh
// saling menghapus cache): 'xnk-page-root-…', 'xnk-page-next-…'.
var PREFIX = 'xnk-page-' + (new URL(self.registration.scope).pathname.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root') + '-';
var CACHE = PREFIX + HASH;
var ASSETS = __ASSETS__;   // alamat relatif terhadap berkas ini
var LIBS = ['https://xnk.my.id/exercises/exercises.min.json', 'https://xnk.my.id/foods/foods.min.json',
  'https://xnk.my.id/figure/figure.min.json', 'https://xnk.my.id/figure/rig.min.json'];
var SCOPE = self.registration.scope;                       // mis. https://xnk.my.id/next/
function abs(u) { return new URL(u, SCOPE).href; }
var ASSET_URLS = ASSETS.map(abs);

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Satu berkas gagal tidak menggagalkan pemasangan.
    return Promise.all([SCOPE].concat(ASSET_URLS, LIBS).map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function swr(req, key) {
  return caches.match(key || req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key || req, copy); }); } return res; });
    if (hit) { net.catch(function () {}); return hit; }
    return net;
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var page = url.origin + url.pathname;
  // Halaman: jaringan dulu (selalu versi terbaru), tanpa sinyal pakai salinan (parameter ?view=... tidak membedakan salinan).
  if (req.mode === 'navigate' && url.origin === self.location.origin && (page === SCOPE || page === SCOPE + 'index.html')) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(SCOPE, copy); }); }
      return res;
    }).catch(function () { return caches.match(SCOPE); }));
    return;
  }
  if (ASSET_URLS.indexOf(page) !== -1) {
    // Berkas berhash tak pernah berubah isinya: salinan dulu. config.js (alamat server) diperbarui di belakang.
    if (/\/config\.js$/.test(page)) { e.respondWith(swr(req)); return; }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || fetch(req); }));
    return;
  }
  if (LIBS.indexOf(page) !== -1) e.respondWith(swr(req));
});

// ── Web Push (Fase X, docs/push) ──────────────────────────────────────────────
// Isi push dibuat server (Push.gs): judul dan isi pendek, hanya nama depan. Tidak ada data lain di dalamnya.
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  var title = String(d.title || 'XNK').slice(0, 80);
  var opts = { body: String(d.body || '').slice(0, 200), icon: '/icon-192.png', badge: '/icon-192.png', data: { url: String(d.url || '/') } };
  if (d.tag) opts.tag = String(d.tag).slice(0, 40);
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = SCOPE;
  try {
    var u = new URL((e.notification.data && e.notification.data.url) || '/', SCOPE);
    if (u.origin === self.location.origin) url = u.href;   // hanya alamat di situs ini
  } catch (x) {}
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(SCOPE) === 0 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
