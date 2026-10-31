'use strict';
// The globals Bagikan.html expects from App.html, for the share editor running in an iframe of the app.
// Data and server calls come from the parent page (app.js) through postMessage; nothing here touches the network.
window.shareOn = true;
window.icon = n => ({ x: '✕', 'chevron-left': '‹', 'chevron-right': '›', 'chevron-down': '▾', 'chevron-up': '▴', plus: '+' }[n] || '');
window.openSheet = id => { const s = document.getElementById(id); if (s) s.classList.remove('hide'); };
window.closeModal = () => parent.postMessage({ xk: 'close' }, '*');
window.showToast = m => { const t = document.getElementById('share-toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(window.showToast.t); window.showToast.t = setTimeout(() => t.style.display = 'none', 3200); };
const pending = {};
let rid = 0;
const rpc = (fn, args) => new Promise((ok, no) => { const id = ++rid; pending[id] = { ok, no }; parent.postMessage({ xk: 'rpc', id, fn, args }, '*'); });
addEventListener('message', e => {
  if (e.source !== parent) return;
  const d = e.data || {};
  if (d.xk === 'open') {
    const src = d.src || {};
    src.loadPeriod = (p, o) => rpc('getMyShareData', [p, o || {}]);
    src.photoLoader = pid => rpc('getMyProgressPhoto', [pid]).then(r => r.dataUrl);
    window.shareOpen(d.kind, src, d.opts || {});
    // tidak ada data untuk dibagikan: editor tidak terbuka, tutup layar kosongnya setelah pesan terbaca
    if (document.getElementById('sheet-share').classList.contains('hide')) setTimeout(window.closeModal, 1500);
  } else if (d.xk === 'rpc-done' && pending[d.id]) {
    const p = pending[d.id]; delete pending[d.id];
    d.ok ? p.ok(d.data) : p.no(new Error(d.error || 'Gagal memuat.'));
  }
});
