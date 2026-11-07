/*
 * XNK — "pembungkus" untuk halaman statis yang berdiri sendiri (Phase AAA, GitHub Pages).
 *
 * Di versi lama aplikasi berjalan di iframe Apps Script dan halaman pembungkus (index.html) mengukur zona aman
 * dan keyboard iPhone, mengatur warna bar Safari, dan menjadi tuan rumah layar "Catat offline". Halaman statis
 * tidak punya iframe, jadi berkas ini menjawab protokol pesan yang SAMA dari dalam halaman itu sendiri:
 * aplikasi (App.html: hostBridge, hostPostTheme, hostSend) mengirim ke window.top, yang di sini adalah window itu
 * sendiri, dan berkas ini membalas. Hanya pesan dari halaman yang sama dan origin yang sama yang dilayani,
 * tanpa token dan tanpa nomor WA. Di dalam bingkai (pembungkus lama) berkas ini tidak melakukan apa pun.
 *
 * Dimuat oleh tools/build-static.js sebelum skrip aplikasi, hanya untuk situs "app". Satu sumber di XNK.
 */
(function () {
  'use strict';
  if (window.top !== window) return;       // di dalam bingkai: pembungkus yang menjawab
  window.XNKHostLocal = true;              // dibaca App.html: jembatan host aktif walau tanpa iframe

  var root = document.documentElement;
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Layar tidak boleh "memantul" atau menarik-segarkan sendiri (pembungkus lama mengurung halaman di iframe tetap).
  var st = document.createElement('style');
  st.textContent = 'html,body{overscroll-behavior:none}';
  (document.head || root).appendChild(st);

  // Pengukur zona aman: padding dari env(); di level atas iOS memang memberi angka sungguhan.
  var probe = document.createElement('div');
  probe.id = 'sa-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  root.appendChild(probe);

  function standalone() {
    return navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function info() {
    var cs = getComputedStyle(probe), vv = window.visualViewport;
    // Keyboard = bagian halaman di bawah area yang terlihat (bukan saat dicubit-perbesar).
    var kb = vv && Math.abs(vv.scale - 1) < 0.01 ? root.clientHeight - vv.height - vv.offsetTop : 0;
    return {
      xnk: 'host', v: 1, ios: ios, standalone: standalone(),
      share: false,   // di level atas navigator.share dan clipboard dipanggil langsung oleh kartu bagikan
      insets: { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 },
      kb: Math.max(0, Math.round(kb))
    };
  }

  var asked = false, raf = 0;
  function send() {
    raf = 0;
    var d = info();
    // iOS kadang membiarkan halaman bergeser setelah keyboard menutup: kembalikan.
    if (!d.kb && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
    if (asked) try { window.postMessage(d, location.origin); } catch (e) {}
  }
  function queue() { if (!raf) raf = requestAnimationFrame(send); }

  // ── "Catat offline": sama dengan offline-host.js, tanpa iframe ───────────────────────────────────
  var ready = false, off = null;
  function offlineHost() {
    off = window.XNKOffline;
    if (!off) return;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      var sw = (window.XNK_CONFIG && window.XNK_CONFIG.sw) || '';
      if (sw) navigator.serviceWorker.register(sw).catch(function () {});
    }
    off.onReconnect = function () { if (navigator.onLine !== false) location.reload(); };
    if (navigator.onLine === false) off.show();
    else setTimeout(function () { if (!ready) off.offerButton(); }, 10000);
    window.addEventListener('offline', function () { if (!ready) off.show(); });
    window.addEventListener('online', function () { if (off.isOpen() && !ready) off.onReconnect(); });
  }
  function appReady() {
    ready = true;
    if (!off) return;
    off.hideOffer();
    if (off.isOpen() && !off.pending()) off.hide();
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data) return;   // hanya dari halaman ini sendiri
    var x = e.data.xnk;
    if (x === 'host?') { asked = true; send(); appReady(); }
    else if (typeof x === 'string' && x.indexOf('offline-') === 0) { if (window.XNKOffline) window.XNKOffline.message(e); }
    else if (x === 'theme' && /^#[0-9a-f]{6}$/i.test(e.data.color || '')) {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', e.data.color);
      root.style.background = e.data.color;
      if (document.body) document.body.style.background = e.data.color;
    }
    else if (x === 'share' || x === 'copy') { try { window.postMessage({ xnk: x + '-done', ok: false }, location.origin); } catch (er) {} }
  });
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', function () { setTimeout(queue, 300); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queue);
    window.visualViewport.addEventListener('scroll', queue);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', offlineHost);
  else offlineHost();
})();
