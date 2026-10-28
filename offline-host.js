/*
 * XNK — kapan layar "Catat offline" muncul (halaman pembungkus). Satu sumber di XNK; salinan di BookingPT-Client
 * dibuat oleh tools/sync-offline.js.
 * - Tanpa sinyal saat dibuka: layar offline langsung.
 * - Ada sinyal tapi aplikasi belum menyapa dalam 10 detik: tombol "Catat offline" (aplikasi tetap dicoba).
 * - "Sambung lagi" / sinyal kembali: muat ulang aplikasi; antrean diambil aplikasi lewat "offline-queue?".
 */
(function () {
  'use strict';
  var off = window.XNKOffline, app = document.getElementById('app'), ready = false;
  if (!off || !app) return;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  function reconnect() {
    if (navigator.onLine === false) return;
    off.hide(); off.hideOffer(); ready = false;
    app.src = app.src;   // muat ulang aplikasi
    setTimeout(function () { if (!ready) off.offerButton(); }, 10000);
  }
  off.onReconnect = reconnect;
  window.XNKOfflineHost = {
    appReady: function () {
      ready = true; off.hideOffer();
      var loader = document.getElementById('loader'); if (loader) loader.classList.add('done');
      if (off.isOpen() && !off.pending()) off.hide();
    }
  };
  if (navigator.onLine === false) off.show();
  else setTimeout(function () { if (!ready) off.offerButton(); }, 10000);
  window.addEventListener('offline', function () { if (!ready) off.show(); });
  window.addEventListener('online', function () { if (off.isOpen() && !ready) reconnect(); });
})();
