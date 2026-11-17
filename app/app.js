'use strict';
// XNK Catat: app klien mandiri, tampilan ala Hevy. Data di IndexedDB (cadangan localStorage),
// antrian dikirim ke Apps Script lewat doPost. Semua catatan jalan tanpa sinyal.
const EXEC = 'https://script.google.com/macros/s/AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => Math.round(Number(n) || 0).toLocaleString('id-ID');
const fmt1 = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('id-ID');
const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
const MEALS = [['sarapan', 'Sarapan'], ['siang', 'Makan siang'], ['malam', 'Makan malam'], ['camilan', 'Camilan']];
const MEAL_ALIAS = { sahur: 'sarapan', buka: 'malam' };
const DAYS = ['S', 'S', 'R', 'K', 'J', 'S', 'M'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const dShort = iso => { const p = String(iso).split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] : esc(iso); };

// ── Ikon (garis, tanpa unduhan: app harus jalan offline) ─────────────────────────────
const IC = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  food: '<path d="M4 3v8a2 2 0 0 0 2 2v8M8 3v8M6 3v4M16 21V3c2.5 1.5 4 4 4 8h-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="m9.5 13 2 2 3.5-3.5"/>',
  cloudOff: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="M3 3l18 18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m6 15 6-6 6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  chart: '<path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  alert: '<path d="M12 3 2 21h20zM12 10v4M12 18h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 3-3 4-3 4s-1-3-3-5c0 4-4 6-4 10 0 4 3 7 7 7z"/>'
};
const ic = n => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>';

// ── Penyimpanan: satu objek di memori, ditulis ke IndexedDB (atau localStorage kalau IDB tidak ada) ──
const mem = {};
let idb = null;
function kvOpen() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('xnk-catat', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => {
        idb = r.result;
        const g = idb.transaction('kv').objectStore('kv').openCursor();
        g.onsuccess = () => { const c = g.result; if (c) { mem[c.key] = c.value; c.continue(); } else res(); };
        g.onerror = () => { idb = null; res(); };
      };
      r.onerror = () => res();
    } catch (e) { res(); }
  }).then(() => {
    if (!idb) Object.keys(localStorage).filter(k => k.startsWith('x_')).forEach(k => { try { mem[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} });
    else ['x_token', 'x_more', 'x_queue', 'x_draft'].forEach(k => { // pindah sekali dari versi lama (localStorage)
      if (mem[k] === undefined && localStorage.getItem(k) != null) { try { kvSet(k, JSON.parse(localStorage.getItem(k))); } catch (e) {} localStorage.removeItem(k); }
    });
  });
}
function kvSet(k, v) {
  if (v === undefined || v === null) delete mem[k]; else mem[k] = v;
  if (idb) { try { const st = idb.transaction('kv', 'readwrite').objectStore('kv'); if (v == null) st.delete(k); else st.put(v, k); } catch (e) {} }
  else { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Penyimpanan perangkat penuh.'); } }
}
const kv = (k, d) => (mem[k] === undefined ? d : mem[k]);

let token, more, queue, failed, draft, delIds;
let lib = { ex: null, food: null };
const photoCache = {};   // dataUrl foto hanya di memori, tidak disimpan (foto bersifat privat)

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
function haptic(ms) {
  try { const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics; if (H) { H.impact({ style: ms > 30 ? 'MEDIUM' : 'LIGHT' }); return; } } catch (e) {}
  try { navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {}
}

// ── API ────────────────────────────────────────────────────────────────────
async function api(fn, ...args) {
  const r = await fetch(EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error); e.auth = !!j.auth; e.server = true; throw e; }
  return j.data;
}

// ── Antrian + sinkron ────────────────────────────────────────────────────────
const qSave = () => kvSet('x_queue', queue);
const fSave = () => kvSet('x_failed', failed);
const saveMore = () => kvSet('x_more', more);
function enqueue(fn, args) { queue.push({ id: uid(), fn, args }); qSave(); render(); sync(); }

let syncing = false;
async function sync(manual) {
  if (!token || syncing || !navigator.onLine) { if (manual) toast('Tidak ada sinyal.'); return; }
  syncing = true; chrome();
  try {
    while (queue.length) {
      const q = queue[0];
      try { await api(q.fn, token, ...q.args); }
      catch (e) {
        if (!e.server || e.auth) throw e;                     // jaringan / balasan rusak / sesi: berhenti, coba lagi nanti
        if (!(q.fn === 'deleteMyFood' && /tidak ditemukan/.test(e.message))) {   // hapus yang sudah terhapus bukan masalah
          failed.push({ id: q.id, fn: q.fn, args: q.args, error: e.message, at: Date.now() }); fSave();
          toast('Ditolak server. Lihat Profil → Pengaturan.');
        }
      }
      queue.shift(); qSave();
    }
    more = await api('getPortalMore', token); saveMore();
    delIds = []; kvSet('x_del', delIds);
    kvSet('x_synced', Date.now());
    if (manual) toast('Tersinkron.');
  } catch (e) {
    if (e.auth) { logout(); toast('Sesi berakhir. Masuk lagi.'); }
  } finally { syncing = false; render(); }
}
function logout() { remindApply(null); ['x_name', 'x_remind', 'x_token', 'x_more', 'x_queue', 'x_failed', 'x_draft', 'x_del', 'x_lastw', 'x_synced'].forEach(k => kvSet(k, null)); token = more = draft = null; queue = []; failed = []; delIds = []; nav.stack = []; nav.tab = 'home'; render(); }
addEventListener('online', () => sync());
addEventListener('offline', () => render());

// ── Pustaka (di-cache service worker) ────────────────────────────────────────────
async function loadLib(k) {
  if (lib[k]) return lib[k];
  const url = k === 'ex' ? '../exercises/exercises.min.json' : '../foods/foods.min.json';
  try { lib[k] = (await (await fetch(url)).json()).items; } catch (e) { lib[k] = []; toast('Daftar belum bisa dimuat.'); }
  return lib[k];
}

// ── Navigasi: tab + tumpukan layar; tombol back HP menutup sheet lalu layar teratas ──────────
const nav = { tab: 'home', stack: [] };
let sheetOn = false;
const wide = () => matchMedia('(min-width: 760px)').matches;
const topV = () => nav.stack[nav.stack.length - 1] || { v: nav.tab };
function go(v, p) { nav.stack.push({ v, p: p || {} }); history.pushState({ x: 1 }, ''); render(); scrollTo(0, 0); }
function back() { history.back(); }
function setTab(t) { nav.tab = t; nav.stack = []; closeSheet(true); render(); scrollTo(0, 0); }
addEventListener('popstate', () => {
  if (sheetOn) { hideSheet(); return; }
  if (nav.stack.length) { nav.stack.pop(); render(); }
});
matchMedia('(min-width: 760px)').addEventListener('change', () => render());

function openSheet(html, tall) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet${tall ? ' tall' : ''}" role="document"><div class="grab"></div>${html}</div>`;
  el.classList.remove('hide');
  if (!sheetOn) { sheetOn = true; history.pushState({ x: 1 }, ''); }
}
function hideSheet() { sheetOn = false; $('#sheet').classList.add('hide'); $('#sheet').innerHTML = ''; }
function closeSheet(silent) { if (!sheetOn) return; if (silent) { hideSheet(); return; } history.back(); }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ── Data bantu ─────────────────────────────────────────────────────────────
const W = () => (more && more.workout && !more.workout.error ? more.workout : {});
const ST = () => W().stats || {};
const PG = () => (more && more.program && !more.program.error ? more.program : {});
const PR = () => (more && more.progress && !more.progress.error ? more.progress : null);
const NUT = () => (more && more.nutrition && more.nutrition.enabled ? more.nutrition : null);
// T-1639: duplikat tersembunyi di pustaka (item ber-`h`) memakai kunci riwayat gerakan utamanya, sama dengan server (_exResolve_).
// Pustaka dimuat diam-diam sekali (service worker menyimpannya); sebelum itu kunci memakai ID apa adanya.
let exCanonLoading = false;
function exCanon(id) {
  if (!lib.ex && !exCanonLoading) { exCanonLoading = true; fetch('../exercises/exercises.min.json').then(r => r.json()).then(d => { if (!lib.ex) { lib.ex = d.items; render(); } }).catch(() => {}); }
  const x = (lib.ex || []).find(e => e.id === id);
  return x && x.h ? x.h : id;
}
const keyOf = it => it.exId ? 'ex:' + exCanon(it.exId) : 'nm:' + String(it.gerakan || '').trim().toLowerCase();
const e1rm = (w, r) => { w = num(w); r = num(r); return w > 0 && r >= 1 && r <= 12 ? Math.round(w * (1 + r / 30) * 10) / 10 : 0; };   // sama dengan _e1rm_ di server
const isWarm = j => j === 'w';
const firstName = () => String(kv('x_name', '')).trim().split(/\s+/)[0] || '';
const pendingWorkouts = () => queue.filter(q => q.fn === 'logMyWorkout');
function weekStart(iso) { const d = new Date(iso + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function workoutDates() {
  const s = new Set();
  (ST().sessions || []).forEach(x => s.add(x.tanggal));
  (W().sessions || []).forEach(x => s.add(x.tanggal));
  (W().days || []).forEach(x => s.add(x.tanggal));
  pendingWorkouts().forEach(q => s.add(q.args[0]));
  return s;
}
function routines() {
  const pg = PG();
  return { coach: (pg.days || []).map(d => ({ ...d, coach: true })), own: (pg.own || []).map(d => ({ ...d, coach: false })) };
}
function findRoutine(hari) { const r = routines(); return r.coach.concat(r.own).find(d => d.hari === hari); }

// ── Kerangka (sidebar, nav, banner, sinkron) ─────────────────────────────────────
const TABS = [['home', 'home', 'Beranda'], ['lat', 'dumbbell', 'Latihan'], ['mak', 'food', 'Makan'], ['pro', 'user', 'Profil']];
function syncBtn() {
  const st = syncing ? ['refresh', 'Sinkron…', ' spin'] : !navigator.onLine ? ['cloudOff', 'Offline', ''] : ['cloud', 'Tersinkron', ''];
  return `<button class="ib${st[2]}" data-a="sync" aria-label="${st[1]}" title="${st[1]}">${ic(st[0])}</button>`;
}
function hd(title, o) {
  o = o || {};
  if (o.back) return `<header class="hd"><button class="ib" data-a="back" aria-label="Kembali">${ic('left')}</button><div class="t">${esc(title)}</div><div class="hd-r">${o.right || '<span class="ib"></span>'}</div></header>`;
  return `<header class="hd"><h1>${esc(title)}</h1><div class="hd-r">${o.right || ''}${syncBtn()}</div></header>`;
}
function chrome() {
  const ok = !!token, cur = topV().v, full = !wide() && (cur === 'log' || cur === 'sum');
  $('#nav').classList.toggle('hide', !ok || full);
  $('#side').innerHTML = ok ? `<div class="brand"><span class="logo">X</span>XNK Catat</div>` + TABS.map(t => `<button class="it${nav.tab === t[0] ? ' on' : ''}" data-a="tab" data-t="${t[0]}">${ic(t[1])}${t[2]}</button>`).join('') + `<button class="btn" data-a="plus">${ic('plus')} Catat</button>` : '';
  $('#side').classList.toggle('hide', !ok);
  $('#nav').innerHTML = [TABS[0], TABS[1], null, TABS[2], TABS[3]].map(t => t ? `<button class="${nav.tab === t[0] ? 'on' : ''}" data-a="tab" data-t="${t[0]}">${ic(t[1])}${t[2]}</button>` : `<button class="plus" data-a="plus" aria-label="Catat">${ic('plus')}</button>`).join('');
  const b = $('#banner'), off = !navigator.onLine, n = queue.length;
  b.classList.toggle('hide', !ok || (!off && !n));
  b.innerHTML = off ? `${ic('cloudOff')} Offline${n ? ' · ' + n + ' catatan menunggu sinyal' : ' · catatan tetap tersimpan'}` : `${ic('refresh')} ${n} catatan sedang dikirim`;
  const sb = document.querySelector('[data-a="sync"]'); if (sb) sb.outerHTML = syncBtn();
}

// ── Render ─────────────────────────────────────────────────────────────────
const VIEWS = {};
function view(v, p) { return (VIEWS[v] || VIEWS.home)(p || {}); }
function render() {
  document.documentElement.dataset.theme = kv('x_theme', '') || '';
  if (!token) { $('#main').className = 'main'; $('#main').innerHTML = VIEWS.login(); chrome(); return; }
  const t = topV(), m = $('#main');
  const full = t.v === 'log' || t.v === 'sum';
  m.className = 'main' + (full ? ' full' : '');
  if (wide() && (nav.tab === 'lat' || nav.tab === 'pro')) {
    const sub = nav.stack.length ? t : (nav.tab === 'lat' ? (draft ? { v: 'log' } : { v: 'latEmpty' }) : { v: 'ukr' });
    m.innerHTML = `<div class="panes"><section class="pane p1">${view(nav.tab)}</section><section class="pane p2">${view(sub.v, sub.p)}</section></div>`;
  } else m.innerHTML = view(t.v, t.p);
  const showResume = !wide() && draft && !full;
  m.insertAdjacentHTML('beforeend', showResume ? `<button class="resume" data-a="resume"><span>${ic('dumbbell')} ${esc(draft.hari || 'Latihan')} · <span data-dur>${durText()}</span></span><span>Lanjutkan ${ic('up')}</span></button>` : '');
  chrome();
  restPaint();
}

// ── Masuk ──────────────────────────────────────────────────────────────────
VIEWS.login = () => `<div class="login"><div class="logo">X</div><div><div class="big">XNK Catat</div><p class="mu" style="margin-top:.35rem">Catat latihan, makan, dan progres. Tetap jalan tanpa sinyal.</p></div>
  <label><span class="lbl">Nomor WhatsApp</span><input class="inp" id="ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="0812 3456 7890"></label>
  <button class="btn w" data-a="login" id="go">Masuk</button><p class="mu" style="text-align:center">Pakai nomor yang terdaftar di XNK. Perlu sinyal sekali saja.</p></div>`;

// ── Beranda ────────────────────────────────────────────────────────────────
VIEWS.home = () => {
  const r = routines(), next = W().next ? findRoutine(W().next) : (r.coach[0] || null);
  const ws = weekStart(today()), dates = workoutDates();
  let wkDone = 0;
  const week = DAYS.map((d, i) => { const iso = addDays(ws, i), f = dates.has(iso); if (f) wkDone++; return `<div>${d}<i class="${f ? 'f' : iso === today() ? 't' : ''}">${f ? ic('check') : ''}</i></div>`; }).join('');
  const p = PR(), ch = p && p.challenge, n = NUT();
  const kal = n ? foodTotals().kal : 0, tgt = n && n.target && n.target.kal;
  const lastPr = (ST().exercises || []).filter(e => e.pr).sort((a, b) => a.pr.tanggal < b.pr.tanggal ? 1 : -1)[0];
  if (!more && !draft && syncing) return hd('Beranda') + `<div class="sc" aria-busy="true">${firstName() ? `<p class="mu">Halo, ${esc(firstName())}</p>` : ''}<div class="skel" style="height:8rem"></div><div class="skel" style="height:5.5rem"></div><div class="grid2"><div class="skel" style="height:7rem"></div><div class="skel" style="height:7rem"></div></div></div>`;
  return hd('Beranda') + `<div class="sc">
  ${firstName() ? `<p class="mu">Halo, ${esc(firstName())}</p>` : ''}
  ${draft ? `<div class="card"><div class="k">Sedang berjalan</div><div class="ttl" style="margin:.15rem 0 .6rem">${esc(draft.hari || 'Latihan')} · <span data-dur>${durText()}</span></div><button class="btn w" data-a="resume">Lanjutkan latihan</button></div>`
    : next ? `<div class="card"><div class="k">Latihan berikutnya</div><div class="ttl" style="font-size:1.1rem;margin-top:.15rem">${esc(next.hari)}</div><p class="mu clip">${esc(next.items.map(x => x.gerakan).join(', '))}</p><button class="btn w" style="margin-top:.7rem" data-a="startR" data-h="${esc(next.hari)}">Mulai rutinitas</button></div>`
    : `<div class="card"><div class="ttl">Siap latihan?</div><p class="mu" style="margin:.2rem 0 .7rem">Mulai kosong lalu tambah gerakan.</p><button class="btn w" data-a="startEmpty">Mulai latihan kosong</button></div>`}
  <div class="card"><div class="row" style="margin-bottom:.6rem"><span class="b">Minggu ini</span><span class="mu">${wkDone} latihan${p && p.streak ? ' · streak ' + p.streak + ' mgg' : ''}</span></div><div class="week">${week}</div></div>
  <div class="grid2">
    <button class="card" style="text-align:left" data-a="tab" data-t="mak"><div class="k">Sisa kalori</div><div class="big">${tgt ? fmt(Math.max(0, tgt - kal)) : '–'}</div><div class="bar" style="margin:.45rem 0 .3rem"><i style="width:${tgt ? Math.min(100, Math.round(kal / tgt * 100)) : 0}%"></i></div><div class="mu">${tgt ? fmt(kal) + ' / ' + fmt(tgt) + ' kkal' : 'Gizi belum aktif'}</div></button>
    <div class="card"><div class="k">Target bulan ini</div><div class="big">${ch ? ch.done : 0}<span class="mu" style="font-size:.8rem;font-weight:600"> / ${ch ? ch.target : '–'}</span></div><div class="bar" style="margin:.45rem 0 .3rem"><i style="width:${ch && ch.target ? Math.min(100, Math.round(ch.done / ch.target * 100)) : 0}%"></i></div><div class="mu">sesi bersama coach</div></div>
  </div>
  ${lastPr ? `<button class="card row" data-a="gerakD" data-k="${esc(lastPr.key)}"><span class="row s">${ic('trophy')}<span style="text-align:left"><span class="b">Rekor terbaru</span><br><span class="mu">${esc(lastPr.gerakan)} · ${fmt1(lastPr.pr.e1rm)} kg est. 1RM</span></span></span><span class="mu">${dShort(lastPr.pr.tanggal)}</span></button>` : ''}
  ${pendingWorkouts().length ? `<p class="mu">${pendingWorkouts().length} latihan menunggu sinyal.</p>` : ''}
  </div>`;
};

// ── Latihan: mulai + rutinitas ala Hevy ─────────────────────────────────────────────
VIEWS.lat = () => {
  const r = routines();
  const card = d => `<div class="card"><div class="row"><span class="ttl clip">${esc(d.hari)}</span>${d.coach ? `<span class="mu" title="Dari coach">${ic('lock')}</span>` : `<button class="ib" data-a="rtMenu" data-h="${esc(d.hari)}" aria-label="Pilihan rutinitas">${ic('dots')}</button>`}</div>
    <p class="mu" style="margin:.2rem 0 .7rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(d.items.map(x => x.gerakan).join(', '))}</p>
    <button class="btn w sm" data-a="startR" data-h="${esc(d.hari)}">Mulai rutinitas</button></div>`;
  return hd('Latihan') + `<div class="sc">
  <button class="btn s l w" data-a="startEmpty">${ic('plus')} Mulai latihan kosong</button>
  <div class="row"><span class="sec">Rutinitas</span><button class="btn g sm" data-a="rtNew">${ic('plus')} Baru</button></div>
  ${r.coach.length ? `<div class="sub">Dari coach (${r.coach.length})</div>` + r.coach.map(card).join('') : ''}
  <div class="sub">Rutinitas saya (${r.own.length})</div>
  ${r.own.length ? r.own.map(card).join('') : `<div class="fill mu">Buat rutinitas sendiri untuk latihan di luar program coach.</div>`}
  </div>`;
};
VIEWS.latEmpty = () => `<div class="empty" style="padding-top:30vh">${ic('dumbbell')}<div class="ttl">Belum ada latihan berjalan</div><p class="mu">Pilih rutinitas atau mulai kosong.</p></div>`;

// ── Logger ─────────────────────────────────────────────────────────────────
function dSave() { kvSet('x_draft', draft); }
function durSec() { return draft ? Math.max(0, Math.round((Date.now() - Date.parse(draft.mulai)) / 1000)) : 0; }
function durText() { const s = durSec(), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + 'j ' + m + 'm' : m + 'm ' + String(s % 60).padStart(2, '0') + 'd'; }
function draftStats() {
  let vol = 0, sets = 0;
  (draft ? draft.items : []).forEach(it => it.sets.forEach(s => { if (!s.done) return; sets++; if (!isWarm(s.jenis)) vol += num(s.berat) * num(s.rep); }));
  return { vol: Math.round(vol), sets };
}
function prevOf(it, j) { const l = W().last && W().last[keyOf(it)]; const s = l && l.sets && l.sets.filter(x => !isWarm(x.jenis))[j]; return s ? s : null; }
function newSets(it, n, base) {
  return Array.from({ length: n }, (_, j) => { const b = base && base[j]; return { berat: '', rep: '', rpe: '', jenis: b && b.w ? 'w' : '', done: false, phKg: b && b.kg !== '' && b.kg != null ? b.kg : '', phRep: b && b.rep ? b.rep : '' }; });
}
function startDraft(d) {
  draft = { cid: uid(), mulai: new Date().toISOString(), hari: d ? d.hari : '', items: [] };
  if (d) d.items.forEach(it => {
    const sug = (W().suggest || {})[keyOf(it)], n = (it.skema && it.skema.length) || it.set || 3;
    const base = Array.from({ length: n }, (_, j) => { const sk = it.skema && it.skema[j], pv = prevOf(it, j);
      return { kg: sk && sk.kg !== '' ? sk.kg : (sug && sug.kg) || (pv && pv.berat) || it.kg || '', rep: sk && sk.rep !== '' ? sk.rep : (pv && pv.rep) || it.repMax || it.repMin || '', w: sk && sk.w }; });
    draft.items.push({ exId: it.exId || '', gerakan: it.gerakan, rest: num(it.rest) || 90, ss: !!it.ss, sets: newSets(it, n, base) });
  });
  dSave();
}
const KIND = { '': ['', 'Normal'], w: ['W', 'Pemanasan'], drop: ['D', 'Drop set'], gagal: ['F', 'Sampai gagal'] };
VIEWS.log = () => {
  if (!draft) return VIEWS.latEmpty();
  const s = draftStats();
  const exs = draft.items.map((it, i) => {
    let n = 0;
    const rows = it.sets.map((st, j) => {
      const lbl = st.jenis ? KIND[st.jenis][0] : String(++n), pv = isWarm(st.jenis) ? null : prevOf(it, n - 1);
      return `<div class="st r${st.done ? ' d' : ''}"><button class="no ${st.jenis === 'w' ? 'w' : st.jenis === 'gagal' ? 'f' : st.jenis === 'drop' ? 'dr' : ''}" data-a="setKind" data-i="${i}" data-j="${j}" aria-label="Jenis set ${j + 1}">${lbl}</button>
        <span class="pv">${pv ? fmt1(pv.berat) + ' × ' + pv.rep : '–'}</span>
        <input inputmode="decimal" enterkeyhint="next" aria-label="Kg" placeholder="${esc(st.phKg)}" value="${esc(st.berat)}" data-in="berat" data-i="${i}" data-j="${j}">
        <input inputmode="numeric" enterkeyhint="next" aria-label="Rep" placeholder="${esc(st.phRep)}" value="${esc(st.rep)}" data-in="rep" data-i="${i}" data-j="${j}">
        <input inputmode="decimal" aria-label="RPE" placeholder="" value="${esc(st.rpe)}" data-in="rpe" data-i="${i}" data-j="${j}">
        <button class="ck${st.done ? ' on' : ''}${st.pr ? ' pr' : ''}" data-a="setDone" data-i="${i}" data-j="${j}" aria-label="Set selesai">${ic(st.pr ? 'trophy' : 'check')}</button></div>`;
    }).join('');
    const ss = it.ss || (i > 0 && draft.items[i - 1].ss);
    return `<div class="ex${ss ? ' ss' : ''}"><div class="ex-h"><span class="ttl clip">${esc(it.gerakan)}</span><button class="ib" data-a="exMenu" data-i="${i}" aria-label="Pilihan gerakan">${ic('dots')}</button></div>
      <div class="ex-meta"><span>${ic('clock')} Istirahat ${restLabel(it.rest)}</span>${ss ? `<span>${ic('link')} Superset</span>` : ''}</div>
      <div class="st h"><span>SET</span><span>SEBELUMNYA</span><span>KG</span><span>REP</span><span>RPE</span><span>${ic('check')}</span></div>${rows}
      <button class="addset" data-a="addSet" data-i="${i}">+ Tambah set</button></div>`;
  }).join('');
  return `<header class="hd"><button class="ib" data-a="${wide() ? 'noop' : 'back'}" aria-label="Kecilkan">${ic('down')}</button><div class="t">${esc(draft.hari || 'Latihan')}</div><div class="hd-r"><button class="btn sm" data-a="finish">Selesai</button></div></header>
  <div class="lg-stats"><div><div class="k">Durasi</div><div class="v" data-dur>${durText()}</div></div><div><div class="k">Volume</div><div class="v">${fmt(s.vol)} kg</div></div><div><div class="k">Set</div><div class="v">${s.sets}</div></div></div>
  <div class="sc">${exs || `<div class="empty">${ic('dumbbell')}<div class="ttl">Mulai dengan gerakan</div><p class="mu">Ketuk Tambah gerakan.</p></div>`}
  <button class="btn w" data-a="exAdd" data-m="log">${ic('plus')} Tambah gerakan</button>
  <button class="btn d w" data-a="discard">Buang latihan</button></div>`;
};
const restLabel = s => { s = num(s); return s ? (s >= 60 ? Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 'd' : s + 'd') : 'mati'; };

// Timer istirahat: mulai otomatis setelah set dicentang, getar saat habis.
let rest = null;
function restStart(sec) { if (!sec) return; rest = { end: Date.now() + sec * 1000, total: sec }; restPaint(); }
function restPaint() {
  const el = $('#rest');
  if (!rest || !token) { el.classList.add('hide'); return; }
  const left = Math.max(0, Math.round((rest.end - Date.now()) / 1000));
  if (!left) { rest = null; el.classList.add('hide'); haptic(200); toast('Istirahat selesai.'); return; }
  el.classList.remove('hide');
  el.innerHTML = `<button data-a="rest" data-d="-15">−15</button><span class="tm">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span><button data-a="rest" data-d="15">+15</button><button data-a="rest" data-d="0">Lewati</button><span class="pg" style="width:${Math.round(left / rest.total * 100)}%"></span>`;
}
setInterval(() => { document.querySelectorAll('[data-dur]').forEach(x => { x.textContent = durText(); }); if (rest) restPaint(); }, 1000);

// ── Ringkasan selesai ──────────────────────────────────────────────────────────
function draftPrs() {
  const out = [];
  (draft ? draft.items : []).forEach(it => { let b = null; it.sets.forEach(s => { if (s.pr) { const e = e1rm(s.berat, s.rep); if (!b || e > b.e) b = { e, s }; } }); if (b) out.push({ gerakan: it.gerakan, e: b.e, berat: b.s.berat, rep: b.s.rep }); });
  return out;
}
VIEWS.sum = () => {
  if (!draft) return VIEWS.latEmpty();
  const s = draftStats(), prs = draftPrs();
  return `<header class="hd"><button class="ib" data-a="back" aria-label="Kembali">${ic('left')}</button><div class="t">Simpan latihan</div><div class="hd-r"><button class="btn sm" data-a="save">Simpan</button></div></header>
  <div class="sc"><input class="inp" style="font-size:1.15rem;font-weight:800;border:0;padding-left:0" maxlength="40" value="${esc(draft.hari || 'Latihan ' + dShort(today()))}" data-in="title" aria-label="Judul latihan">
  <div class="fill row"><div><div class="k">Durasi</div><div class="b" data-dur>${durText()}</div></div><div><div class="k">Volume</div><div class="b">${fmt(s.vol)} kg</div></div><div><div class="k">Set</div><div class="b">${s.sets}</div></div><div><div class="k">Rekor</div><div class="b">${prs.length} ${ic('trophy')}</div></div></div>
  ${prs.length ? `<div class="sec">Rekor</div>` + prs.map(p => `<div class="card row"><span><span class="b">${esc(p.gerakan)}</span><br><span class="mu">${fmt1(p.berat)} kg × ${esc(p.rep)} · est. 1RM</span></span><span class="b">${fmt1(p.e)} kg ${ic('trophy')}</span></div>`).join('') : ''}
  <div class="sec">Bagaimana rasanya?</div>
  <div class="row">${['Berat', 'Cukup berat', 'Pas', 'Enak', 'Mantap'].map((l, k) => `<button class="chip${draft.rasa === k + 1 ? ' on' : ''}" style="flex:1;justify-content:center;flex-direction:column;min-height:3rem;gap:0" data-a="rasa" data-v="${k + 1}"><b>${k + 1}</b><span style="font-size:.625rem">${l}</span></button>`).join('')}</div>
  <label><span class="lbl">Catatan</span><textarea class="inp" maxlength="300" data-in="note" placeholder="Bagaimana latihan hari ini?">${esc(draft.catatan || '')}</textarea></label>
  ${s.sets ? '' : `<p class="mu">Belum ada set dicentang. Set yang terisi tetap disimpan.</p>`}
  <button class="btn w" data-a="save" data-share="1">${ic('share')} Simpan dan bagikan</button></div>`;
};

// ── Cari gerakan ala Hevy (cari, filter alat dan otot, pilih banyak) ───────────────────────
const EQ = [['body weight', 'Tanpa alat'], ['barbell', 'Barbel'], ['dumbbell', 'Dumbel'], ['cable', 'Kabel'], ['leverage machine', 'Mesin'], ['kettlebell', 'Kettlebell'], ['band', 'Band'], ['smith machine', 'Smith']];
const MU = [['chest', 'Dada'], ['back', 'Punggung'], ['shoulders', 'Bahu'], ['upper arms', 'Lengan atas'], ['lower arms', 'Lengan bawah'], ['upper legs', 'Paha'], ['lower legs', 'Betis'], ['waist', 'Perut'], ['cardio', 'Kardio']];
let exs = null;
async function exOpen(mode) {
  exs = { mode, q: '', eq: '', mu: '', picked: [] };
  await loadLib('ex'); exPaint(true);
}
function exPaint(first) {
  const q = exs.q.toLowerCase(), rec = kv('x_exrecent', []);
  let list = lib.ex || [];
  if (exs.eq) list = list.filter(x => x.q === exs.eq);
  if (exs.mu) list = list.filter(x => x.b === exs.mu);
  if (q) list = list.filter(x => x.n.includes(q) || (x.t || '').includes(q));
  else if (!exs.eq && !exs.mu) list = rec.map(id => (lib.ex || []).find(x => x.id === id)).filter(Boolean).concat(list.filter(x => !rec.includes(x.id)));
  const rows = list.slice(0, 60).map(x => { const on = exs.picked.includes(x.id); return `<button class="li" data-a="exPick" data-x="${esc(x.id)}"><span class="ic">${on ? ic('check') : ic('dumbbell')}</span><span class="clip" style="flex:1"><span class="b" style="text-transform:capitalize">${esc(x.n)}</span><br><span class="mu">${esc((MU.find(m => m[0] === x.b) || [0, x.b])[1])} · ${esc((EQ.find(e => e[0] === x.q) || [0, x.q])[1])}</span></span></button>`; }).join('');
  const body = `${!q && !exs.eq && !exs.mu && rec.length ? '<div class="sub">Terakhir dipakai di atas</div>' : ''}${rows || '<p class="mu">Tidak ditemukan.</p>'}${q ? `<button class="li" data-a="exCustom"><span class="ic">${ic('plus')}</span><span>Buat “${esc(exs.q)}”</span></button>` : ''}`;
  if (!first && $('#exList')) { $('#exList').innerHTML = body; $('#exGo').textContent = exs.picked.length ? 'Tambah ' + exs.picked.length + ' gerakan' : 'Pilih gerakan'; $('#exGo').disabled = !exs.picked.length; document.querySelectorAll('[data-a="exEq"]').forEach(b => b.classList.toggle('on', b.dataset.v === exs.eq)); document.querySelectorAll('[data-a="exMu"]').forEach(b => b.classList.toggle('on', b.dataset.v === exs.mu)); return; }
  openSheet(`<div class="sh-h"><span class="t">Tambah gerakan</span><button class="ib" data-a="close" aria-label="Tutup">${ic('x')}</button></div>
    <div class="sh-b" style="padding-bottom:.4rem"><input class="inp" type="search" placeholder="Cari gerakan" data-in="exq" autocomplete="off">
    <div class="chips">${EQ.map(e => `<button class="chip" data-a="exEq" data-v="${e[0]}">${e[1]}</button>`).join('')}</div>
    <div class="chips">${MU.map(m => `<button class="chip" data-a="exMu" data-v="${m[0]}">${m[1]}</button>`).join('')}</div></div>
    <div class="sh-b" id="exList" style="flex:1">${body}</div>
    <div class="sh-f"><button class="btn w" id="exGo" data-a="exGo" disabled>Pilih gerakan</button></div>`, true);
}
function exCommit(items) {
  const rec = kv('x_exrecent', []);
  items.forEach(x => { if (x.exId) { const k = rec.indexOf(x.exId); if (k !== -1) rec.splice(k, 1); rec.unshift(x.exId); } });
  kvSet('x_exrecent', rec.slice(0, 12));
  if (exs.mode === 'log') {
    items.forEach(x => { const it = { exId: x.exId, gerakan: x.gerakan, rest: 90, ss: false }; const pv = (W().last || {})[keyOf(it)], n = pv ? Math.min(6, pv.sets.length) : 3;
      it.sets = newSets(it, n || 3, pv ? pv.sets.map(s => ({ kg: s.berat, rep: s.rep, w: isWarm(s.jenis) })) : null); draft.items.push(it); });
    dSave();
  } else if (rt) { items.forEach(x => rt.items.push({ exId: x.exId, gerakan: x.gerakan, set: 3, repMin: 8, repMax: 12 })); }
  closeSheet(); setTimeout(render, 0);
}

// ── Editor rutinitas sendiri (server: saveMyRoutine / deleteMyRoutine, lewat antrian) ─────────────
let rt = null;
VIEWS.rted = () => {
  if (!rt) return VIEWS.lat();
  return `<header class="hd"><button class="ib" data-a="back" aria-label="Batal">${ic('x')}</button><div class="t">${rt.old ? 'Ubah rutinitas' : 'Rutinitas baru'}</div><div class="hd-r"><button class="btn sm" data-a="rtSave">Simpan</button></div></header>
  <div class="sc"><input class="inp" style="font-size:1.1rem;font-weight:700" maxlength="40" placeholder="Nama rutinitas, mis. Push A" value="${esc(rt.hari)}" data-in="rtName">
  ${rt.items.map((it, i) => `<div class="card"><div class="row"><span class="ttl clip" style="text-transform:capitalize">${esc(it.gerakan)}</span><span class="row" style="gap:0"><button class="ib" data-a="rtMove" data-i="${i}" data-d="-1" aria-label="Naik">${ic('up')}</button><button class="ib" data-a="rtMove" data-i="${i}" data-d="1" aria-label="Turun">${ic('down')}</button><button class="ib" data-a="rtDel" data-i="${i}" aria-label="Hapus">${ic('trash')}</button></span></div>
    <div class="row" style="margin-top:.4rem"><label class="row s"><span class="mu">Set</span><input class="inp" style="width:4rem;text-align:center" inputmode="numeric" value="${esc(it.set)}" data-in="rtSet" data-i="${i}"></label><label class="row s"><span class="mu">Rep</span><input class="inp" style="width:3.5rem;text-align:center" inputmode="numeric" value="${esc(it.repMin)}" data-in="rtMin" data-i="${i}"><span class="mu">–</span><input class="inp" style="width:3.5rem;text-align:center" inputmode="numeric" value="${esc(it.repMax)}" data-in="rtMax" data-i="${i}"></label></div></div>`).join('')}
  <button class="btn s w" data-a="exAdd" data-m="rted">${ic('plus')} Tambah gerakan</button></div>`;
};

// ── Makan ──────────────────────────────────────────────────────────────────
function foodItems() {
  const n = NUT(), t = today();
  const sent = (n && n.log && n.log.tanggal === t ? n.log.items : []).filter(x => !delIds.includes(x.id)).map(x => ({ ...x, sent: true }));
  const pend = queue.filter(q => q.fn === 'logMyFood' && q.args[0].tanggal === t).map(q => { const a = q.args[0]; return { qid: q.id, waktu: a.waktu, nama: a._nama, porsi: a.gram + ' g', kal: a._kal, p: a._p || 0, l: a._l || 0, k: a._k || 0 }; });
  return sent.concat(pend);
}
function foodTotals() { return foodItems().reduce((a, x) => ({ kal: a.kal + num(x.kal), p: a.p + num(x.p), l: a.l + num(x.l), k: a.k + num(x.k) }), { kal: 0, p: 0, l: 0, k: 0 }); }
VIEWS.mak = () => {
  const n = NUT();
  if (!n) return hd('Makan') + `<div class="sc"><div class="empty">${ic('food')}<div class="ttl">Catatan makan belum aktif</div><p class="mu">Minta coach mengaktifkan gizi untukmu. Setelah sinkron, target dan menu muncul di sini.</p></div></div>`;
  const tg = n.target && n.target.ok ? n.target : null, tot = foodTotals(), items = foodItems();
  const menu = (n.menu && n.menu.meals) || [];
  const meal = ([key, label]) => {
    const mine = items.filter(x => x.waktu === key), kal = mine.reduce((a, x) => a + num(x.kal), 0);
    const sug = menu.filter(m => (MEAL_ALIAS[m.key] || m.key) === key).flatMap(m => m.items).filter(it => !mine.some(x => x.foodId === it.id || x.nama === it.n));
    return `<div class="card"><div class="row"><span class="ttl">${label}</span><span class="mu">${fmt(kal)} kkal</span></div>
      ${mine.map(x => `<div class="row" style="min-height:2.5rem;border-bottom:1px solid var(--bd)"><span class="clip" style="flex:1">${esc(x.nama)} <span class="mu">${esc(x.porsi || '')}${x.qid ? ' · menunggu' : ''}</span></span><span class="mu">${fmt(x.kal)}</span><button class="ib" data-a="${x.qid ? 'foodUnq' : 'foodDel'}" data-id="${esc(x.qid || x.id)}" aria-label="Hapus">${ic('x')}</button></div>`).join('')}
      ${sug.length ? `<div class="sub" style="margin:.6rem 0 .35rem">Saran coach</div>` + sug.map(it => `<div class="fill row" style="padding:.45rem .6rem;margin-bottom:.35rem"><span class="clip" style="flex:1">${esc(it.n)} <span class="mu">${fmt(it.gram)} g · ${fmt(it.kal)} kkal</span></span><button class="btn g sm" data-a="foodSug" data-w="${key}" data-id="${esc(it.id)}" data-g="${esc(it.gram)}">${ic('plus')} Catat</button></div>`).join('') : ''}
      <button class="btn g sm" style="margin-top:.35rem;padding-left:0" data-a="foodAdd" data-w="${key}">${ic('plus')} Tambah makanan</button></div>`;
  };
  const mac = (l, v, t) => `<div><div class="k">${l}</div><div class="b num">${fmt(v)}<span class="mu" style="font-weight:500">${t ? '/' + fmt(t) : ''} g</span></div><div class="bar" style="margin-top:.3rem"><i style="width:${t ? Math.min(100, Math.round(v / t * 100)) : 0}%"></i></div></div>`;
  return hd('Makan') + `<div class="sc"><div class="card"><div class="row"><div><div class="k">Sisa</div><div class="big" style="font-size:2rem">${tg ? fmt(tg.kal - tot.kal) : '–'} <span class="mu" style="font-size:.8rem;font-weight:600">kkal</span></div></div><div class="mu" style="text-align:right">Target ${tg ? fmt(tg.kal) : '–'}<br>Makan ${fmt(tot.kal)}</div></div>
    <div class="grid2" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem;margin-top:.75rem">${mac('Protein', tot.p, tg && tg.protein)}${mac('Karbo', tot.k, tg && tg.karbo)}${mac('Lemak', tot.l, tg && tg.lemak)}</div></div>
    ${MEALS.map(meal).join('')}</div>`;
};
let fs = null;
async function foodOpen(waktu) { fs = { waktu, q: '', pick: null, gram: 0 }; await loadLib('food'); foodPaint(true); }
function foodPaint(first) {
  let body;
  if (fs.pick) {
    const f = fs.pick, g = fs.gram, x = g / 100;
    body = `<div class="ttl">${esc(f.n)}</div><p class="mu">${fmt(f.kal)} kkal per 100 g${f.e ? ' · perkiraan' : ''}</p>
      <div class="chips">${(f.por || []).map(p => `<button class="chip${g === p[1] ? ' on' : ''}" data-a="foodPor" data-g="${p[1]}">${esc(p[0])}</button>`).join('')}</div>
      <label class="row s"><input class="inp" style="width:7rem;text-align:center;font-weight:700" inputmode="decimal" value="${esc(g)}" data-in="foodG"><span class="mu">gram</span></label>
      <div class="seg">${MEALS.map(m => `<button class="${fs.waktu === m[0] ? 'on' : ''}" data-a="foodW" data-w="${m[0]}">${m[1].replace('Makan ', '')}</button>`).join('')}</div>
      <div class="fill row" id="foodSum"><div><div class="k">Kalori</div><div class="b">${fmt(f.kal * x)}</div></div><div><div class="k">Protein</div><div class="b">${fmt1(f.p * x)} g</div></div><div><div class="k">Karbo</div><div class="b">${fmt1(f.k * x)} g</div></div><div><div class="k">Lemak</div><div class="b">${fmt1(f.l * x)} g</div></div></div>`;
  } else {
    const q = fs.q.toLowerCase(), n = NUT(), rec = (n && n.log && n.log.recent) || [];
    const list = q ? (lib.food || []).filter(x => x.n.toLowerCase().includes(q)).slice(0, 40) : rec.map(r => (lib.food || []).find(x => x.id === r.foodId)).filter(Boolean).slice(0, 12);
    body = (q ? '' : rec.length ? '<div class="sub">Terakhir dimakan</div>' : '<p class="mu">Ketik nama makanan, mis. nasi, ayam, tempe.</p>') +
      list.map(x => `<button class="li" data-a="foodPick" data-id="${esc(x.id)}"><span class="clip" style="flex:1"><span class="b">${esc(x.n)}</span><br><span class="mu">${fmt(x.kal)} kkal / 100 g · ${esc(x.por && x.por[0] ? x.por[0][0] : '')}</span></span>${ic('plus')}</button>`).join('');
  }
  if (!first && $('#foodList')) { $('#foodList').innerHTML = body; $('#foodGo').classList.toggle('hide', !fs.pick); return; }
  openSheet(`<div class="sh-h">${fs.pick ? `<button class="ib" data-a="foodBack" aria-label="Kembali">${ic('left')}</button>` : ''}<span class="t">Catat makanan</span><button class="ib" data-a="close" aria-label="Tutup">${ic('x')}</button></div>
    <div class="sh-b" style="padding-bottom:.4rem">${fs.pick ? '' : '<input class="inp" type="search" placeholder="Cari makanan" data-in="foodq" autocomplete="off">'}</div>
    <div class="sh-b" id="foodList" style="flex:1">${body}</div>
    <div class="sh-f ${fs.pick ? '' : 'hide'}" id="foodGo"><button class="btn w" data-a="foodSave">Simpan</button></div>`, true);
}
function foodLog(f, gram, waktu) {
  const x = gram / 100;
  // _kal/_nama/_p/_l/_k hanya untuk tampilan lokal; server menghitung ulang dari id + gram
  enqueue('logMyFood', [{ cid: uid(), tanggal: today(), waktu, id: f.id, gram, _kal: Math.round(f.kal * x), _nama: f.n, _p: f.p * x, _l: f.l * x, _k: f.k * x }]);
  haptic(12);
}

// ── Profil ──────────────────────────────────────────────────────────────────
let chartMetric = 'volume';
VIEWS.pro = () => {
  const p = PR(), st = ST(), weeks = st.weeks || [], ph = (p && p.photos) || [], ents = (p && p.entries) || [];
  const lastW = ents.slice().reverse().find(e => e.berat !== '' && e.berat != null);
  const vals = weeks.map(w => chartMetric === 'volume' ? w.volume : w.sets), max = Math.max(1, ...vals);
  const nm = String(kv('x_name', '') || 'Klien XNK');
  return hd('Profil', { right: `<button class="ib" data-a="go" data-v="set" aria-label="Pengaturan">${ic('settings')}</button>` }) + `<div class="sc">
  <div class="row s" style="gap:.85rem"><div class="av">${esc(nm.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase())}</div><div class="clip"><div class="ttl">${esc(nm)}</div><div class="mu">${p ? (p.completed || 0) + ' sesi · streak ' + (p.streak || 0) + ' mgg' : 'Sinkron untuk melihat statistik'}</div></div></div>
  <div class="card"><div class="row" style="margin-bottom:.6rem"><span class="b">${chartMetric === 'volume' ? 'Volume' : 'Set'} per minggu</span><span class="mu">8 minggu</span></div>
    ${weeks.length ? `<div class="bars">${weeks.map((w, i) => `<div><i class="${i === weeks.length - 1 ? 'n' : ''}" style="height:${Math.round(vals[i] / max * 100)}%" title="${fmt(vals[i])}"></i><span>${dShort(w.start).split(' ')[0]}</span></div>`).join('')}</div>` : '<p class="mu">Belum ada data latihan.</p>'}
    <div class="seg" style="margin-top:.75rem"><button class="${chartMetric === 'volume' ? 'on' : ''}" data-a="metric" data-v="volume">Volume</button><button class="${chartMetric === 'sets' ? 'on' : ''}" data-a="metric" data-v="sets">Set</button></div></div>
  <div class="grid2">
    <button class="tile" data-a="go" data-v="ukr">${ic('ruler')}<span class="b">Ukuran</span><span class="mu">${lastW ? fmt1(lastW.berat) + ' kg' : 'Catat berat'}</span></button>
    <button class="tile" data-a="go" data-v="foto">${ic('camera')}<span class="b">Foto progres</span><span class="mu">${ph.length} foto</span></button>
    <button class="tile" data-a="go" data-v="gerak">${ic('chart')}<span class="b">Gerakan</span><span class="mu">${(st.exercises || []).length} dengan rekor</span></button>
    <button class="tile" data-a="go" data-v="set">${ic('settings')}<span class="b">Pengaturan</span><span class="mu">${failed.length ? failed.length + ' ditolak' : 'Tema, pengingat'}</span></button>
  </div></div>`;
};
function lineSvg(pts, label) {
  if (pts.length < 2) return `<p class="mu">Perlu minimal dua catatan untuk grafik.</p>`;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1, W_ = 300, H = 80;
  const xy = pts.map((p, i) => [Math.round(i / (pts.length - 1) * W_), Math.round(6 + (1 - (p.v - lo) / span) * (H - 12))]);
  return `<svg class="line" viewBox="0 0 ${W_} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polyline points="${xy.map(a => a.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
let ukrKey = 'berat', ukrRange = 90;
VIEWS.ukr = () => {
  const p = PR(), ms = (p && p.measures) || [{ key: 'berat', label: 'Berat', short: 'Berat', unit: 'kg' }], es = (p && p.entries) || [];
  const m = ms.find(x => x.key === ukrKey) || ms[0], since = ukrRange ? addDays(today(), -ukrRange) : '';
  const pts = es.filter(e => e[m.key] !== '' && e[m.key] != null && e.tanggal >= since).map(e => ({ t: e.tanggal, v: num(e[m.key]) }));
  const last = pts[pts.length - 1], delta = pts.length > 1 ? last.v - pts[0].v : 0;
  const has = ms.filter(x => es.some(e => e[x.key] !== '' && e[x.key] != null));
  return hd('Ukuran tubuh', { back: !wide() || nav.stack.length, right: `<button class="ib" data-a="measure" aria-label="Catat ukuran">${ic('plus')}</button>` }) + `<div class="sc">
  <div class="chips">${(has.length ? has : [m]).map(x => `<button class="chip${x.key === m.key ? ' on' : ''}" data-a="ukrKey" data-v="${x.key}">${esc(x.short)}</button>`).join('')}</div>
  <div class="card"><div class="k">${esc(m.label)}</div><div class="row"><div class="big">${last ? fmt1(last.v) : '–'} <span class="mu" style="font-size:.85rem;font-weight:600">${esc(m.unit)}</span></div>${pts.length > 1 ? `<span class="chip">${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${fmt1(Math.abs(delta))} ${esc(m.unit)}</span>` : ''}</div>
    <div style="margin:.6rem 0">${lineSvg(pts, 'Tren ' + m.label)}</div>
    <div class="seg">${[[30, '1B'], [90, '3B'], [365, '1T'], [0, 'Semua']].map(r => `<button class="${ukrRange === r[0] ? 'on' : ''}" data-a="ukrRange" data-v="${r[0]}">${r[1]}</button>`).join('')}</div></div>
  <button class="btn w" data-a="measure">${ic('plus')} Catat ukuran</button>
  <div class="sec">Riwayat</div>
  ${es.length ? `<div class="card" style="padding:.25rem .85rem">` + es.slice(-12).reverse().map(e => `<div class="li" style="font-weight:500"><span class="b" style="width:4.5rem">${dShort(e.tanggal)}</span><span class="mu clip">${esc(ms.filter(x => e[x.key] !== '' && e[x.key] != null).map(x => x.short + ' ' + fmt1(e[x.key])).join(' · '))}</span></div>`).join('') + '</div>' : '<p class="mu">Belum ada catatan.</p>'}
  </div>`;
};
VIEWS.foto = () => {
  const ph = (PR() && PR().photos) || [];
  return hd('Foto progres', { back: true }) + `<div class="sc"><p class="mu">Pribadi: hanya kamu dan coach yang melihat. Perlu sinyal untuk kirim dan lihat.</p>
  <div class="grid2"><button class="btn" data-a="photoAdd" data-v="depan">${ic('camera')} Depan</button><button class="btn" data-a="photoAdd" data-v="samping">${ic('camera')} Samping</button></div>
  <input id="pf" type="file" accept="image/*" class="hide" data-in="photoFile">
  ${ph.length ? `<div class="grid2">` + ph.map(p => `<button class="tile" data-a="photoView" data-id="${esc(p.id)}" style="min-height:7rem;justify-content:flex-end">${photoCache[p.id] ? `<img src="${photoCache[p.id]}" alt="" style="width:100%;border-radius:10px;margin-bottom:.35rem">` : ic('camera')}<span class="b">${dShort(p.tanggal)}</span><span class="mu">${esc(p.sisi)}</span></button>`).join('') + '</div>' : `<div class="empty">${ic('camera')}<div class="ttl">Belum ada foto</div><p class="mu">Foto depan dan samping tiap 2–4 minggu, cahaya dan pose yang sama.</p></div>`}</div>`;
};
VIEWS.gerak = () => {
  const ex = ST().exercises || [];
  return hd('Gerakan', { back: true }) + `<div class="sc">${ex.length ? `<div class="card" style="padding:.25rem .85rem">` + ex.map(e => `<button class="li" data-a="gerakD" data-k="${esc(e.key)}"><span class="clip" style="flex:1"><span class="b" style="text-transform:capitalize">${esc(e.gerakan)}</span><br><span class="mu">${e.points.length} sesi · terakhir ${dShort(e.points[e.points.length - 1].tanggal)}</span></span><span class="r">${e.pr ? fmt1(e.pr.e1rm) + ' kg' : ''} ${ic('right')}</span></button>`).join('') + '</div>' : `<div class="empty">${ic('chart')}<div class="ttl">Belum ada gerakan</div><p class="mu">Catat latihan dengan beban, lalu rekor muncul di sini.</p></div>`}</div>`;
};
VIEWS.gerakD = p => {
  const e = (ST().exercises || []).find(x => x.key === p.k);
  if (!e) return VIEWS.gerak();
  return hd(e.gerakan, { back: true }) + `<div class="sc">
  <div class="grid2"><div class="card"><div class="k">Est. 1RM terbaik</div><div class="big">${e.pr ? fmt1(e.pr.e1rm) : '–'}<span class="mu" style="font-size:.8rem"> kg</span></div><div class="mu">${e.pr ? fmt1(e.pr.berat) + ' kg × ' + e.pr.rep + ' · ' + dShort(e.pr.tanggal) : ''}</div></div>
  <div class="card"><div class="k">Beban terberat</div><div class="big">${fmt1(Math.max(...e.points.map(x => x.top)))}<span class="mu" style="font-size:.8rem"> kg</span></div><div class="mu">${e.points.length} sesi</div></div></div>
  <div class="card"><div class="b" style="margin-bottom:.4rem">Est. 1RM</div>${lineSvg(e.points.filter(x => x.e1rm).map(x => ({ t: x.tanggal, v: x.e1rm })), 'Tren 1RM ' + e.gerakan)}</div>
  <div class="card" style="padding:.25rem .85rem">${e.points.slice().reverse().map(x => `<div class="li" style="font-weight:500"><span class="b" style="width:4.5rem">${dShort(x.tanggal)}</span><span class="mu" style="flex:1">${fmt1(x.top)} kg teratas · volume ${fmt(x.vol)}</span><span class="b">${x.e1rm ? fmt1(x.e1rm) : ''}</span></div>`).join('')}</div></div>`;
};
VIEWS.set = () => {
  const th = kv('x_theme', ''), synced = kv('x_synced', 0);
  return hd('Pengaturan', { back: true }) + `<div class="sc">
  <div class="card"><div class="b" style="margin-bottom:.5rem">Tema</div><div class="seg">${[['', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']].map(t => `<button class="${th === t[0] ? 'on' : ''}" data-a="theme" data-v="${t[0]}">${t[1]}</button>`).join('')}</div></div>
  ${remindHtml()}
  <div class="card"><div class="b" style="margin-bottom:.5rem">Kartu bagikan</div><div class="chips" style="flex-wrap:wrap">${Object.entries(SHARE_KINDS).map(([k, l]) => `<button class="chip" data-a="share" data-k="${k}">${l}</button>`).join('')}</div></div>
  <div class="card"><div class="row"><span><span class="b">Sinkron</span><br><span class="mu">${synced ? 'Terakhir ' + new Date(synced).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Belum pernah'} · ${queue.length} menunggu</span></span><button class="btn s sm" data-a="sync">Sinkron sekarang</button></div></div>
  ${failed.length ? `<div class="sec">Ditolak server <span class="badge">${failed.length}</span></div>` + failed.map(f => `<div class="card"><div class="mu">${esc(f.fn)}</div><div>${esc(f.error)}</div><div class="row s" style="margin-top:.5rem"><button class="btn s sm" data-a="retry" data-id="${f.id}">Coba lagi</button><button class="btn d sm" data-a="drop" data-id="${f.id}">Buang</button></div></div>`).join('') : ''}
  <button class="btn d w" data-a="logout">${ic('logout')} Keluar</button>
  <p class="mu" style="text-align:center">XNK Catat · data latihanmu tersimpan di perangkat dan dikirim ke coach saat ada sinyal.</p></div>`;
};

// Pengingat lokal (opt-in): notifikasi harian dari perangkat, jalan tanpa sinyal. Hanya di app Android (Capacitor).
// WhatsApp dari coach tidak berubah. Teks tetap, tanpa data tubuh. Tidak ada pintar-pintar: waktu tetap tiap hari.
const LN = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications; };
const REMIND_DEF = { on: false, w: '17:00', f: ['07:30', '12:30', '19:00'] };
const remindGet = () => ({ ...REMIND_DEF, ...(kv('x_remind') || {}) });
async function remindApply(r) {   // r = null: matikan semua
  const ln = LN(); if (!ln) return;
  try {
    const pend = await ln.getPending(); if (pend.notifications.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    if (!r || !r.on) return;
    const at = t => { const [hour, minute] = t.split(':').map(Number); return { on: { hour, minute }, allowWhileIdle: true }; };
    const list = [{ id: 9001, title: 'Waktunya latihan', body: 'Catat setnya di XNK Catat.', schedule: at(r.w) }];
    ['sarapan', 'makan siang', 'makan malam'].forEach((n, i) => list.push({ id: 9002 + i, title: 'Catat makan', body: 'Jangan lupa catat ' + n + '.', schedule: at(r.f[i]) }));
    await ln.schedule({ notifications: list });
  } catch (e) { toast('Pengingat gagal diatur.'); }
}
function remindHtml() {
  if (!LN()) return `<div class="card"><div class="row s">${ic('bell')}<span class="b">Pengingat</span></div><p class="mu" style="margin-top:.3rem">Pengingat di perangkat tersedia di aplikasi Android XNK Catat.</p></div>`;
  const r = remindGet(), t = (id, v, l) => `<label class="row" style="min-height:2.75rem"><span>${l}</span><input class="inp" id="${id}" type="time" value="${esc(v)}" style="width:8rem"></label>`;
  return `<div class="card"><div class="row"><span class="row s">${ic('bell')}<span class="b">Pengingat</span></span><input id="rm-on" type="checkbox" ${r.on ? 'checked' : ''} style="width:1.4rem;height:1.4rem;accent-color:var(--fg)" aria-label="Aktifkan pengingat"></div>
  <p class="mu" style="margin:.2rem 0 .4rem">Notifikasi harian dari perangkat, tanpa sinyal. Pesan dari coach lewat WhatsApp tidak berubah.</p>
  ${t('rm-w', r.w, 'Latihan')}${t('rm-f0', r.f[0], 'Sarapan')}${t('rm-f1', r.f[1], 'Makan siang')}${t('rm-f2', r.f[2], 'Makan malam')}
  <button class="btn w" data-a="remindSave" style="margin-top:.4rem">Simpan pengingat</button></div>`;
}
async function remindSave() {
  const r = { on: $('#rm-on').checked, w: $('#rm-w').value || REMIND_DEF.w, f: [0, 1, 2].map(i => $('#rm-f' + i).value || REMIND_DEF.f[i]) };
  if (r.on) { const p = await LN().requestPermissions(); if (p.display !== 'granted') { $('#rm-on').checked = false; return toast('Izin notifikasi ditolak. Aktifkan di pengaturan Android.'); } }
  kvSet('x_remind', r); await remindApply(r); toast(r.on ? 'Pengingat aktif.' : 'Pengingat dimatikan.');
}

// ── Sheet: tombol +, ukuran, foto ─────────────────────────────────────────────────
function plusSheet() {
  const L = [['play', 'Mulai latihan kosong', 'startEmpty'], ['list', 'Mulai rutinitas', 'pickR'], ['food', 'Catat makan', 'foodAdd'], ['ruler', 'Catat ukuran', 'measure'], ['camera', 'Foto progres', 'goFoto']];
  openSheet(`<div class="sh-b">${draft ? `<button class="btn w" data-a="resume">${ic('dumbbell')} Lanjutkan ${esc(draft.hari || 'latihan')}</button>` : ''}${L.map(x => `<button class="li" data-a="${x[2]}" data-w="${x[2] === 'foodAdd' ? mealNow() : ''}"><span class="ic">${ic(x[0])}</span>${x[1]}</button>`).join('')}</div>`);
}
function mealNow() { const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })); return h < 10 ? 'sarapan' : h < 15 ? 'siang' : h < 20 ? 'malam' : 'camilan'; }
function measureSheet() {
  const ms = (PR() && PR().measures) || [{ key: 'berat', label: 'Berat', unit: 'kg' }, { key: 'pinggang', label: 'Lingkar pinggang', unit: 'cm' }];
  openSheet(`<div class="sh-h"><span class="t">Catat ukuran</span><button class="ib" data-a="close" aria-label="Tutup">${ic('x')}</button></div>
    <div class="sh-b">${ms.map(m => `<label class="row" style="min-height:2.75rem"><span>${esc(m.label)}</span><span class="row s"><input class="inp" style="width:6rem;text-align:center" inputmode="decimal" data-m="${esc(m.key)}"><span class="mu" style="width:1.6rem">${esc(m.unit)}</span></span></label>`).join('')}</div>
    <div class="sh-f"><button class="btn w" data-a="measureSave">Simpan</button></div>`, true);
}
function shrink(file) {   // JPG maks 1280 px: cukup untuk membandingkan, kecil untuk dikirim
  return new Promise((ok, no) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => no(new Error('Foto tidak bisa dibaca.')); img.src = u;
  });
}
let photoSide = '';

// ── Kartu bagikan cepat (offline, dari latihan yang baru disimpan) ─────────────────────────
function shareCard(w) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 14; x.textBaseline = 'top';
  x.font = '800 60px Inter,system-ui,sans-serif'; x.fillText((w.hari || 'Latihan').slice(0, 24), 70, 90);
  x.font = '400 36px Inter,system-ui,sans-serif'; x.fillText(w.tanggal, 70, 170);
  [['Durasi', w.menit + ' mnt'], ['Volume', fmt(w.vol) + ' kg'], ['Rekor', String(w.prs || 0)]].forEach((s, i) => { x.font = '500 32px Inter,system-ui,sans-serif'; x.fillText(s[0], 70 + i * 330, 270); x.font = '800 72px Inter,system-ui,sans-serif'; x.fillText(s[1], 70 + i * 330, 312); });
  w.items.slice(0, 7).forEach((it, i) => {
    const best = it.sets.reduce((b, s) => num(s.berat) >= num(b.berat) ? s : b, it.sets[0]);
    x.font = '700 42px Inter,system-ui,sans-serif'; x.fillText(it.gerakan.slice(0, 28), 70, 480 + i * 108);
    x.font = '400 34px Inter,system-ui,sans-serif'; x.fillText(it.sets.length + ' set · terbaik ' + fmt1(best.berat) + ' kg × ' + (best.rep || 0), 70, 530 + i * 108);
  });
  x.font = '900 46px Inter,system-ui,sans-serif'; x.fillText('XNK', 70, 1240);
  c.toBlob(async b => {
    const f = new File([b], 'latihan-xnk.png', { type: 'image/png' });
    const P = nativeShare();
    if (P) { try { const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); }); const uri = (await P.Filesystem.writeFile({ path: f.name, data: b64, directory: 'CACHE' })).uri; await P.Share.share({ files: [uri] }); return; } catch (e) { return; } }
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click();
  }, 'image/png');
}

// Editor kartu bagikan: share.html (dibuat dari Bagikan.html milik panel) berjalan di iframe layar penuh.
// Data dari salinan lokal; hanya periode lain dan foto yang butuh sinyal (RPC lewat sini, token tidak masuk iframe).
const SHARE_KINDS = { latihan: 'Latihan', rekap: 'Rekap bulan', progres: 'Progres', gizi: 'Gizi', ukuran: 'Ukuran tubuh', badges: 'Badge', konsistensi: 'Konsistensi', foto: 'Foto progres' };
const SHARE_RPC = ['getMyShareData', 'getMyProgressPhoto'];
let shareJob = null;
const nativeShare = () => { const P = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins; return P && P.Share && P.Filesystem ? P : null; };
function openShare(kind) {
  if (!more) return toast('Sinkron dulu untuk membuka kartu.');
  const prog = PR();
  shareJob = { kind, opts: {}, src: { today: today(), date: today(), admin: false, first: firstName(),
    workout: more.workout && !more.workout.error ? more.workout : null, progress: prog, share: more.share && !more.share.error ? more.share : null,
    nutrition: more.nutrition, photos: (prog && prog.photos) || [] } };
  const f = document.createElement('iframe'); f.id = 'shf'; f.src = 'share.html'; f.title = 'Kartu bagikan';
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:60;background:#000'; document.body.appendChild(f);
}
addEventListener('message', async e => {
  const f = $('#shf'); if (!f || e.source !== f.contentWindow) return;
  const d = e.data || {}, reply = m => f.contentWindow.postMessage(m, '*');
  if (d.xk === 'ready') { reply({ xnk: 'host', share: !!nativeShare() }); reply({ xk: 'open', ...shareJob }); }
  else if (d.xk === 'close') f.remove();
  else if (d.xk === 'rpc' && SHARE_RPC.includes(d.fn)) {
    try { reply({ xk: 'rpc-done', id: d.id, ok: true, data: await api(d.fn, token, ...(d.args || [])) }); }
    catch (er) { reply({ xk: 'rpc-done', id: d.id, ok: false, error: er.server ? er.message : 'Perlu sinyal.' }); }
  } else if (d.xnk === 'share') {
    let ok = false;
    try {
      const P = nativeShare(), files = d.files || [{ blob: d.blob, name: d.name }], uris = [];
      for (const x of files) {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(x.blob); });
        uris.push((await P.Filesystem.writeFile({ path: x.name, data: b64, directory: 'CACHE' })).uri);
      }
      await P.Share.share({ files: uris }); ok = true;
    } catch (er) { ok = false; }
    reply({ xnk: 'share-done', ok });
  } else if (d.xnk === 'copy') {
    let ok = false; try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': d.blob })]); ok = true; } catch (er) {}
    reply({ xnk: 'copy-done', ok });
  }
});

// ── Aksi (satu pendengar klik untuk seluruh app) ──────────────────────────────────────
function startRoutine(d) {
  if (draft && !confirm('Ada latihan berjalan. Buang dan mulai yang baru?')) return;
  closeSheet(true); startDraft(d); nav.tab = 'lat'; nav.stack = []; if (!wide()) go('log'); else render();
}
function saveWorkout(share) {
  const items = draft.items.map(it => { const done = it.sets.filter(s => s.done); return { ...it, sets: done.length ? done : it.sets.filter(s => s.berat !== '' || s.rep !== '') }; }).filter(it => it.sets.length);
  if (!items.length) return toast('Isi minimal satu set.');
  const entries = items.map((it, n) => ({ n: n + 1, hari: draft.hari || '', exId: it.exId, gerakan: it.gerakan,
    sets: it.sets.map(s => ({ berat: String(s.berat).replace(',', '.'), rep: s.rep, rpe: s.rpe === '' ? '' : Math.round(num(s.rpe)), jenis: s.jenis || '' })) }));
  const selesai = new Date().toISOString(), title = (draft.hari || '').slice(0, 40);
  const last = { tanggal: today(), hari: title, menit: Math.max(1, Math.round(durSec() / 60)), vol: draftStats().vol, prs: draftPrs().length, items: items.map(it => ({ gerakan: it.gerakan, sets: it.sets })) };
  kvSet('x_lastw', last);
  enqueue('logMyWorkout', [today(), entries, { cid: draft.cid, mulai: draft.mulai, selesai, hari: title, rasa: draft.rasa || '', catatan: draft.catatan || '' }]);
  draft = null; kvSet('x_draft', null); rest = null;
  nav.tab = 'home'; nav.stack = []; render(); haptic(40); toast('Latihan tersimpan.');
  if (share) shareCard(last);
}
function routineFromDraft(old) {
  const d = old ? findRoutine(old) : null;
  rt = { old: old || '', hari: d ? d.hari : '', items: d ? d.items.map(it => ({ exId: it.exId, gerakan: it.gerakan, set: it.set || 3, repMin: it.repMin || 8, repMax: it.repMax || '' })) : [] };
}
const ACT = {
  noop() {},
  back() { back(); }, close() { closeSheet(); },
  tab(b) { setTab(b.dataset.t); }, go(b) { go(b.dataset.v); },
  goFoto() { closeSheet(true); nav.tab = 'pro'; nav.stack = []; go('foto'); },
  sync() { sync(true); }, plus() { plusSheet(); },
  async login() {
    const b = $('#go'); b.disabled = true; b.textContent = 'Masuk…';
    try { const r = await api('memberLoginByPhone', $('#ph').value); token = r.token; kvSet('x_token', token); kvSet('x_name', (r.member && r.member.name) || ''); }
    catch (e) { toast(e.server ? e.message : 'Perlu sinyal untuk masuk.'); }
    if (!token) { b.disabled = false; b.textContent = 'Masuk'; } else { sync(); render(); }   // beranda tampil seketika; data menyusul
  },
  startEmpty() { startRoutine(null); }, startR(b) { const d = findRoutine(b.dataset.h); if (d) startRoutine(d); },
  pickR() { const r = routines(), all = r.coach.concat(r.own); if (!all.length) return toast('Belum ada rutinitas.'); openSheet(`<div class="sh-h"><span class="t">Mulai rutinitas</span><button class="ib" data-a="close" aria-label="Tutup">${ic('x')}</button></div><div class="sh-b">${all.map(d => `<button class="li" data-a="startR" data-h="${esc(d.hari)}"><span class="ic">${ic(d.coach ? 'lock' : 'list')}</span><span class="clip" style="flex:1">${esc(d.hari)}<br><span class="mu">${d.items.length} gerakan</span></span>${ic('play')}</button>`).join('')}</div>`); },
  resume() { closeSheet(true); nav.tab = 'lat'; nav.stack = []; if (!wide()) go('log'); else render(); },
  finish() { if (!draft.items.some(it => it.sets.some(s => s.done || s.berat !== '' || s.rep !== ''))) return toast('Isi minimal satu set dulu.'); go('sum'); },
  discard() { if (confirm('Buang latihan ini? Set yang dicatat hilang.')) { draft = null; kvSet('x_draft', null); rest = null; nav.stack = []; render(); } },
  addSet(b) { const it = draft.items[b.dataset.i], p = it.sets[it.sets.length - 1]; it.sets.push({ berat: '', rep: '', rpe: '', jenis: '', done: false, phKg: p ? (p.berat || p.phKg) : '', phRep: p ? (p.rep || p.phRep) : '' }); dSave(); render(); },
  setDone(b) {
    const it = draft.items[b.dataset.i], s = it.sets[b.dataset.j];
    if (!s.done) {
      if (s.berat === '' && s.phKg !== '') s.berat = String(s.phKg);   // seperti Hevy: centang mengisi dari angka abu-abu
      if (s.rep === '' && s.phRep !== '') s.rep = String(s.phRep);
      if (s.berat === '' && s.rep === '') return toast('Isi kg atau rep dulu.');
      s.done = true; s.pr = false;
      const e = e1rm(s.berat, s.rep), best = (W().best || {})[keyOf(it)] || 0;
      const draftBest = Math.max(0, ...it.sets.filter(x => x !== s && x.done && !isWarm(x.jenis)).map(x => e1rm(x.berat, x.rep)));
      if (!isWarm(s.jenis) && best > 0 && e > best && e > draftBest) { s.pr = true; it.sets.forEach(x => { if (x !== s) x.pr = false; }); haptic(60); toast('Rekor baru: ' + it.gerakan + ' ' + fmt1(e) + ' kg est. 1RM'); }
      else haptic(12);
      const nextInSs = it.ss && draft.items[Number(b.dataset.i) + 1];
      if (!nextInSs) restStart(it.rest);
    } else { s.done = false; s.pr = false; }
    dSave(); render();
  },
  setKind(b) {
    const i = b.dataset.i, j = b.dataset.j;
    openSheet(`<div class="sh-h"><span class="t">Set ${Number(j) + 1}</span></div><div class="sh-b">${Object.entries(KIND).map(([k, v]) => `<button class="li" data-a="kindPick" data-i="${i}" data-j="${j}" data-k="${k}"><span class="ic"><b>${v[0] || Number(j) + 1}</b></span>${v[1]}</button>`).join('')}<button class="li" style="color:var(--dg)" data-a="setDel" data-i="${i}" data-j="${j}"><span class="ic">${ic('trash')}</span>Hapus set</button></div>`);
  },
  kindPick(b) { draft.items[b.dataset.i].sets[b.dataset.j].jenis = b.dataset.k; dSave(); closeSheet(); setTimeout(render, 0); },
  setDel(b) { draft.items[b.dataset.i].sets.splice(b.dataset.j, 1); dSave(); closeSheet(); setTimeout(render, 0); },
  exMenu(b) {
    const i = Number(b.dataset.i), it = draft.items[i];
    openSheet(`<div class="sh-h"><span class="t clip">${esc(it.gerakan)}</span></div><div class="sh-b">
      ${i < draft.items.length - 1 ? `<button class="li" data-a="exSs" data-i="${i}"><span class="ic">${ic('link')}</span>${it.ss ? 'Lepas superset' : 'Superset dengan berikutnya'}</button>` : ''}
      <button class="li" data-a="exMove" data-i="${i}" data-d="-1"><span class="ic">${ic('up')}</span>Pindah ke atas</button>
      <button class="li" data-a="exMove" data-i="${i}" data-d="1"><span class="ic">${ic('down')}</span>Pindah ke bawah</button>
      <div class="li"><span class="ic">${ic('clock')}</span>Istirahat<span class="r"><select class="inp" style="width:7rem" data-in="restSel" data-i="${i}">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map(s => `<option value="${s}"${num(it.rest) === s ? ' selected' : ''}>${restLabel(s)}</option>`).join('')}</select></span></div>
      <button class="li" style="color:var(--dg)" data-a="exDel" data-i="${i}"><span class="ic">${ic('trash')}</span>Hapus gerakan</button></div>`);
  },
  exSs(b) { const it = draft.items[b.dataset.i]; it.ss = !it.ss; dSave(); closeSheet(); setTimeout(render, 0); },
  exMove(b) { const i = Number(b.dataset.i), j = i + Number(b.dataset.d); if (j < 0 || j >= draft.items.length) return; const a = draft.items; [a[i], a[j]] = [a[j], a[i]]; dSave(); closeSheet(); setTimeout(render, 0); },
  exDel(b) { draft.items.splice(b.dataset.i, 1); dSave(); closeSheet(); setTimeout(render, 0); },
  exAdd(b) { exOpen(b.dataset.m); },
  exEq(b) { exs.eq = exs.eq === b.dataset.v ? '' : b.dataset.v; exPaint(); },
  exMu(b) { exs.mu = exs.mu === b.dataset.v ? '' : b.dataset.v; exPaint(); },
  exPick(b) { const id = b.dataset.x, k = exs.picked.indexOf(id); if (k === -1) exs.picked.push(id); else exs.picked.splice(k, 1); exPaint(); },
  exCustom() { exCommit([{ exId: '', gerakan: exs.q.trim().slice(0, 80) }]); },
  exGo() { exCommit(exs.picked.map(id => { const x = lib.ex.find(e => e.id === id); return { exId: id, gerakan: x.n }; })); },
  rest(b) { const d = Number(b.dataset.d); if (!d) { rest = null; restPaint(); return; } if (rest) { rest.end += d * 1000; rest.total = Math.max(rest.total, Math.round((rest.end - Date.now()) / 1000)); restPaint(); } },
  rasa(b) { draft.rasa = Number(b.dataset.v); dSave(); render(); },
  save(b) { saveWorkout(!!b.dataset.share); },
  rtNew() { routineFromDraft(''); go('rted'); },
  rtMenu(b) { const h = b.dataset.h; openSheet(`<div class="sh-h"><span class="t clip">${esc(h)}</span></div><div class="sh-b"><button class="li" data-a="rtEdit" data-h="${esc(h)}"><span class="ic">${ic('edit')}</span>Ubah rutinitas</button><button class="li" style="color:var(--dg)" data-a="rtRemove" data-h="${esc(h)}"><span class="ic">${ic('trash')}</span>Hapus rutinitas</button></div>`); },
  rtEdit(b) { closeSheet(true); routineFromDraft(b.dataset.h); go('rted'); },
  rtRemove(b) { const h = b.dataset.h; if (!confirm('Hapus rutinitas ' + h + '?')) return; closeSheet(true); more.program.own = (more.program.own || []).filter(d => d.hari !== h); saveMore(); enqueue('deleteMyRoutine', [h]); },
  rtMove(b) { const i = Number(b.dataset.i), j = i + Number(b.dataset.d); if (j < 0 || j >= rt.items.length) return; [rt.items[i], rt.items[j]] = [rt.items[j], rt.items[i]]; render(); },
  rtDel(b) { rt.items.splice(b.dataset.i, 1); render(); },
  rtSave() {
    const hari = rt.hari.trim();
    if (!hari) return toast('Beri nama rutinitas.');
    if (!rt.items.length) return toast('Tambahkan minimal satu gerakan.');
    const all = routines(); if (all.coach.concat(all.own).some(d => d.hari.toLowerCase() === hari.toLowerCase() && d.hari !== rt.old)) return toast('Nama itu sudah dipakai.');
    const day = { hari, items: rt.items.map(it => ({ gerakan: it.gerakan, exId: it.exId, jenis: 'beban', set: Math.max(1, Math.min(20, Math.round(num(it.set)) || 3)), repMin: Math.max(1, Math.round(num(it.repMin)) || 8), repMax: num(it.repMax) > num(it.repMin) ? Math.round(num(it.repMax)) : '' })) };
    if (!more.program || more.program.error) more.program = { days: [], own: [] };
    const own = more.program.own || (more.program.own = []), k = own.findIndex(d => d.hari === rt.old);
    if (rt.old && k !== -1) own[k] = day; else own.push(day);
    saveMore(); enqueue('saveMyRoutine', [rt.old, day]); rt = null; back(); toast('Rutinitas tersimpan.');
  },
  foodAdd(b) { closeSheet(true); if (nav.tab !== 'mak') setTab('mak'); foodOpen(b.dataset.w || mealNow()); },
  foodPick(b) { const f = lib.food.find(x => x.id === b.dataset.id); fs.pick = f; fs.gram = f.por && f.por[0] ? f.por[0][1] : 100; closeSheet(true); foodPaint(true); },
  foodBack() { fs.pick = null; closeSheet(true); foodPaint(true); },
  foodPor(b) { fs.gram = Number(b.dataset.g); closeSheet(true); foodPaint(true); },
  foodW(b) { fs.waktu = b.dataset.w; document.querySelectorAll('[data-a="foodW"]').forEach(x => x.classList.toggle('on', x === b)); },
  foodSave() { const g = num(fs.gram); if (!(g > 0 && g <= 5000)) return toast('Isi gram dengan benar.'); const f = fs.pick, w = fs.waktu; closeSheet(); foodLog(f, Math.round(g * 10) / 10, w); toast('Tercatat.'); },
  async foodSug(b) { await loadLib('food'); const f = lib.food.find(x => x.id === b.dataset.id); if (!f) return toast('Makanan tidak ada di daftar.'); foodLog(f, num(b.dataset.g), b.dataset.w); },
  foodDel(b) { delIds.push(b.dataset.id); kvSet('x_del', delIds); enqueue('deleteMyFood', [b.dataset.id]); },
  foodUnq(b) { queue = queue.filter(q => q.id !== b.dataset.id); qSave(); render(); },
  metric(b) { chartMetric = b.dataset.v; render(); },
  ukrKey(b) { ukrKey = b.dataset.v; render(); }, ukrRange(b) { ukrRange = Number(b.dataset.v); render(); },
  measure() { closeSheet(true); measureSheet(); },
  measureSave() {
    const d = { cid: uid(), tanggal: today() };
    document.querySelectorAll('#sheet [data-m]').forEach(el => { if (el.value.trim()) d[el.dataset.m] = el.value.replace(',', '.'); });
    if (Object.keys(d).length < 3) return toast('Isi minimal satu ukuran.');
    const p = PR(); if (p) { p.entries = (p.entries || []).filter(e => e.tanggal !== d.tanggal).concat([{ ...d }]); saveMore(); }
    closeSheet(); enqueue('saveMyMeasurement', [d]); toast('Tersimpan.');
  },
  photoAdd(b) { photoSide = b.dataset.v; const f = $('#pf'); f.value = ''; f.click(); },
  async photoView(b) {
    const id = b.dataset.id;
    try { if (!photoCache[id]) { toast('Memuat foto…'); photoCache[id] = (await api('getMyProgressPhoto', token, id)).dataUrl; }
      openSheet(`<div class="sh-h"><span class="t">Foto</span><button class="ib" data-a="close" aria-label="Tutup">${ic('x')}</button></div><div class="sh-b"><img src="${photoCache[id]}" alt="Foto progres" style="width:100%;border-radius:12px"></div><div class="sh-f"><button class="btn d w" data-a="photoDel" data-id="${esc(id)}">${ic('trash')} Hapus foto</button></div>`, true); }
    catch (er) { toast(er.server ? er.message : 'Perlu sinyal untuk melihat foto.'); }
  },
  async photoDel(b) { if (!confirm('Hapus foto ini?')) return; try { await api('deleteMyProgressPhoto', token, b.dataset.id); delete photoCache[b.dataset.id]; closeSheet(); await sync(true); } catch (er) { toast(er.server ? er.message : 'Perlu sinyal.'); } },
  gerakD(b) { if (nav.tab !== 'pro') { nav.tab = 'pro'; nav.stack = []; } go('gerakD', { k: b.dataset.k }); },
  theme(b) { kvSet('x_theme', b.dataset.v || null); render(); },
  share(b) { openShare(b.dataset.k); },
  remindSave() { remindSave(); },
  retry(b) { const f = failed.find(x => x.id === b.dataset.id); failed = failed.filter(x => x !== f); fSave(); enqueue(f.fn, f.args); },
  drop(b) { failed = failed.filter(x => x.id !== b.dataset.id); fSave(); render(); },
  logout() { if (queue.length && !confirm('Masih ada ' + queue.length + ' catatan belum terkirim. Keluar akan membuangnya. Lanjut?')) return; logout(); }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.a];
  if (f) { e.preventDefault(); f(b); }
});
// Isian: simpan ke state tanpa render ulang (fokus dan keyboard tetap).
document.addEventListener('input', e => {
  const el = e.target, k = el.dataset && el.dataset.in;
  if (!k) return;
  if (k === 'berat' || k === 'rep' || k === 'rpe') { draft.items[el.dataset.i].sets[el.dataset.j][k] = el.value; dSave(); }
  else if (k === 'title') { draft.hari = el.value; dSave(); }
  else if (k === 'note') { draft.catatan = el.value; dSave(); }
  else if (k === 'exq') { exs.q = el.value.trim(); exPaint(); }
  else if (k === 'foodq') { fs.q = el.value.trim(); foodPaint(); }
  else if (k === 'foodG') { fs.gram = num(el.value); const f = fs.pick, x = fs.gram / 100, s = $('#foodSum'); if (s) s.innerHTML = `<div><div class="k">Kalori</div><div class="b">${fmt(f.kal * x)}</div></div><div><div class="k">Protein</div><div class="b">${fmt1(f.p * x)} g</div></div><div><div class="k">Karbo</div><div class="b">${fmt1(f.k * x)} g</div></div><div><div class="k">Lemak</div><div class="b">${fmt1(f.l * x)} g</div></div>`; }
  else if (k === 'rtName') rt.hari = el.value;
  else if (k === 'rtSet') rt.items[el.dataset.i].set = el.value;
  else if (k === 'rtMin') rt.items[el.dataset.i].repMin = el.value;
  else if (k === 'rtMax') rt.items[el.dataset.i].repMax = el.value;
});
document.addEventListener('change', async e => {
  const el = e.target, k = el.dataset && el.dataset.in;
  if (k === 'restSel') { draft.items[el.dataset.i].rest = Number(el.value); dSave(); closeSheet(); setTimeout(render, 0); }
  else if (k === 'photoFile') {
    const f = el.files[0]; if (!f) return;
    if (!navigator.onLine) return toast('Perlu sinyal untuk mengirim foto.');
    try { toast('Mengirim foto…'); await api('uploadMyProgressPhoto', token, await shrink(f), 'image/jpeg', photoSide); toast('Foto tersimpan.'); await sync(); }
    catch (er) { if (er.auth) logout(); else toast(er.server ? er.message : 'Foto gagal dikirim.'); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ph') ACT.login();
  if (e.key === 'Escape' && sheetOn) closeSheet();
});

// ── Mulai ──────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
kvOpen().then(() => {
  token = kv('x_token', ''); more = kv('x_more', null); queue = kv('x_queue', []); failed = kv('x_failed', []); draft = kv('x_draft', null); delIds = kv('x_del', []);
  if (draft) draft.items.forEach(it => { it.sets.forEach(s => { if (s.rpe === undefined) s.rpe = ''; if (s.phKg === undefined) s.phKg = ''; if (s.phRep === undefined) s.phRep = ''; }); if (!it.rest) it.rest = 90; });   // draf versi lama
  render(); sync();
  if (remindGet().on) remindApply(remindGet());   // jadwal ulang tiap buka (aman diulang)
});
