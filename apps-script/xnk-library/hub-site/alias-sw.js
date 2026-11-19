/* XNK hub (T-2243): worker pengganti di alamat LAMA coach yang sudah ganti slug (xnk.web.id/<lama>/ → /<baru>/).
 * HP yang pernah membuka alamat lama masih punya service worker terdaftar di cakupan lama. Browser memeriksa berkas
 * worker itu (alamat yang sama: /<lama>/sw-app.js atau /<lama>/klien/sw-app.js) setiap kali halaman di cakupan itu
 * dibuka, lalu memasang berkas ini sebagai gantinya. Tugasnya:
 *   - membuka halaman: dari jaringan (halaman pengalih ke alamat baru); tanpa sinyal langsung dialihkan ke alamat baru,
 *     yang punya salinan offline sendiri;
 *   - notifikasi push: langganan lama terikat ke cakupan lama, jadi push yang masih dikirim ke langganan itu tetap tampil
 *     di sini, dan ketukannya membuka alamat baru. Judul yang sama (tag = jenis) menggantikan notifikasi dari langganan
 *     baru di alamat baru, jadi tidak tampil dua kali.
 * Cache tidak disentuh: awalan cache coach mengikuti storageSlug (tetap), milik worker di alamat baru.
 * "__TO__" dan "__ICON__" diganti saat build oleh tools/build-hub.js.
 */
var TO = __TO__;
var ICON = __ICON__;
var SCOPE = self.registration.scope;
var DEST = new URL(TO, self.location.origin).href;

/** Alamat di cakupan lama → alamat yang sama di cakupan baru (sisa jalur, ?query dan #hash ikut). */
function dest(u) {
  try {
    var x = new URL(u, SCOPE);
    if (x.origin !== self.location.origin || x.href.indexOf(SCOPE) !== 0) return DEST;
    return DEST + x.href.slice(SCOPE.length);
  } catch (e) { return DEST; }
}

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.mode !== 'navigate' || req.method !== 'GET' || req.url.indexOf(SCOPE) !== 0) return;
  e.respondWith(fetch(req).catch(function () { return Response.redirect(dest(req.url), 302); }));
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  var opts = { body: String(d.body || '').slice(0, 200), icon: ICON, badge: '/img/icon-192.png', data: { url: String(d.url || '/') } };
  if (d.tag) opts.tag = String(d.tag).slice(0, 40);
  e.waitUntil(self.registration.showNotification(String(d.title || 'XNK').slice(0, 80), opts));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var raw = (e.notification.data && e.notification.data.url) || '/';
  var url = raw === '/' ? DEST : dest(raw);
  if (url.indexOf(self.location.origin + '/') !== 0) url = DEST;   // hanya alamat di situs ini
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      // Jendela portal (<baru>/klien/) bukan milik panel <baru>/.
      if (list[i].url.indexOf(DEST) === 0 && list[i].url.indexOf(DEST + 'klien/') !== 0 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
