'use strict';
// Antrean simpan "buku catatan" (parts/app/01-awal.part, xnk_sync) dan penilai galat errKind.
// Kode diambil apa adanya dari part lalu dijalankan di vm dengan server palsu dan localStorage palsu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PART = fs.readFileSync(path.join(__dirname, '..', 'parts', 'app', '01-awal.part'), 'utf8');
const cut = (from, to) => { const a = PART.indexOf(from), b = PART.indexOf(to, a); assert.ok(a > 0 && b > a, 'block not found: ' + from); return PART.slice(a, b); };
const LANE = cut('  function rawCall(', '  const publicCall');
const QUEUE = cut('  // ── Antrean simpan "buku catatan"', '  // ── Simpan langsung berhasil');

// store = localStorage bersama (dua tab memakai store yang sama). handlers[fn](args, meta) → {ms, ok|err|errObj}
function makeTab(store, handlers, opts) {
  opts = opts || {};
  const log = [];
  const toasts = [];
  const timers = [];
  const window = { schedules: [], isAuthError: e => String((e && e.message) || e).indexOf('AUTH_REQUIRED') !== -1,
    authMessage: e => String((e && e.message) || e || '').replace(/^.*AUTH_REQUIRED:\s*/, ''),
    showToast: (m) => toasts.push(m), refreshAll: () => log.push('refreshAll'), closeModal() {} };
  function runner() {
    let ok, fail, meta = null;
    const p = new Proxy({}, { get: (_, prop) => {
      if (prop === 'withMeta') return m => { meta = m; return p; };
      if (prop === 'withSuccessHandler') return f => { ok = f; return p; };
      if (prop === 'withFailureHandler') return f => { fail = f; return p; };
      return function () {
        const args = Array.from(arguments), m = meta;
        const r = (handlers[prop] || (() => ({ ok: { status: 'success' } })))(args, m);
        log.push({ fn: prop, args, meta: m });
        setTimeout(() => { if (r.errObj) fail(r.errObj); else if (r.err) fail(new Error(r.err)); else ok(r.ok); }, r.ms || 2);
      };
    } });
    return p;
  }
  window.adminApi = runner; window.memberApi = runner;
  const ls = {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
  };
  const st = (f, ms) => { const t = setTimeout(f, ms); if (t.unref && ms >= 1000) t.unref(); timers.push(t); return t; };
  const ctx = {
    window, console, Promise, Object, Array, String, Error, JSON, Math, Date,
    setTimeout: st, clearTimeout, setInterval: (f, ms) => { const t = setInterval(f, ms); t.unref && t.unref(); return t; },
    hasServer: () => true,
    navigator: { onLine: opts.offline ? false : true },
    document: { hidden: false, addEventListener() {}, getElementById: () => null, querySelector: () => null },
    _lsGet: k => ls.getItem(k), _lsSet: (k, v) => { if (v) ls.setItem(k, v); else ls.removeItem(k); },
    tokenSig: t => 's' + t, ADMIN_TOKEN_KEY: 'xnk_admin_token', MEMBER_TOKEN_KEY: 'xnk_member_token',
    ui: {}, icon: () => '', h: s => String(s), setHTML() {}, paintIcons() {}, openSheet() {}, fmtTime: () => '10:00', fmtShort: () => 'x',
  };
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(LANE + QUEUE + '\nwindow.__t = { sqAdd, sqFlush, errKind, adminCall, sq, wlane };', ctx);
  return { window, t: window.__t, log, toasts, ctx, calls: fn => log.filter(x => x.fn === fn) };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const store0 = () => ({ xnk_admin_token: 'TOK' });

test('errKind: Google hiccups and lost answers are transient, server reasons are rejected', () => {
  const { t } = makeTab(store0(), {});
  const k = (m, flags, fn) => t.errKind(Object.assign(new Error(m), flags || {}), fn);
  for (const m of ['Service invoked too many times for one day: urlfetch.', "We're sorry, a server error occurred. Please wait a bit and try again.",
    'Exceeded maximum execution time', 'Server sedang sibuk. Coba lagi sebentar.', 'NetworkError: Connection failure due to HTTP 0',
    'Koneksi ke server terputus (HTTP 302).', 'Load failed', 'Tunggu sebentar lalu coba lagi.', 'Versi aplikasi belum cocok. Muat ulang halaman.']) {
    assert.strictEqual(k(m), 'transient', m);
  }
  assert.strictEqual(k('x', { net: true }), 'transient');
  assert.strictEqual(k('x', { nonJson: 0 }), 'transient');
  assert.strictEqual(k('Perubahan ini masih disimpan.', { code: 'inflight', server: true }), 'transient');
  assert.strictEqual(k('Akun dalam mode baca saja.', { code: 'readonly', server: true }), 'rejected');
  assert.strictEqual(k('Judul wajib diisi.'), 'rejected');
  assert.strictEqual(k('Jam itu sudah terisi.'), 'rejected');
  assert.strictEqual(k('AUTH_REQUIRED: Sesi habis.'), 'auth');
  assert.strictEqual(k('Jadwal tidak ditemukan', null, 'deleteSchedule'), 'done');
  assert.strictEqual(k('Jadwal tidak ditemukan', null, 'completeSession'), 'rejected');
});

test('pesanan ditulis ke perangkat SEBELUM dikirim, dan dihapus setelah berhasil', async () => {
  const store = store0();
  const tab = makeTab(store, { addTask: () => ({ ms: 20, ok: { id: 'T1' } }) });
  const p = tab.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{ title: 'x' }] }, { label: 'PR' });
  const saved = JSON.parse(store.xnk_sync);
  assert.strictEqual(saved.length, 1);
  assert.match(saved[0].id, /^c[a-z0-9]+-[a-z0-9]+$/);
  assert.deepStrictEqual(await p.then(r => r.id), 'T1');
  assert.ok(!store.xnk_sync, 'queue empty after success');
  const c = tab.calls('addTask')[0];
  assert.strictEqual(c.meta.cid, saved[0].id);
  assert.strictEqual(c.meta.re, false);
});

test('Google sedang ramai: layar tidak dibatalkan, dicoba lagi dengan cid yang sama (re)', async () => {
  let n = 0;
  const tab = makeTab(store0(), { addTask: () => (++n === 1 ? { err: "We're sorry, a server error occurred." } : { ok: { id: 'T2' } }) });
  let undone = false;
  const p = tab.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{}] }, { label: 'PR', undo: () => { undone = true; } });
  await wait(30);
  assert.strictEqual(undone, false);
  const it = JSON.parse(tab.ctx._lsGet('xnk_sync'))[0];
  assert.strictEqual(it.state, 'pending'); assert.strictEqual(it.tries, 1); assert.ok(it.nextAt > Date.now());
  it.nextAt = 0; tab.ctx._lsSet('xnk_sync', JSON.stringify([it]));   // lewati jeda
  tab.t.sqFlush();
  assert.strictEqual((await p).id, 'T2');
  const sends = tab.calls('addTask');
  assert.strictEqual(sends.length, 2);
  assert.strictEqual(sends[0].meta.cid, sends[1].meta.cid);
  assert.strictEqual(sends[1].meta.re, true);
  assert.strictEqual(tab.toasts.filter(x => /Belum tersimpan/.test(x)).length, 0);
});

test('ditolak server: undo, pesanan tetap tercatat "failed" (lencana), pesanan lain tetap jalan', async () => {
  const tab = makeTab(store0(), { updateTask: () => ({ err: 'Judul wajib diisi.' }), saveTaskTemplate: () => ({ ok: { ok: 1 } }) });
  let undone = false;
  const a = tab.t.sqAdd({ mode: 'admin', fn: 'updateTask', args: [{}] }, { label: 'PR', undo: () => { undone = true; } });
  const b = tab.t.sqAdd({ mode: 'admin', fn: 'saveTaskTemplate', args: [{}] }, { label: 'Template' });
  assert.strictEqual(await a, undefined);
  assert.deepStrictEqual(await b, { ok: 1 });
  assert.strictEqual(undone, true);
  const left = tab.window.sqItems();
  assert.strictEqual(left.length, 1); assert.strictEqual(left[0].state, 'failed'); assert.strictEqual(left[0].err, 'Judul wajib diisi.');
  assert.ok(tab.toasts.some(x => /Belum tersimpan/.test(x)));
});

test('Coba lagi mengirim ulang dengan cid yang sama; Buang menghapus', async () => {
  let n = 0;
  const tab = makeTab(store0(), { updateTask: () => (++n === 1 ? { err: 'Ditolak.' } : { ok: {} }) });
  await tab.t.sqAdd({ mode: 'admin', fn: 'updateTask', args: [{}] }, { label: 'PR' });
  const id = tab.window.sqItems()[0].id;
  tab.window.syncRetry(id);
  await wait(30);
  assert.strictEqual(tab.window.sqItems().length, 0);
  assert.strictEqual(tab.calls('updateTask')[1].meta.cid, id);
  const t2 = makeTab(store0(), { updateTask: () => ({ err: 'Ditolak.' }) });
  await t2.t.sqAdd({ mode: 'admin', fn: 'updateTask', args: [{}] }, { label: 'PR' });
  t2.window.syncDrop(t2.window.sqItems()[0].id);
  assert.strictEqual(t2.window.sqItems().length, 0);
});

test('sesi habis: pesanan tetap disimpan sampai akun yang sama masuk lagi', async () => {
  const store = store0();
  const tab = makeTab(store, { addTask: () => ({ err: 'AUTH_REQUIRED: Sesi habis.' }) });
  tab.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{}] }, { label: 'PR' });
  await wait(30);
  const it = JSON.parse(store.xnk_sync)[0];
  assert.strictEqual(it.state, 'pending');
  delete store.xnk_admin_token;                 // keluar
  assert.strictEqual(tab.window.sqItems().length, 0, 'other account sees nothing');
});

test('pembuat dengan id sementara: aksi berikutnya menunggu lalu memakai id asli; ditolak = ikut gagal', async () => {
  const tab = makeTab(store0(), { addSchedule: () => ({ ms: 20, ok: { id: 'SCH-7' } }), completeSession: () => ({ ok: { status: 'success' } }) });
  const tmp = tab.window.tmpId();
  tab.window.schedules.push({ id: tmp, pending: true });
  tab.t.sqAdd({ mode: 'admin', fn: 'addSchedule', args: [{}] }, { label: 'Booking', tmp });
  const done = tab.t.sqAdd({ mode: 'admin', fn: 'completeSession', args: [tmp, 'M'] }, { label: 'Selesai' });
  assert.strictEqual((await done).status, 'success');
  assert.strictEqual(tab.calls('completeSession')[0].args[0], 'SCH-7');
  assert.strictEqual(tab.window.schedules[0].id, 'SCH-7');

  const t2 = makeTab(store0(), { addSchedule: () => ({ err: 'Jam itu sudah terisi.' }) });
  const tmp2 = t2.window.tmpId();
  t2.t.sqAdd({ mode: 'admin', fn: 'addSchedule', args: [{}] }, { label: 'Booking', tmp: tmp2 });
  await t2.t.sqAdd({ mode: 'admin', fn: 'completeSession', args: [tmp2, 'M'] }, { label: 'Selesai' });
  const items = t2.window.sqItems();
  assert.strictEqual(items.length, 2);
  assert.ok(items.every(x => x.state === 'failed'));
  assert.match(items[1].err, /Menunggu: Booking/);
  assert.strictEqual(t2.calls('completeSession').length, 0);
});

test('pengiriman macet (tab tertutup saat mengirim): dikirim ulang dengan re setelah 75 dtk', async () => {
  const store = store0();
  store.xnk_sync = JSON.stringify([{ id: 'cold-0001', mode: 'admin', fn: 'addTask', args: [{}], sig: 'sTOK', label: 'PR', at: Date.now() - 100000, tries: 0, nextAt: 0, state: 'sending', sentAt: Date.now() - 80000, err: '' }]);
  const tab = makeTab(store, { addTask: () => ({ ok: { id: 'T9', dup: true } }) });
  await tab.t.sqFlush();
  await wait(20);
  const c = tab.calls('addTask');
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].meta.cid, 'cold-0001'); assert.strictEqual(c[0].meta.re, true);
  assert.ok(!store.xnk_sync);
  assert.ok(tab.log.includes('refreshAll'), 'item from an earlier page → data reloaded when the queue is empty');
});

test('dua tab satu perangkat: hanya pemegang sewa yang mengirim', async () => {
  const store = store0();
  const h = { addTask: () => ({ ms: 30, ok: { id: 'T' } }) };
  const a = makeTab(store, h), b = makeTab(store, h);
  a.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{}] }, { label: 'PR' });
  await wait(5);
  b.t.sqFlush();
  await wait(60);
  assert.strictEqual(a.calls('addTask').length + b.calls('addTask').length, 1);
});

test('tanpa sinyal: tidak dikirim, tetap menunggu', async () => {
  const store = store0();
  const tab = makeTab(store, {}, { offline: true });
  tab.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{}] }, { label: 'PR' });
  await wait(20);
  assert.strictEqual(tab.calls('addTask').length, 0);
  assert.strictEqual(JSON.parse(store.xnk_sync)[0].state, 'pending');
});

test('pesanan lebih dari 7 hari: gagal "Sudah lama tidak terkirim" (keputusan pengguna)', async () => {
  const store = store0();
  store.xnk_sync = JSON.stringify([{ id: 'cold-0002', mode: 'admin', fn: 'addTask', args: [{}], sig: 'sTOK', label: 'PR', at: Date.now() - 8 * 86400000, tries: 3, nextAt: 0, state: 'pending', err: '' }]);
  const tab = makeTab(store, {});
  await tab.t.sqFlush();
  assert.strictEqual(tab.calls('addTask').length, 0);
  assert.match(tab.window.sqItems()[0].err, /Sudah lama/);
});

test('antrean lama xnk_outbox dipindah sekali sebagai kiriman ulang', async () => {
  const store = store0();
  store.xnk_outbox = JSON.stringify([{ mode: 'admin', fn: 'saveSessionNote', args: ['S1', {}], sig: 'sTOK', label: 'Catatan', at: Date.now() }]);
  const tab = makeTab(store, {}, { offline: true });
  await wait(10);   // dipindah setelah semua bagian app dimuat
  const items = tab.window.sqItems();
  assert.strictEqual(items.length, 1); assert.strictEqual(items[0].tries, 1);
  assert.ok(!store.xnk_outbox);
});

test('data dari server yang tiba selama ada pesanan baru dianggap basi', async () => {
  const tab = makeTab(store0(), {}, { offline: true });
  const snap = tab.window.wqSnap();
  assert.strictEqual(tab.window.wqStale(snap), false);
  tab.t.sqAdd({ mode: 'admin', fn: 'addTask', args: [{}] }, { label: 'PR' });
  assert.strictEqual(tab.window.wqStale(snap), true);
});

test('gelombang 3: "Terlalu cepat" (jeda server) = sementara; tukar menu tidak menunggu di belakang simpanan', async () => {
  const { t } = makeTab(store0(), {});
  assert.strictEqual(t.errKind(new Error('Terlalu cepat. Coba lagi sebentar.')), 'transient');
  const tab = makeTab(store0(), { saveMyRoutine: () => ({ ms: 80, ok: {} }), swapMyMenuMeal: () => ({ ms: 1, ok: { opts: [] } }) });
  tab.t.adminCall('saveMyRoutine', 'x', {});   // simpanan lambat (80 ms) di jalur tulis
  const t0 = Date.now();
  await tab.t.adminCall('swapMyMenuMeal', 'pagi');
  assert.ok(Date.now() - t0 < 60, 'swap answered while the save was still running (took ' + (Date.now() - t0) + ' ms)');
});
