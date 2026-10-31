'use strict';
// XNK Catat: app klien mandiri. Data di IndexedDB (cadangan localStorage), antrian dikirim ke Apps Script lewat doPost.
const EXEC = 'https://script.google.com/macros/s/AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MEALS = ['sarapan', 'siang', 'malam', 'camilan'];

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

let tab = 'w';
let token, more, queue, failed, draft, delIds;
let lib = { ex: null, food: null };
const photoCache = {};   // dataUrl foto hanya di memori, tidak disimpan (foto bersifat privat)

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }

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
function enqueue(fn, args) { queue.push({ id: uid(), fn, args }); qSave(); render(); sync(); }

let syncing = false;
async function sync(manual) {
  if (!token || syncing || !navigator.onLine) { if (manual) toast('Tidak ada sinyal.'); return; }
  syncing = true; $('#st').textContent = 'Sinkron…';
  try {
    while (queue.length) {
      const q = queue[0];
      try { await api(q.fn, token, ...q.args); }
      catch (e) {
        if (!e.server || e.auth) throw e;                     // jaringan / balasan rusak / sesi: berhenti, coba lagi nanti
        if (!(q.fn === 'deleteMyFood' && /tidak ditemukan/.test(e.message))) {   // hapus yang sudah terhapus bukan masalah
          failed.push({ id: q.id, fn: q.fn, args: q.args, error: e.message, at: Date.now() }); fSave();
          toast('Ditolak server. Lihat tab Foto → Ditolak.');
        }
      }
      queue.shift(); qSave();
    }
    more = await api('getPortalMore', token); kvSet('x_more', more);
    delIds = []; kvSet('x_del', delIds);
    $('#st').textContent = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    if (e.auth) { logout(); toast('Sesi berakhir. Masuk lagi.'); }
    else $('#st').textContent = 'Offline';
  } finally { syncing = false; render(); }
}
function logout() { remindApply(null); ['x_name', 'x_remind', 'x_token', 'x_more', 'x_queue', 'x_failed', 'x_draft', 'x_del', 'x_lastw'].forEach(k => kvSet(k, null)); token = more = draft = null; queue = []; failed = []; delIds = []; render(); }
addEventListener('online', () => sync());

// ── Pustaka (di-cache service worker) ────────────────────────────────────────────
async function loadLib(k) {
  if (lib[k]) return lib[k];
  const url = k === 'ex' ? '../exercises/exercises.min.json' : '../foods/foods.min.json';
  try { lib[k] = (await (await fetch(url)).json()).items; } catch (e) { lib[k] = []; toast('Daftar belum bisa dimuat.'); }
  return lib[k];
}

// ── Layar ──────────────────────────────────────────────────────────────────
function render() {
  const ok = !!token;
  $('#nav').classList.toggle('hide', !ok); $('#syncb').classList.toggle('hide', !ok);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (!ok) { $('#st').textContent = ''; return loginView(); }
  if (queue.length) $('#st').textContent = 'Antrian ' + queue.length;
  else if (!navigator.onLine) $('#st').textContent = 'Offline';
  ({ w: workoutView, f: foodView, m: measureView, p: photoView })[tab]();
}

function loginView() {
  $('#main').innerHTML = `<div class="card"><h2>Masuk</h2><p class="mut">Pakai nomor WhatsApp yang terdaftar di XNK. Perlu sinyal sekali saja.</p>
  <input id="ph" type="tel" inputmode="numeric" placeholder="08xxxxxxxxxx"><div class="row" style="margin-top:10px"><button class="p" id="go" style="flex:1">Masuk</button></div></div>`;
  $('#go').onclick = async () => {
    $('#go').disabled = true;
    try { const r = await api('memberLoginByPhone', $('#ph').value); token = r.token; kvSet('x_token', token); kvSet('x_name', (r.member && r.member.name) || ''); await sync(); }
    catch (e) { toast(e.message || 'Gagal masuk.'); }
    $('#go').disabled = false; render();
  };
}

// Latihan ---------------------------------------------------------------------
const keyOf = it => it.exId ? 'ex:' + it.exId : 'nm:' + it.gerakan.trim().toLowerCase();
const wk = () => (more && more.workout) || {};
const lastSets = key => (wk().last && wk().last[key]) || null;
function dSave() { kvSet('x_draft', draft); }
const setLine = sets => sets.map(s => (s.berat || 0) + '×' + (s.rep || 0)).join(', ');
const volume = items => Math.round(items.reduce((a, it) => a + it.sets.reduce((b, s) => b + (Number(String(s.berat).replace(',', '.')) || 0) * (Number(s.rep) || 0), 0), 0));

function fromProgramDay(d) {
  return { cid: uid(), mulai: new Date().toISOString(), hari: d.hari, items: d.items.map(it => {
    const n = (it.skema && it.skema.length) || it.set || 3, sug = (wk().suggest || {})[keyOf({ exId: it.exId, gerakan: it.gerakan })];
    return { exId: it.exId, gerakan: it.gerakan, sets: Array.from({ length: n }, (_, i) => {
      const sk = it.skema && it.skema[i];
      return { berat: sk && sk.kg !== '' ? sk.kg : (sug && sug.kg) || it.kg || '', rep: sk && sk.rep !== '' ? sk.rep : it.repMax || '' };
    }) };
  }) };
}

function workoutView() {
  if (!draft) {
    const ses = wk().sessions || [], pg = (more && more.program) || {}, days = (pg.days || []).concat(pg.own || []);
    const next = wk().next;
    $('#main').innerHTML = `<button class="p" id="start" style="width:100%">Mulai latihan kosong</button>` +
      (days.length ? `<h2 style="margin-top:20px">Program</h2>` + days.map((d, i) => `<div class="card"><div class="row"><b style="flex:1">${esc(d.hari)}</b>${next && next.hari === d.hari ? '<span class="mut">berikutnya</span>' : ''}<button data-pd="${i}">Mulai</button></div><div class="mut">${esc(d.items.map(x => x.gerakan).join(' · '))}</div></div>`).join('') : '') +
      (kv('x_lastw') ? `<button id="shl" style="width:100%;margin-top:12px">Bagikan latihan terakhir</button>` : '') +
      `<button id="shm" style="width:100%;margin-top:8px">Kartu bagikan lainnya</button>` +
      `<h2 style="margin-top:20px">Riwayat</h2>` + (ses.length ? ses.slice(0, 10).map(s => `<div class="card"><b>${esc(s.tanggal)}</b> ${esc(s.hari || '')}<div class="mut">${s.durasi ? Math.round(s.durasi / 60) + ' menit' : ''}</div></div>`).join('') : '<p class="mut">Belum ada. Setelah sinkron, riwayat muncul di sini.</p>');
    $('#start').onclick = () => { draft = { cid: uid(), mulai: new Date().toISOString(), items: [] }; dSave(); render(); };
    $('#main').querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { draft = fromProgramDay(days[b.dataset.pd]); dSave(); render(); });
    if ($('#shl')) $('#shl').onclick = () => shareCard(kv('x_lastw'));
    $('#shm').onclick = () => openShare('latihan');
    return;
  }
  $('#main').innerHTML = (draft.hari ? `<h2>${esc(draft.hari)}</h2>` : '') + draft.items.map((it, i) => {
    const last = lastSets(keyOf(it));
    return `<div class="card"><div class="row"><b style="flex:1">${esc(it.gerakan)}</b><button class="d" data-rm="${i}">Hapus</button></div>
    ${last ? `<div class="mut">Sebelumnya: ${esc(setLine(last.sets || []))}</div>` : ''}
    ${it.sets.map((s, j) => `<div class="sets"><span class="mut">${j + 1}</span><input type="text" inputmode="decimal" placeholder="kg" value="${esc(s.berat)}" data-i="${i}" data-j="${j}" data-k="berat"><input type="text" inputmode="numeric" placeholder="rep" value="${esc(s.rep)}" data-i="${i}" data-j="${j}" data-k="rep"><button data-ds="${i}:${j}">×</button></div>`).join('')}
    <button data-as="${i}">+ Set</button></div>`;
  }).join('') + `<div class="card"><input id="exq" placeholder="Cari gerakan (mis. bench press)"><div id="exr"></div></div>
  <div class="row"><button class="p" id="fin" style="flex:1">Selesai</button><button class="d" id="drop">Batal</button></div>`;
  $('#main').querySelectorAll('input[data-k]').forEach(el => el.oninput = () => { draft.items[el.dataset.i].sets[el.dataset.j][el.dataset.k] = el.value; dSave(); });
  $('#main').querySelectorAll('[data-as]').forEach(b => b.onclick = () => { const it = draft.items[b.dataset.as], p = it.sets[it.sets.length - 1]; it.sets.push({ berat: p ? p.berat : '', rep: p ? p.rep : '' }); dSave(); render(); });
  $('#main').querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { const [i, j] = b.dataset.ds.split(':'); draft.items[i].sets.splice(j, 1); dSave(); render(); });
  $('#main').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { draft.items.splice(b.dataset.rm, 1); dSave(); render(); });
  $('#exq').oninput = async e => {
    const q = e.target.value.trim().toLowerCase(); if (q.length < 2) { $('#exr').innerHTML = ''; return; }
    const hits = (await loadLib('ex')).filter(x => x.n.includes(q)).slice(0, 8);
    $('#exr').innerHTML = hits.map(x => `<div class="hit" data-x="${esc(x.id)}">${esc(x.n)} <span class="mut">${esc(x.t)}</span></div>`).join('') + `<div class="hit mut" data-x="">Tambah “${esc(q)}” sendiri</div>`;
    $('#exr').querySelectorAll('[data-x]').forEach(h => h.onclick = () => {
      const id = h.dataset.x, ex = id && lib.ex.find(x => x.id === id);
      draft.items.push({ exId: id, gerakan: ex ? ex.n : q, sets: [{ berat: '', rep: '' }] }); dSave(); render();
    });
  };
  $('#drop').onclick = () => { if (confirm('Buang latihan ini?')) { draft = null; kvSet('x_draft', null); render(); } };
  $('#fin').onclick = () => {
    const items = draft.items.map(it => ({ ...it, sets: it.sets.filter(s => s.berat !== '' || s.rep !== '') })).filter(it => it.sets.length);
    if (!items.length) return toast('Isi minimal satu set.');
    const entries = items.map((it, n) => ({ n: n + 1, hari: draft.hari || '', exId: it.exId, gerakan: it.gerakan,
      sets: it.sets.map(s => ({ berat: String(s.berat).replace(',', '.'), rep: s.rep, jenis: '' })) }));
    const selesai = new Date().toISOString();
    const last = { tanggal: today(), hari: draft.hari || '', menit: Math.max(1, Math.round((Date.parse(selesai) - Date.parse(draft.mulai)) / 60000)), vol: volume(items), items: items.map(it => ({ gerakan: it.gerakan, sets: it.sets })) };
    kvSet('x_lastw', last);
    enqueue('logMyWorkout', [today(), entries, { cid: draft.cid, mulai: draft.mulai, selesai, hari: draft.hari || '' }]);
    draft = null; kvSet('x_draft', null); toast('Tersimpan. Dikirim saat ada sinyal.'); render();
    if (confirm('Bagikan kartu latihan?')) shareCard(last);
  };
}

// Kartu bagikan: PNG transparan digambar di browser, tanpa unggah ke mana pun --------------
function shareCard(w) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 14; x.textBaseline = 'top';
  x.font = '700 56px system-ui,sans-serif'; x.fillText((w.hari || 'Latihan').slice(0, 24), 70, 90);
  x.font = '400 36px system-ui,sans-serif'; x.fillText(w.tanggal, 70, 165);
  [['Durasi', w.menit + ' mnt'], ['Volume', w.vol + ' kg']].forEach((s, i) => { x.font = '400 32px system-ui,sans-serif'; x.fillText(s[0], 70 + i * 420, 260); x.font = '700 80px system-ui,sans-serif'; x.fillText(s[1], 70 + i * 420, 305); });
  w.items.slice(0, 7).forEach((it, i) => {
    const best = it.sets.reduce((b, s) => (Number(s.berat) || 0) >= (Number(b.berat) || 0) ? s : b, it.sets[0]);
    x.font = '600 42px system-ui,sans-serif'; x.fillText(it.gerakan.slice(0, 26), 70, 470 + i * 110);
    x.font = '400 34px system-ui,sans-serif'; x.fillText(it.sets.length + ' set · terbaik ' + (best.berat || 0) + ' kg × ' + (best.rep || 0), 70, 520 + i * 110);
  });
  x.font = '700 44px system-ui,sans-serif'; x.fillText('XNK', 70, 1230);
  c.toBlob(async b => {
    const f = new File([b], 'latihan-xnk.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click();
  }, 'image/png');
}

// Makan -----------------------------------------------------------------------
function foodView() {
  const n = more && more.nutrition && more.nutrition.enabled ? more.nutrition : null;
  const sent = (n && n.log && n.log.tanggal === today() ? n.log.items : []).filter(x => !delIds.includes(x.id));
  const pend = queue.filter(q => q.fn === 'logMyFood' && q.args[0].tanggal === today());
  const kal = sent.reduce((a, x) => a + (x.kal || 0), 0) + pend.reduce((a, q) => a + (q.args[0]._kal || 0), 0);
  const menu = n && n.menu && n.menu.meals;
  $('#main').innerHTML = `<div class="card"><div class="mut">Hari ini</div><div class="big">${kal} <span class="mut">/ ${n && n.target && n.target.kal ? n.target.kal : '–'} kkal</span></div></div>
  <div class="card"><h2>Catat makanan</h2><input id="fq" placeholder="Cari (mis. nasi putih)"><div id="fr"></div></div>
  <h2>Hari ini</h2>` + (sent.length + pend.length ? sent.map(x => `<div class="row hit"><span style="flex:1">${esc(x.nama)} <span class="mut">${esc(x.porsi || '')} · ${x.kal} kkal</span></span><button class="d" data-del="${esc(x.id)}">×</button></div>`).join('') +
    pend.map(q => `<div class="row hit"><span style="flex:1">${esc(q.args[0]._nama)} <span class="mut">${q.args[0].gram} g · ${q.args[0]._kal} kkal · menunggu</span></span><button class="d" data-dq="${q.id}">×</button></div>`).join('') : '<p class="mut">Belum ada catatan.</p>') +
    (menu ? `<h2 style="margin-top:20px">Menu hari ini</h2>` + menu.map((m, mi) => `<div class="card"><b>${esc(m.label || m.key)}</b> <span class="mut">${Math.round((m.totals && m.totals.kal) || 0)} kkal</span>` +
      (m.items || []).map((it, ii) => `<div class="row hit"><span style="flex:1">${esc(it.n || it.nama)} <span class="mut">${esc(it.gram)} g · ${Math.round(it.kal || 0)} kkal</span></span><button data-mi="${mi}:${ii}">Catat</button></div>`).join('') + `</div>`).join('') : '');
  $('#main').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { delIds.push(b.dataset.del); kvSet('x_del', delIds); enqueue('deleteMyFood', [b.dataset.del]); });
  $('#main').querySelectorAll('[data-dq]').forEach(b => b.onclick = () => { queue = queue.filter(q => q.id !== b.dataset.dq); qSave(); render(); });
  $('#main').querySelectorAll('[data-mi]').forEach(b => b.onclick = () => {
    const [mi, ii] = b.dataset.mi.split(':'), m = menu[mi], it = m.items[ii];
    enqueue('logMyFood', [{ cid: uid(), tanggal: today(), waktu: MEALS.includes(m.key) ? m.key : 'camilan', id: it.id, gram: Math.round(it.gram), _kal: Math.round(it.kal || 0), _nama: it.n || it.nama }]);
  });
  $('#fq').oninput = async e => {
    const q = e.target.value.trim().toLowerCase(); if (q.length < 2) { $('#fr').innerHTML = ''; return; }
    const hits = (await loadLib('food')).filter(x => x.n.toLowerCase().includes(q)).slice(0, 8);
    $('#fr').innerHTML = hits.map(x => `<div class="hit" data-f="${esc(x.id)}">${esc(x.n)} <span class="mut">${x.kal} kkal/100 g</span></div>`).join('');
    $('#fr').querySelectorAll('[data-f]').forEach(h => h.onclick = () => foodAdd(lib.food.find(x => x.id === h.dataset.f)));
  };
}
function foodAdd(f) {
  $('#fr').innerHTML = `<div class="hit"><b>${esc(f.n)}</b><div class="row" style="margin-top:8px"><input id="fg" type="text" inputmode="numeric" value="${f.por[0][1]}" style="width:90px"><span class="mut">gram</span>
  <select id="fw">${MEALS.map(m => `<option>${m}</option>`).join('')}</select></div><button class="p" id="fok" style="width:100%">Simpan</button></div>`;
  $('#fok').onclick = () => {
    const gram = Number($('#fg').value.replace(',', '.'));
    if (!(gram > 0 && gram <= 5000)) return toast('Isi gram dengan benar.');
    // _kal/_nama hanya untuk tampilan lokal; server menghitung ulang dari id + gram
    enqueue('logMyFood', [{ cid: uid(), tanggal: today(), waktu: $('#fw').value, id: f.id, gram, _kal: Math.round(f.kal * gram / 100), _nama: f.n }]);
  };
}

// Ukuran ------------------------------------------------------------------------
function measureView() {
  const ms = (more && more.progress && more.progress.measures) || [{ key: 'berat', label: 'Berat', short: 'Berat', unit: 'kg' }, { key: 'pinggang', label: 'Lingkar pinggang', short: 'Pinggang', unit: 'cm' }];
  const es = (more && more.progress && more.progress.entries) || [];
  $('#main').innerHTML = `<div class="card"><h2>Catat ukuran</h2>` + ms.map(m => `<div class="row"><span style="width:9rem">${esc(m.label)}</span><input data-m="${esc(m.key)}" type="text" inputmode="decimal" placeholder="${esc(m.unit)}"></div>`).join('') +
    `<button class="p" id="ms" style="width:100%">Simpan</button></div><h2>Riwayat</h2>` +
    (es.length ? es.slice(-8).reverse().map(e => `<div class="hit"><b>${esc(e.tanggal)}</b> <span class="mut">${esc(ms.filter(m => e[m.key] !== '' && e[m.key] != null).map(m => m.short + ' ' + e[m.key]).join(' · '))}</span></div>`).join('') : '<p class="mut">Belum ada.</p>');
  $('#ms').onclick = () => {
    const d = { cid: uid(), tanggal: today() };
    document.querySelectorAll('[data-m]').forEach(el => { if (el.value.trim()) d[el.dataset.m] = el.value.replace(',', '.'); });
    if (Object.keys(d).length < 3) return toast('Isi minimal satu ukuran.');
    enqueue('saveMyMeasurement', [d]); toast('Tersimpan.');
  };
}

// Foto progres + item ditolak -------------------------------------------------------
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
function photoView() {
  const ph = (more && more.progress && more.progress.photos) || [];
  $('#main').innerHTML = `<div class="card"><h2>Foto progres</h2><p class="mut">Pribadi, hanya kamu dan coach yang melihat. Perlu sinyal untuk kirim dan lihat foto.</p>
  <div class="row"><button class="p" data-side="depan" style="flex:1">Foto depan</button><button class="p" data-side="samping" style="flex:1">Foto samping</button></div>
  <input id="pf" type="file" accept="image/*" class="hide"></div>` +
    (ph.length ? ph.map(p => `<div class="card"><div class="row"><b style="flex:1">${esc(p.tanggal)} · ${esc(p.sisi)}</b><button data-pv="${esc(p.id)}">Lihat</button><button class="d" data-pdl="${esc(p.id)}">Hapus</button></div><div id="im-${esc(p.id)}">${photoCache[p.id] ? `<img src="${photoCache[p.id]}" style="width:100%;border-radius:10px">` : ''}</div></div>`).join('') : '<p class="mut">Belum ada foto.</p>') +
    (failed.length ? `<h2 style="margin-top:20px">Ditolak server (${failed.length})</h2>` + failed.map(f => `<div class="card"><div class="mut">${esc(f.fn)}</div><div>${esc(f.error)}</div><div class="row" style="margin-top:8px"><button data-retry="${f.id}">Coba lagi</button><button class="d" data-drop="${f.id}">Buang</button></div></div>`).join('') : '') +
    `<div class="card"><h2>Kartu bagikan</h2><div class="row" style="flex-wrap:wrap">${Object.entries(SHARE_KINDS).map(([k, l]) => `<button data-sk="${k}">${l}</button>`).join('')}</div></div>` +
    remindHtml() + `<div class="card"><button class="d" id="out" style="width:100%">Keluar</button></div>`;
  remindBind();
  let side = '';
  $('#main').querySelectorAll('[data-sk]').forEach(b => b.onclick = () => openShare(b.dataset.sk));
  $('#main').querySelectorAll('[data-side]').forEach(b => b.onclick = () => { side = b.dataset.side; $('#pf').value = ''; $('#pf').click(); });
  $('#pf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!navigator.onLine) return toast('Perlu sinyal untuk mengirim foto.');
    try { toast('Mengirim foto…'); await api('uploadMyProgressPhoto', token, await shrink(f), 'image/jpeg', side); toast('Foto tersimpan.'); await sync(true); }
    catch (er) { if (er.auth) { logout(); } else toast(er.message || 'Foto gagal dikirim.'); }
  };
  $('#main').querySelectorAll('[data-pv]').forEach(b => b.onclick = async () => {
    const id = b.dataset.pv;
    try { if (!photoCache[id]) photoCache[id] = (await api('getMyProgressPhoto', token, id)).dataUrl; $('#im-' + id).innerHTML = `<img src="${photoCache[id]}" style="width:100%;border-radius:10px">`; }
    catch (er) { toast(er.message || 'Foto belum bisa dimuat.'); }
  });
  $('#main').querySelectorAll('[data-pdl]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus foto ini?')) return;
    try { await api('deleteMyProgressPhoto', token, b.dataset.pdl); delete photoCache[b.dataset.pdl]; await sync(true); } catch (er) { toast(er.message || 'Gagal menghapus.'); }
  });
  $('#main').querySelectorAll('[data-retry]').forEach(b => b.onclick = () => { const f = failed.find(x => x.id === b.dataset.retry); failed = failed.filter(x => x !== f); fSave(); enqueue(f.fn, f.args); });
  $('#main').querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { failed = failed.filter(x => x.id !== b.dataset.drop); fSave(); render(); });
  $('#out').onclick = () => { if (queue.length && !confirm('Masih ada ' + queue.length + ' catatan belum terkirim. Keluar akan membuangnya. Lanjut?')) return; logout(); };
}

// Editor kartu bagikan: share.html (dibuat dari Bagikan.html milik panel) berjalan di iframe layar penuh. ──
// Data dari salinan lokal; hanya periode lain dan foto yang butuh sinyal (RPC lewat sini, token tidak masuk iframe).
const SHARE_KINDS = { latihan: 'Latihan', rekap: 'Rekap bulan', progres: 'Progres', gizi: 'Gizi', ukuran: 'Ukuran tubuh', badges: 'Badge', konsistensi: 'Konsistensi', foto: 'Foto progres' };
const SHARE_RPC = ['getMyShareData', 'getMyProgressPhoto'];
let shareJob = null;
const nativeShare = () => { const P = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins; return P && P.Share && P.Filesystem ? P : null; };
function openShare(kind) {
  if (!more) return toast('Sinkron dulu untuk membuka kartu.');
  const first = String(kv('x_name', '')).trim().split(/\s+/)[0] || '';
  const prog = more.progress && !more.progress.error ? more.progress : null;
  shareJob = { kind, opts: {}, src: { today: today(), date: today(), admin: false, first,
    workout: more.workout && !more.workout.error ? more.workout : null, progress: prog, share: more.share && !more.share.error ? more.share : null,
    nutrition: more.nutrition, photos: (prog && prog.photos) || [] } };
  const f = document.createElement('iframe'); f.id = 'shf'; f.src = 'share.html';
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:50;background:#000'; document.body.appendChild(f);
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

// Pengingat lokal (opt-in): notifikasi harian dari perangkat, jalan tanpa sinyal. Hanya di app Android (Capacitor). ──
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
  if (!LN()) return `<div class="card"><h2>Pengingat</h2><p class="mut">Pengingat di perangkat tersedia di aplikasi Android XNK Catat.</p></div>`;
  const r = remindGet(), t = (id, v) => `<input id="${id}" type="time" value="${esc(v)}" style="width:8.5rem">`;
  return `<div class="card"><h2>Pengingat</h2><p class="mut">Notifikasi harian dari perangkat, tanpa sinyal. Pesan dari coach lewat WhatsApp tidak berubah.</p>
  <div class="row"><label style="flex:1">Aktifkan</label><input id="rm-on" type="checkbox" ${r.on ? 'checked' : ''} style="width:auto;min-height:0"></div>
  <div class="row"><span style="flex:1">Latihan</span>${t('rm-w', r.w)}</div>
  <div class="row"><span style="flex:1">Sarapan</span>${t('rm-f0', r.f[0])}</div>
  <div class="row"><span style="flex:1">Makan siang</span>${t('rm-f1', r.f[1])}</div>
  <div class="row"><span style="flex:1">Makan malam</span>${t('rm-f2', r.f[2])}</div>
  <button class="p" id="rm-save" style="width:100%">Simpan pengingat</button></div>`;
}
function remindBind() {
  if (!$('#rm-save')) return;
  $('#rm-save').onclick = async () => {
    const r = { on: $('#rm-on').checked, w: $('#rm-w').value || REMIND_DEF.w, f: [0, 1, 2].map(i => $('#rm-f' + i).value || REMIND_DEF.f[i]) };
    if (r.on) { const p = await LN().requestPermissions(); if (p.display !== 'granted') { $('#rm-on').checked = false; return toast('Izin notifikasi ditolak. Aktifkan di pengaturan Android.'); } }
    kvSet('x_remind', r); await remindApply(r); toast(r.on ? 'Pengingat aktif.' : 'Pengingat dimatikan.');
  };
}

// ── Mulai ──────────────────────────────────────────────────────────────────
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
$('#syncb').onclick = () => sync(true);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
kvOpen().then(() => {
  token = kv('x_token', ''); more = kv('x_more', null); queue = kv('x_queue', []); failed = kv('x_failed', []); draft = kv('x_draft', null); delIds = kv('x_del', []);
  render(); sync();
  if (remindGet().on) remindApply(remindGet());   // jadwal ulang tiap buka (aman diulang)
});
