'use strict';
// Jalur tulis (parts/app/01-awal.part): aksi cepat beruntun tidak boleh gagal karena simpanan sebelumnya
// belum selesai. Contoh keluhan coach: booking lalu langsung "Selesai" → "Jadwal tidak ditemukan".
// Kode jalur diambil apa adanya dari part dan dijalankan dengan server palsu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('./api-lists.js');

const PART = fs.readFileSync(path.join(__dirname, '..', 'parts', 'app', '01-awal.part'), 'utf8');

function readRe() {
  const m = /const READ_FN_RE = (\/.+\/);/.exec(PART);
  assert.ok(m, 'READ_FN_RE tidak ditemukan di 01-awal.part');
  return vm.runInNewContext(m[1]);
}

test('tidak ada fungsi tulis yang dianggap baca (semua tulisan lewat jalur)', () => {
  const re = readRe();
  const bad = [...L.WRITE].filter(n => re.test(n));
  assert.deepStrictEqual(bad, [], 'Fungsi WRITE cocok dengan READ_FN_RE: ' + bad.join(', '));
});

// Server palsu: tiap fungsi = (args) => {ms, ok|err}. Mencatat urutan mulai/selesai.
function makeEnv(handlers) {
  const a = PART.indexOf('  function rawCall(');
  const b = PART.indexOf('  const publicCall');
  assert.ok(a > 0 && b > a, 'blok jalur tulis tidak ditemukan');
  const log = [];
  let active = 0, maxActive = 0;
  const window = { schedules: [], selectedScheduleDetailId: null, rescheduleScheduleId: null,
    isAuthError: e => String((e && e.message) || e).indexOf('AUTH_REQUIRED') !== -1 };
  function runner() {
    let ok, fail;
    const p = new Proxy({}, { get: (_, prop) => {
      if (prop === 'withSuccessHandler') return f => { ok = f; return p; };
      if (prop === 'withFailureHandler') return f => { fail = f; return p; };
      return function () {
        const args = Array.from(arguments);
        const hnd = handlers[prop] || (() => ({ ok: { status: 'success' } }));
        const r = hnd(args);
        active++; maxActive = Math.max(maxActive, active);
        log.push('start ' + prop + ' ' + JSON.stringify(args));
        setTimeout(() => { active--; log.push('end ' + prop); if (r.err) fail(new Error(r.err)); else ok(r.ok); }, r.ms || 5);
      };
    } });
    return p;
  }
  window.adminApi = runner; window.memberApi = runner;
  // Timer jalur (45 s) tidak boleh menahan proses test.
  const st = (f, ms) => { const t = setTimeout(f, ms); if (t.unref && ms >= 45000) t.unref(); return t; };
  const ctx = { window, console, setTimeout: st, Promise, Object, Array, String, Error, JSON, hasServer: () => true };
  vm.createContext(ctx);
  vm.runInContext(PART.slice(a, b) + '\nwindow.__t = { adminCall, adminCreate, memberCall, memberCreate };', ctx);
  return { window, t: window.__t, log, maxActive: () => maxActive };
}

test('booking lalu langsung Selesai: Selesai menunggu booking dan memakai id asli', async () => {
  const env = makeEnv({
    addSchedule: () => ({ ms: 40, ok: { status: 'success', id: 'SCH-1' } }),
    completeSession: args => args[0] === 'SCH-1' ? { ok: { status: 'success' } } : { err: 'Jadwal tidak ditemukan' },
  });
  const w = env.window;
  const tmp = w.tmpId();
  w.schedules.push({ id: tmp, pending: true });
  w.selectedScheduleDetailId = tmp;
  const create = env.t.adminCreate(tmp, 'addSchedule', { start: 'x' });
  const done = env.t.adminCall('completeSession', tmp, 'M1');   // diketuk sebelum booking selesai
  await create;
  assert.strictEqual(await done.then(r => r.status), 'success');
  assert.strictEqual(w.schedules[0].id, 'SCH-1', 'baris sementara diganti id asli');
  assert.ok(!w.schedules[0].pending);
  assert.strictEqual(w.selectedScheduleDetailId, 'SCH-1', 'detail yang terbuka ikut id asli');
  assert.strictEqual(w.schedById(tmp), w.schedules[0], 'id sementara lama masih menemukan barisnya');
  assert.ok(env.log.indexOf('end addSchedule') < env.log.findIndex(l => l.startsWith('start completeSession')), 'urutan: booking selesai dulu');
  assert.strictEqual(env.maxActive(), 1, 'tulisan tidak pernah bersamaan');
});

test('id sementara di dalam objek dan larik juga diganti (geser jadwal, tandai dibaca)', async () => {
  const seen = {};
  const env = makeEnv({
    addSchedule: () => ({ ms: 20, ok: { id: 'SCH-9' } }),
    updateScheduleData: args => { seen.upd = args[0]; return { ok: { status: 'success' } }; },
    markSchedulesAsRead: args => { seen.read = args[0]; return { ok: true }; },
  });
  const tmp = env.window.tmpId();
  env.t.adminCreate(tmp, 'addSchedule', {});
  await Promise.all([env.t.adminCall('updateScheduleData', { id: tmp, start: 's' }), env.t.adminCall('markSchedulesAsRead', [tmp, 'SCH-2'])]);
  // JSON: objek hasil penggantian dibuat di realm vm (prototipe lain).
  assert.strictEqual(JSON.stringify(seen.upd), JSON.stringify({ id: 'SCH-9', start: 's' }));
  assert.strictEqual(JSON.stringify(seen.read), JSON.stringify(['SCH-9', 'SCH-2']));
});

test('booking ditolak: aksi berikutnya pada sesi itu ditolak dengan pesan jelas, server tidak dipanggil', async () => {
  const env = makeEnv({ addSchedule: () => ({ err: 'Jam itu sudah terisi.' }) });
  const tmp = env.window.tmpId();
  const c = env.t.adminCreate(tmp, 'addSchedule', {});
  const d = env.t.adminCall('completeSession', tmp, 'M1');
  await assert.rejects(c, /sudah terisi/);
  await assert.rejects(d, /tidak jadi tersimpan/);
  assert.ok(!env.log.some(l => l.startsWith('start completeSession')));
});

test('konflik booking klien (soft) juga dianggap tidak jadi', async () => {
  const env = makeEnv({ clientBookSchedule: () => ({ ok: { status: 'conflict', alternatives: [] } }) });
  const tmp = env.window.tmpId();
  await env.t.memberCreate(tmp, 'clientBookSchedule', {}, { soft: true });
  await assert.rejects(env.t.memberCall('clientRescheduleSchedule', tmp, 'a', 'b', {}), /tidak jadi tersimpan/);
});

test('kunci skrip sibuk dicoba lagi sendiri', async () => {
  let n = 0;
  const env = makeEnv({ saveTask: () => (++n < 2 ? { err: 'Server sedang sibuk. Coba lagi sebentar.' } : { ok: { status: 'success' } }) });
  const res = await env.t.adminCall('saveTask', {});
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(n, 2);
});

test('galat biasa tidak dicoba lagi', async () => {
  let n = 0;
  const env = makeEnv({ saveTask: () => { n++; return { err: 'Judul wajib diisi.' }; } });
  await assert.rejects(env.t.adminCall('saveTask', {}), /Judul/);
  assert.strictEqual(n, 1);
});

test('tulisan beruntun tiba di server sesuai urutan ketukan', async () => {
  const order = [];
  const env = makeEnv({ updateMemberProfile: args => { order.push(args[0].v); return { ms: args[0].v === 1 ? 30 : 1, ok: {} }; } });
  await Promise.all([1, 2, 3].map(v => env.t.adminCall('updateMemberProfile', { v })));
  assert.deepStrictEqual(order, [1, 2, 3]);
  assert.strictEqual(env.maxActive(), 1);
});

test('bacaan biasa tidak menunggu jalur tulis', async () => {
  const env = makeEnv({ addSchedule: () => ({ ms: 50, ok: { id: 'S' } }), getSchedules: () => ({ ms: 1, ok: [] }) });
  env.t.adminCreate(env.window.tmpId(), 'addSchedule', {});
  await env.t.adminCall('getSchedules');
  assert.ok(env.log.includes('end getSchedules'));
  assert.ok(!env.log.includes('end addSchedule'), 'bacaan selesai selagi booking masih berjalan');
});

test('jawaban data yang diminta selama simpanan berjalan dianggap basi; dimuat ulang setelah selesai', async () => {
  const env = makeEnv({ addSchedule: () => ({ ms: 30, ok: { id: 'S' } }) });
  const w = env.window;
  const snap = w.wqSnap();
  assert.strictEqual(w.wqStale(snap), false);
  const c = env.t.adminCreate(w.tmpId(), 'addSchedule', {});
  assert.strictEqual(w.wqStale(snap), true);
  let reloaded = 0;
  w.wqOnIdle('boot', () => reloaded++);
  w.wqOnIdle('boot', () => reloaded++);   // dua kali didaftar = sekali jalan
  await c;
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(reloaded, 1);
  assert.strictEqual(w.wqStale(snap), true, 'snap lama tetap basi');
  assert.strictEqual(w.wqStale(w.wqSnap()), false);
});
