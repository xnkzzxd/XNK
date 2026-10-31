'use strict';
// XNK Catat: app klien mandiri. Data lokal di localStorage, antrian dikirim ke Apps Script lewat doPost.
// ponytail: localStorage (~5 MB) cukup untuk antrian + salinan data; pindah ke IndexedDB bila foto/riwayat besar.
const EXEC = 'https://script.google.com/macros/s/AKfycbyVOm1Csc7UmCxPe3buHUkZkIaskguIRgT8dvTJw_aaTAX5UYY_-irjDi1X6vOD1BgJ/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Penyimpanan perangkat penuh.'); } };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let tab = 'w', token = jget('x_token', ''), more = jget('x_more', null), queue = jget('x_queue', []);
let draft = jget('x_draft', null);            // latihan yang sedang dicatat
let lib = { ex: null, food: null };

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); }

// ── API ────────────────────────────────────────────────────────────────────
async function api(fn, ...args) {
  const r = await fetch(EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error); e.auth = !!j.auth; e.server = true; throw e; }
  return j.data;
}

// ── Antrian + sinkron ────────────────────────────────────────────────────────
const qSave = () => jset('x_queue', queue);
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
        if (e.auth) throw e;
        if (!e.server) throw e;                         // jaringan / balasan rusak: coba lagi nanti
        toast('Ditolak server: ' + e.message);          // validasi: buang, jangan macet
      }
      queue.shift(); qSave();
    }
    more = await api('getPortalMore', token); jset('x_more', more);
    $('#st').textContent = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    if (e.auth) { logout(); toast('Sesi berakhir. Masuk lagi.'); }
    else $('#st').textContent = 'Offline';
  } finally { syncing = false; render(); }
}
function logout() { token = ''; more = null; localStorage.removeItem('x_token'); localStorage.removeItem('x_more'); render(); }
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
  if (!ok) return loginView();
  if (!$('#st').textContent) $('#st').textContent = navigator.onLine ? '' : 'Offline';
  if (queue.length) $('#st').textContent = 'Antrian ' + queue.length;
  ({ w: workoutView, f: foodView, m: measureView })[tab]();
}

function loginView() {
  $('#main').innerHTML = `<div class="card"><h2>Masuk</h2><p class="mut">Pakai nomor WhatsApp yang terdaftar di XNK. Perlu sinyal sekali saja.</p>
  <input id="ph" type="tel" inputmode="numeric" placeholder="08xxxxxxxxxx"><div class="row" style="margin-top:10px"><button class="p" id="go" style="flex:1">Masuk</button></div></div>`;
  $('#go').onclick = async () => {
    $('#go').disabled = true;
    try { const r = await api('memberLoginByPhone', $('#ph').value); token = r.token; localStorage.setItem('x_token', JSON.stringify(token)); await sync(); }
    catch (e) { toast(e.message || 'Gagal masuk.'); }
    $('#go').disabled = false; render();
  };
}

// Latihan ---------------------------------------------------------------------
const lastSets = (key) => (more && more.workout && more.workout.last && more.workout.last[key]) || null;
function dSave() { jset('x_draft', draft); }
function workoutView() {
  if (!draft) {
    const ses = (more && more.workout && more.workout.sessions) || [];
    $('#main').innerHTML = `<button class="p" id="start" style="width:100%">Mulai latihan</button>
    <h2 style="margin-top:20px">Riwayat</h2>` + (ses.length ? ses.slice(0, 10).map(s => `<div class="card"><b>${esc(s.tanggal)}</b> ${esc(s.hari || '')}<div class="mut">${s.durasi ? Math.round(s.durasi / 60) + ' menit' : ''}</div></div>`).join('') : '<p class="mut">Belum ada. Setelah sinkron, riwayat muncul di sini.</p>');
    $('#start').onclick = () => { draft = { cid: uid(), mulai: new Date().toISOString(), items: [] }; dSave(); render(); };
    return;
  }
  $('#main').innerHTML = draft.items.map((it, i) => {
    const last = lastSets(it.exId ? 'ex:' + it.exId : 'nm:' + it.gerakan.trim().toLowerCase());
    return `<div class="card"><div class="row"><b style="flex:1">${esc(it.gerakan)}</b><button class="d" data-rm="${i}">Hapus</button></div>
    ${last ? `<div class="mut">Sebelumnya: ${esc((last.sets || []).map(s => (s.berat || 0) + '×' + (s.rep || 0)).join(', '))}</div>` : ''}
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
  $('#drop').onclick = () => { if (confirm('Buang latihan ini?')) { draft = null; localStorage.removeItem('x_draft'); render(); } };
  $('#fin').onclick = () => {
    const entries = draft.items.map((it, n) => ({ n: n + 1, exId: it.exId, gerakan: it.gerakan,
      sets: it.sets.filter(s => s.berat !== '' || s.rep !== '').map(s => ({ berat: String(s.berat).replace(',', '.'), rep: s.rep, jenis: '' })) })).filter(e => e.sets.length);
    if (!entries.length) return toast('Isi minimal satu set.');
    enqueue('logMyWorkout', [today(), entries, { cid: draft.cid, mulai: draft.mulai, selesai: new Date().toISOString() }]);
    draft = null; localStorage.removeItem('x_draft'); toast('Tersimpan. Dikirim saat ada sinyal.'); render();
  };
}

// Makan -----------------------------------------------------------------------
const MEALS = ['sarapan', 'siang', 'malam', 'camilan'];
function foodView() {
  const n = more && more.nutrition && more.nutrition.enabled ? more.nutrition : null;
  const sent = n && n.log && n.log.tanggal === today() ? n.log.items : [];
  const pend = queue.filter(q => q.fn === 'logMyFood' && q.args[0].tanggal === today()).map(q => q.args[0]);
  const kal = sent.reduce((a, x) => a + (x.kal || 0), 0) + pend.reduce((a, x) => a + (x._kal || 0), 0);
  $('#main').innerHTML = `<div class="card"><div class="mut">Hari ini</div><div class="big">${kal} <span class="mut">/ ${n && n.target && n.target.kal ? n.target.kal : '–'} kkal</span></div></div>
  <div class="card"><h2>Catat makanan</h2><input id="fq" placeholder="Cari (mis. nasi putih)"><div id="fr"></div></div>
  <h2>Hari ini</h2>` + (sent.length + pend.length ? sent.map(x => `<div class="hit">${esc(x.nama)} <span class="mut">${esc(x.porsi || '')} · ${x.kal} kkal</span></div>`).join('') +
    pend.map(x => `<div class="hit">${esc(x._nama)} <span class="mut">${x.gram} g · ${x._kal} kkal · menunggu sinyal</span></div>`).join('') : '<p class="mut">Belum ada catatan.</p>');
  $('#fq').oninput = async e => {
    const q = e.target.value.trim().toLowerCase(); if (q.length < 2) { $('#fr').innerHTML = ''; return; }
    const hits = (await loadLib('food')).filter(x => x.n.toLowerCase().includes(q)).slice(0, 8);
    $('#fr').innerHTML = hits.map(x => `<div class="hit" data-f="${esc(x.id)}">${esc(x.n)} <span class="mut">${x.kal} kkal/100 g</span></div>`).join('');
    $('#fr').querySelectorAll('[data-f]').forEach(h => h.onclick = () => foodAdd(lib.food.find(x => x.id === h.dataset.f)));
  };
}
function foodAdd(f) {
  const def = f.por[0][1];
  $('#fr').innerHTML = `<div class="hit"><b>${esc(f.n)}</b><div class="row" style="margin-top:8px"><input id="fg" type="text" inputmode="numeric" value="${def}" style="width:90px"><span class="mut">gram</span>
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
  const ms = (more && more.progress && more.progress.measures) || [{ key: 'berat', label: 'Berat', unit: 'kg' }, { key: 'pinggang', label: 'Lingkar pinggang', unit: 'cm' }];
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

// ── Mulai ──────────────────────────────────────────────────────────────────
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
$('#syncb').onclick = () => sync(true);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render(); sync();
