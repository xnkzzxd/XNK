/* XNK hub (T-2252): worker pembersih di alamat coach yang TIDAK AKTIF lagi (coach keluar; hub.json "inactive": true).
 * HP yang pernah membuka panel /<slug>/ atau portal /<slug>/klien/ masih punya service worker aplikasi lama yang bisa
 * menyajikan salinan aplikasi dari cache. Browser memeriksa berkas worker di alamat yang sama (/<slug>/sw-app.js,
 * /<slug>/klien/sw-app.js) setiap kali halaman di cakupan itu dibuka, lalu memasang berkas ini sebagai gantinya.
 * Tugasnya satu: menghapus cache halaman coach ini (nama berawalan PREFIX), melepas dirinya, lalu memuat ulang jendela yang
 * dikendalikannya, sehingga yang tampil adalah halaman "Situs coach ini tidak aktif lagi" dari jaringan.
 * Tanpa pengendali fetch: selama masih terpasang, semua permintaan langsung ke jaringan. localStorage tidak disentuh.
 * Nilai PREFIX (awalan cache xnk-page-<storageSlug>~panel|klien~) ditulis saat build oleh tools/build-hub.js.
 */
var PREFIX = __PREFIX__;

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () {
    return self.clients.claim();
  }).then(function () {
    return self.registration.unregister();
  }).then(function () {
    return self.clients.matchAll({ type: 'window' });
  }).then(function (list) {
    list.forEach(function (c) { if ('navigate' in c) c.navigate(c.url).catch(function () {}); });
  }).catch(function () {}));
});
