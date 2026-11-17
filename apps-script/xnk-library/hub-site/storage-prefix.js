/* XNK hub: setiap coach punya penyimpanan browser sendiri walau semua ada di satu domain.
 * Browser memisahkan localStorage per DOMAIN, bukan per folder; tanpa ini token, salinan offline dan antrean catatan
 * coach A dan coach B saling menimpa. Skrip ini disisipkan INLINE di awal <head> setiap halaman coach oleh
 * tools/build-hub.js, sebelum skrip lain, dan memberi awalan "<slug>:" pada setiap kunci localStorage / sessionStorage.
 * "__SLUG__" diganti saat build. Aplikasi hanya memakai getItem / setItem / removeItem (dicek tests/hub.test.js).
 */
(function () {
  var P = '__SLUG__:';
  var S = Storage.prototype;
  var get = S.getItem, set = S.setItem, del = S.removeItem, nth = S.key, wipe = S.clear;
  var rawLen = Object.getOwnPropertyDescriptor(S, 'length').get;
  function mine(st) {
    var out = [], n = rawLen.call(st);
    for (var i = 0; i < n; i++) { var k = nth.call(st, i); if (k !== null && k.indexOf(P) === 0) out.push(k); }
    return out;
  }
  S.getItem = function (k) { return get.call(this, P + k); };
  S.setItem = function (k, v) { return set.call(this, P + k, v); };
  S.removeItem = function (k) { return del.call(this, P + k); };
  S.key = function (i) { var m = mine(this); return i >= 0 && i < m.length ? m[i].slice(P.length) : null; };
  S.clear = function () { var self = this; mine(this).forEach(function (k) { del.call(self, k); }); };
  Object.defineProperty(S, 'length', { configurable: true, get: function () { return mine(this).length; } });
})();
