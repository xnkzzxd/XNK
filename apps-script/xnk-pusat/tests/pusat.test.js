'use strict';
// XNK Pusat (T-2233): login PIN, pendaftaran coach, pemeriksaan harian + email, aksi ke GitHub. Layanan Google palsu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'Pusat.gs'), 'utf8');
const EXEC = n => `https://script.google.com/macros/s/AKfycb${String(n).repeat(30)}/exec`;
const SECRET = n => String(n).repeat(40);
const SHA_NEW = 'c'.repeat(40), SHA_OLD = 'd'.repeat(40);

function env(opts) {
  opts = opts || {};
  const props = Object.assign({ PUSAT_PIN: 'pin-rahasia-1', PUSAT_ENROLL_CODE: 'kode-daftar-9' }, opts.props || {});
  const cache = {}, mails = [], fetches = [], triggers = [], echoes = {};
  const drive = { files: {}, books: {}, n: 0 };
  const servers = opts.servers || {};
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID(),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ content: t, setMimeType() { return this; } }) },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'pemilik@contoh.id' }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })), deleteTrigger: t => triggers.splice(triggers.indexOf(t.getHandlerFunction()), 1),
      newTrigger: h => { const b = { timeBased: () => b, atHour: () => b, everyDays: () => b, everyHours: () => b, after: () => b, inTimezone: () => b, create: () => triggers.push(h) }; return b; },
      getOAuthToken: () => 'tok-pusat', getScriptId: () => 'SCRIPTPUSAT',
      // Seperti web app "Siapa saja": getAuthorizationInfo memeriksa pengunjung anonim, jadi selalu REQUIRED.
      AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
      getAuthorizationInfo: () => ({ getAuthorizationStatus: () => 'REQUIRED' }),
    },
    SpreadsheetApp: { openById: id => { if (!drive.books[id]) throw new Error('Spreadsheet tidak ada'); return drive.books[id]; } },
    UrlFetchApp: {
      fetch: (url, o) => {
        o = o || {};
        fetches.push({ url, o });
        if (url.includes('/matching-refs/tags/lib-v')) return reply(200, [{ ref: 'refs/tags/lib-v3', object: { type: 'tag', sha: 't3' } }, { ref: 'refs/tags/lib-v11', object: { type: 'tag', sha: 't11' } }]);
        if (url.endsWith('/git/tags/t11')) return reply(200, { object: { sha: SHA_NEW } });
        if (url.includes('/dispatches')) return reply(opts.dispatch || 204, '');
        if (url.startsWith(DRIVE)) return driveFetch(drive, url, o, reply, opts);
        if (url.startsWith('https://raw.githubusercontent.com/')) return opts.hub ? reply(200, opts.hub) : reply(404, 'Not Found');
        if (opts.login && opts.login.includes(url)) return Object.assign(reply(302, ''), { getHeaders: () => ({ Location: 'https://accounts.google.com/ServiceLogin?x=' + fetches.length }) });
        if (url.startsWith('https://accounts.google.com/')) return reply(200, '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head></html>');
        // Seperti Apps Script sungguhan: POST /exec → 302 ke echo; mengikuti 302 sebagai POST → halaman HTML Google.
        if (servers[url]) {
          if (o.followRedirects !== false) return reply(200, '<!DOCTYPE html><html>Google</html>');
          const out = servers[url](JSON.parse(o.payload)), key = 'https://script.googleusercontent.com/macros/echo?k=' + fetches.length;
          echoes[key] = out;
          return Object.assign(reply(302, ''), { getHeaders: () => ({ Location: key }) });
        }
        if (echoes[url] && !o.method) return reply(200, echoes[url]);
        throw new Error('Address unavailable');
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const call = (fn, ...args) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).content);
  ctx.setupPusat();
  return { ctx, props, mails, fetches, triggers, call, drive };
}

// ── Drive REST v3 dan Sheets palsu (backup, T-2250) ──────────────────────────────────────────────────────────
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
class FakeSheet {
  constructor(name) { this.name = name; this.cells = []; this.maxR = 1000; this.maxC = 26; this.formats = []; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getMaxRows() { return this.maxR; }
  getMaxColumns() { return this.maxC; }
  insertRowsAfter(after, n) { assert.equal(after, this.maxR); this.maxR += n; }
  insertColumnsAfter(after, n) { assert.equal(after, this.maxC); this.maxC += n; }
  getRange(r, c, n, m) {
    if (r + n - 1 > this.maxR || c + m - 1 > this.maxC) throw new Error('Rentang di luar batas sheet');
    const sh = this, rg = {
      setNumberFormat(f) { sh.formats.push([r, n, f]); return rg; },
      setValues(v) {
        assert.equal(v.length, n); v.forEach(line => assert.equal(line.length, m));
        v.forEach((line, i) => { sh.cells[r - 1 + i] = JSON.parse(JSON.stringify(line)); });
        return rg;
      },
    };
    return rg;
  }
}
class FakeBook {
  constructor() { this.sheets = [new FakeSheet('Sheet1')]; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { assert.ok(!this.getSheetByName(n), 'nama sheet dobel'); const s = new FakeSheet(n); this.sheets.push(s); return s; }
}
function driveFetch(drive, url, o, reply, opts) {
  assert.equal(o.headers.Authorization, 'Bearer tok-pusat');
  if (opts.driveDown) return reply(403, '{}');
  const [p, qs] = url.slice(DRIVE.length).split('?');
  const q = new URLSearchParams(qs || '');
  const method = String(o.method || 'get').toLowerCase();
  if (method === 'post') {
    const b = JSON.parse(o.payload), id = 'f' + (++drive.n);
    drive.files[id] = { id, name: b.name, mimeType: b.mimeType, parents: b.parents || [], trashed: false, createdTime: new Date(Date.UTC(2026, 0, 1) + drive.n * 1000).toISOString() };
    if (b.mimeType === 'application/vnd.google-apps.spreadsheet') drive.books[id] = new FakeBook();
    return reply(200, { id, webViewLink: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' });
  }
  const id = decodeURIComponent(p.slice(1));
  if (id) {
    const f = drive.files[id];
    if (!f) return reply(404, '{}');
    if (method === 'patch') Object.assign(f, JSON.parse(o.payload));
    return reply(200, { id: f.id, trashed: f.trashed });
  }
  if (!q.get('q')) return reply(200, { files: [] });   // cek izin (setupState_)
  const parent = (q.get('q').match(/'([^']+)' in parents/) || [])[1];
  return reply(200, { files: Object.values(drive.files).filter(f => f.parents.includes(parent) && !f.trashed && f.mimeType === 'application/vnd.google-apps.spreadsheet').map(f => ({ id: f.id, name: f.name, createdTime: f.createdTime })) });
}

/** Coach palsu dengan hubStatus + hubExport; `chunk` baris per potong. */
function coach(secret, sheets, chunk) {
  const calls = [];
  const fn = req => {
    calls.push(req);
    if (req.args[0] !== secret) return { ok: false, error: 'Permintaan tidak valid.' };
    if (req.fn === 'hubStatus') return { ok: true, data: status(SHA_NEW) };
    if (req.fn !== 'hubExport') return { ok: false, error: 'Permintaan tidak valid.', code: 'unknown_fn' };
    const r = req.args[1];
    if (!r) return { ok: true, data: { at: 'x', sheets: Object.keys(sheets).map(name => ({ name, rows: sheets[name].length, cols: (sheets[name][0] || []).length })) } };
    const all = sheets[r.sheet];
    if (!all) return { ok: false, error: 'Sheet tidak ditemukan.' };
    const rows = all.slice(r.from - 1, r.from - 1 + chunk), next = r.from + rows.length;
    return { ok: true, data: { rows, cols: (all[0] || []).length, next: next > all.length ? 0 : next } };
  };
  fn.calls = calls;
  return fn;
}

const status = (commit, extra) => Object.assign({ at: 'x', lib: { hash: 'h', commit }, api: 1, triggers: { runReminderTick: 1 }, reminders: { enabled: false, lastTickAt: '' }, clients: { total: 12, active30d: 7 }, sessions: { done7d: 9, next7d: 5 } }, extra || {});
const server = (secret, data) => req => (req.fn === 'hubStatus' && req.args[0] === secret ? { ok: true, data } : { ok: false, error: 'Permintaan tidak valid.' });

test('setupPusat: kunci sesi, satu trigger harian dan satu trigger backup tiap jam; diulang tetap satu', () => {
  const e = env();
  e.ctx.setupPusat();
  assert.ok(e.props.SESSION_SECRET.length >= 32);
  assert.deepEqual(e.triggers, ['runPusatDaily', 'runPusatBackup']);
});

test('siapkan dari /adminxnk: tanda siap 10 menit membuka setupPusat lewat doGet; tanda palsu/kedaluwarsa tidak; overview melapor', () => {
  const e = env({ driveDown: true });
  e.triggers.length = 0;
  const tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  const ov = e.call('pusatOverview', tok).data.setup;
  assert.deepEqual([ov.ok, ov.auth, ov.daily, ov.backup], [false, false, false, false]);
  assert.equal(e.call('pusatAction', 'palsu', 'setup').auth, true, 'butuh login PIN');
  const t = e.call('pusatAction', tok, 'setup').data.ticket;
  assert.match(t, /^setup\.\d+\.[\w-]+$/);
  assert.ok(!t.includes(tok.split('.')[1]), 'bukan token sesi');
  assert.equal(e.ctx.doGet({ parameter: {} }).content, 'XNK Pusat');
  assert.match(e.ctx.doGet({ parameter: { setup: t.replace(/.$/, 'x') } }).content, /tidak berlaku/);
  assert.match(e.ctx.doGet({ parameter: { setup: tok } }).content, /tidak berlaku/, 'token sesi bukan tanda siap');
  assert.deepEqual(e.triggers, []);
  const msg = e.ctx.doGet({ parameter: { setup: t } }).content;
  assert.match(msg, /izin Google baru .* belum diberikan/, 'jujur: izin baru tidak bisa lewat link web');
  assert.match(msg, /https:\/\/script\.google\.com\/d\/SCRIPTPUSAT\/edit/);
  assert.equal(e.call('pusatOverview', tok).data.setup.editor, 'https://script.google.com/d/SCRIPTPUSAT/edit');
  const g = env(), gt = g.call('pusatAction', g.call('pusatLogin', 'pin-rahasia-1').data.token, 'setup').data.ticket;
  assert.match(g.ctx.doGet({ parameter: { setup: gt } }).content, /XNK Pusat siap: izin Google lengkap/);
  e.ctx.doGet({ parameter: { setup: t } });
  assert.deepEqual(e.triggers, ['runPusatDaily', 'runPusatBackup'], 'diulang tetap satu');
  const D = vm.runInContext('Date', e.ctx), real = D.now;
  D.now = () => real.call(D) + 11 * 60 * 1000;
  try { assert.match(e.ctx.doGet({ parameter: { setup: t } }).content, /tidak berlaku/, 'lewat 10 menit'); } finally { D.now = real; }
  const ok = env().call('pusatOverview', env().call('pusatLogin', 'pin-rahasia-1').data.token);
  assert.equal(typeof ok.ok, 'boolean');
});

test('login: PIN benar = token 12 jam; salah = ditolak, dibatasi 5 kali; token palsu ditolak', () => {
  const e = env();
  assert.equal(e.call('pusatLogin', 'salah').error, 'PIN salah.');
  const ok = e.call('pusatLogin', 'pin-rahasia-1');
  assert.equal(ok.ok, true);
  assert.ok(ok.data.exp - Date.now() > 11 * 3600e3);
  assert.equal(e.call('pusatOverview', ok.data.token).ok, true);
  const bad = e.call('pusatOverview', ok.data.token.replace(/.$/, 'x'));
  assert.deepEqual([bad.ok, bad.auth], [false, true]);
  assert.equal(e.call('pusatOverview', '1.abc').auth, true, 'kedaluwarsa');
  for (let i = 0; i < 4; i++) e.call('pusatLogin', 'salah');
  assert.match(e.call('pusatLogin', 'pin-rahasia-1').error, /Terlalu banyak/, 'dikunci walau PIN benar');
  assert.match(env({ props: { PUSAT_PIN: 'pendek' } }).call('pusatLogin', 'pendek').error, /minimal 8/);
  assert.equal(e.call('fungsiLain').error, 'Permintaan tidak valid.');
});

test('daftar: kode benar; isian diperiksa; link /exec tidak boleh dobel; rahasia tidak pernah keluar lagi', () => {
  const e = env({ servers: { [EXEC(1)]: server('x', {}) } });
  assert.match(e.call('pusatRegister', 'salah', 'claudia', EXEC(1), SECRET(1)).error, /Kode daftar/);
  assert.match(e.call('pusatRegister', 'kode-daftar-9', 'Claudia', EXEC(1), SECRET(1)).error, /Nama di alamat/);
  assert.match(e.call('pusatRegister', 'kode-daftar-9', 'claudia', 'https://x.id/exec', SECRET(1)).error, /exec/);
  assert.match(e.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(1), 'pendek').error, /Rahasia/);
  assert.equal(e.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(1), SECRET(1)).ok, true);
  assert.match(e.call('pusatRegister', 'kode-daftar-9', 'dina', EXEC(1), SECRET(2)).error, /sudah terdaftar/);
  assert.equal(e.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(1), SECRET(3)).ok, true, 'daftar ulang = rahasia baru');
  const tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  const ov = e.call('pusatOverview', tok).data;
  assert.equal(ov.coaches.length, 1);
  assert.equal(ov.coaches[0].panel, 'https://xnk.web.id/claudia/');
  assert.ok(!JSON.stringify(ov).includes(SECRET(3)), 'rahasia tidak dikirim ke browser');
});

test('pemeriksaan harian: Library tertinggal, trigger hilang, pengingat macet, server diam = satu email; semua beres = tanpa email', () => {
  const servers = {
    [EXEC(1)]: server(SECRET(1), status(SHA_NEW)),
    [EXEC(2)]: server(SECRET(2), status(SHA_OLD, { triggers: { runReminderTick: 0 } })),
    [EXEC(3)]: server(SECRET(3), status(SHA_NEW, { reminders: { enabled: true, lastTickAt: new Date(Date.now() - 6 * 3600e3).toISOString() } })),
  };
  servers[EXEC(4)] = server(SECRET(4), status(SHA_NEW));
  const e = env({ servers });
  [['claudia', 1], ['dina', 2], ['eko', 3], ['fani', 4]].forEach(([s, n]) => assert.equal(e.call('pusatRegister', 'kode-daftar-9', s, EXEC(n), SECRET(n)).ok, true));
  delete servers[EXEC(4)];   // fani diam setelah terdaftar
  const r = e.ctx.runPusatDaily();
  assert.equal(r.problems, 3);
  assert.equal(e.mails.length, 1);
  assert.equal(e.mails[0].to, 'pemilik@contoh.id');
  assert.match(e.mails[0].body, /dina: Library tertinggal \(terbaru v11\)\. Trigger pengingat tidak terpasang\./);
  assert.match(e.mails[0].body, /eko: Pengingat menyala tetapi tidak berjalan/);
  assert.match(e.mails[0].body, /fani: Server tidak menjawab/);
  assert.ok(!/claudia/.test(e.mails[0].body));
  const st = JSON.parse(e.props.ST_claudia);
  assert.equal(st.ok, true);
  assert.equal(st.data.clients.active30d, 7);
  assert.ok(e.fetches.filter(f => f.url === EXEC(1) && JSON.parse(f.o.payload).fn === 'hubStatus').every(f => JSON.parse(f.o.payload).args[0] === SECRET(1)), 'rahasia dikirim hanya ke /exec coach itu');
  const e2 = env({ servers: { [EXEC(1)]: server(SECRET(1), status(SHA_NEW)) }, props: { PUSAT_EMAIL: 'saya@contoh.id' } });
  e2.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(1), SECRET(1));
  assert.equal(e2.ctx.runPusatDaily().problems, 0);
  assert.equal(e2.mails.length, 0);
});

test('daftar: link yang minta login Google (link uji/HEAD) ditolak dengan pesan jelas; link hub.json menang', () => {
  const e = env({ login: [EXEC(7)] });
  const r = e.call('pusatRegister', 'kode-daftar-9', 'vinna', EXEC(7), SECRET(7));
  assert.equal(r.ok, false);
  assert.match(r.error, /tidak bisa dibuka tanpa login \(HTTP 200 dari accounts\.google\.com, halaman "Sign in - Google Accounts"\)/);
  assert.match(r.error, /Kelola deployment/);
  assert.equal(e.props.COACHES, undefined, 'tidak disimpan');
  // claudia mengirim link uji, tetapi hub.json punya link deployment yang benar: itu yang disimpan dan diperiksa.
  const hub = JSON.stringify({ coaches: [{ slug: 'claudia', exec: EXEC(1) }] });
  const h = env({ login: [EXEC(7)], hub, servers: { [EXEC(1)]: server(SECRET(1), status(SHA_NEW)) } });
  assert.equal(h.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(7), SECRET(1)).ok, true);
  assert.equal(JSON.parse(h.props.COACHES).claudia.exec, EXEC(1));
  assert.equal(h.ctx.runPusatDaily().problems, 0);
});

test('pemeriksaan: coach yang sudah tersimpan dengan link uji tetap terbaca lewat hub.json; tanpa hub.json pesannya menyebut halaman', () => {
  const hub = JSON.stringify({ coaches: [{ slug: 'claudia', exec: EXEC(1) }] });
  const old = JSON.stringify({ claudia: { exec: EXEC(7), secret: SECRET(1), at: 'x' } });
  const a = env({ login: [EXEC(7)], hub, props: { COACHES: old }, servers: { [EXEC(1)]: server(SECRET(1), status(SHA_NEW)) } });
  assert.equal(a.ctx.runPusatDaily().problems, 0);
  const b = env({ login: [EXEC(7)], props: { COACHES: old } });
  b.ctx.runPusatDaily();
  assert.match(b.mails[0].body, /claudia: Server tidak menjawab \(HTTP 200 dari accounts\.google\.com, halaman "Sign in - Google Accounts"\)/);
});

test('aksi: perbarui/hubungkan/bangun menjalankan workflow repo hub; tanpa token GitHub = pesan jelas', () => {
  const e = env({ props: { GITHUB_TOKEN: 'github_pat_x' } });
  const tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  assert.equal(e.call('pusatAction', tok, 'perbarui', 'claudia').ok, true);
  const d = e.fetches.filter(f => f.url.includes('/dispatches'));
  assert.equal(d[0].url, 'https://api.github.com/repos/xnkzzxd/xnk-template-site/actions/workflows/coach.yml/dispatches');
  assert.deepEqual(JSON.parse(d[0].o.payload), { ref: 'main', inputs: { aksi: 'perbarui', slug: 'claudia' } });
  assert.equal(d[0].o.headers.Authorization, 'Bearer github_pat_x');
  e.call('pusatAction', tok, 'bangun');
  assert.match(e.fetches.filter(f => f.url.includes('/dispatches'))[1].url, /hub\.yml/);
  assert.match(e.call('pusatAction', tok, 'hubungkan', '').error, /Pilih coach/);
  assert.match(e.call('pusatAction', tok, 'hapus', 'claudia').error, /tidak dikenal/);
  assert.equal(e.call('pusatAction', 'palsu', 'bangun').auth, true);
  const n = env();
  assert.match(n.call('pusatAction', n.call('pusatLogin', 'pin-rahasia-1').data.token, 'bangun').error, /Token GitHub belum diatur/);
  const f = env({ props: { GITHUB_TOKEN: 'x' }, dispatch: 403 });
  assert.match(f.call('pusatAction', f.call('pusatLogin', 'pin-rahasia-1').data.token, 'bangun').error, /GitHub menolak \(403\)/);
});

test('kuota: angka ≥ 70 % dari batas (bawaan 100 / 20.000 / 90, bisa ditimpa) = masalah; tanpa kuota = tidak dicek', () => {
  const q = (mail, fetch, triggerMin) => ({ quota: { date: '2026-11-18', mail, fetch, triggerMin, mailRemaining: 100 - mail } });
  const servers = {
    [EXEC(1)]: server(SECRET(1), status(SHA_NEW, q(69, 13999, 62.9))),
    [EXEC(2)]: server(SECRET(2), status(SHA_NEW, q(70, 14000, 63))),
    [EXEC(3)]: server(SECRET(3), status(SHA_NEW)),
  };
  const e = env({ servers });
  [['claudia', 1], ['dina', 2], ['eko', 3]].forEach(([s, n]) => assert.equal(e.call('pusatRegister', 'kode-daftar-9', s, EXEC(n), SECRET(n)).ok, true));
  e.ctx.runPusatDaily();
  assert.equal(e.mails.length, 1);
  assert.match(e.mails[0].body, /dina: Kuota email hari ini 70 dari 100 \(≥ 70 %\)\. Kuota UrlFetch hari ini 14000 dari 20000 \(≥ 70 %\)\. Menit trigger hari ini 63 dari 90 \(≥ 70 %\)\./);
  assert.ok(!/claudia|eko/.test(e.mails[0].body));
  const tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  assert.deepEqual(e.call('pusatOverview', tok).data.quotaLimits, { mail: 100, fetch: 20000, triggerMin: 90 });
  e.props.QUOTA_MAIL = '1000';
  e.ctx.runPusatDaily();
  assert.ok(!/Kuota email/.test(e.mails[1].body), 'batas ditimpa: 70 dari 1000 aman');
});

// ── Backup mingguan (T-2250) ────────────────────────────────────────────────────────────────────────────────
const plain = x => JSON.parse(JSON.stringify(x));
const DATA = {
  MemberData: [['ID', 'Nama', 'No WA'], ['M1', 'Ani', '08123'], ['M2', 'Budi', '08124'], ['M3', '=HACK()', '08125'], ['M4', 'Dewi', '08126']],
  Kosong: [],
  Schedules: [['ID', 'Mulai'], ['S1', '2026-11-03 09:00:00']],
};
const bkEnv = (sheetsBy, opts) => {
  const servers = {}, coaches = {};
  Object.keys(sheetsBy).forEach((slug, i) => { servers[EXEC(i + 1)] = coaches[slug] = coach(SECRET(i + 1), sheetsBy[slug], (opts && opts.chunk) || 2); });
  const e = env(Object.assign({ servers }, opts || {}));
  Object.keys(sheetsBy).forEach((slug, i) => assert.equal(e.call('pusatRegister', 'kode-daftar-9', slug, EXEC(i + 1), SECRET(i + 1)).ok, true));
  e.coaches = coaches; e.servers = servers;
  e.tok = () => e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return e;
};
const bkst = (e, slug) => JSON.parse(e.props['BKST_' + slug] || 'null');
const live = (e, parent) => Object.values(e.drive.files).filter(f => f.parents.includes(parent) && !f.trashed);

test('backup: satu coach disalin utuh ke XNK Backup/<slug>/<slug> YYYY-MM-DD, dilanjutkan lintas jalan lewat kursor', () => {
  const e = bkEnv({ claudia: DATA });
  e.ctx.PUSAT_BK_BUDGET_MS = 0;   // satu potong per jalan
  let r, runs = 0;
  do { r = e.ctx.runPusatBackup(); runs++; } while (r.running && runs < 20);
  assert.equal(r.done, true);
  assert.equal(r.rows, 7);
  assert.ok(runs >= 4, 'dilanjutkan beberapa jalan (MemberData 3 potong + Schedules 1)');
  assert.equal(e.props.BK_CUR, undefined, 'kursor dibersihkan');
  assert.equal(e.props.BK_RUN, undefined, 'tanda jalan dilepas');
  const dirs = JSON.parse(e.props.BK_DIRS);
  assert.equal(e.drive.files[dirs.root].name, 'XNK Backup');
  assert.equal(e.drive.files[dirs.claudia].name, 'claudia');
  assert.deepEqual(e.drive.files[dirs.claudia].parents, [dirs.root]);
  const [file] = live(e, dirs.claudia);
  const wib = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  assert.equal(file.name, 'claudia ' + wib);
  const book = e.drive.books[file.id];
  assert.deepEqual(book.getSheets().map(s => s.name), ['MemberData', 'Kosong', 'Schedules'], 'urutan dan nama sheet sama; sheet bawaan diganti nama');
  const md = book.getSheetByName('MemberData');
  assert.deepEqual(md.cells, DATA.MemberData.map(r => r.map(v => (v === '=HACK()' ? "'=HACK()" : v))), 'isi sama; sel "=" tidak jadi rumus');
  assert.ok(md.formats.every(f => f[2] === '@'), 'format teks: 08… tetap utuh');
  assert.deepEqual(book.getSheetByName('Schedules').cells, DATA.Schedules);
  const st = bkst(e, 'claudia');
  assert.deepEqual([st.rows, st.error, st.fails, st.fileUrl], [7, '', 0, 'https://docs.google.com/spreadsheets/d/' + file.id + '/edit']);
  assert.equal(st.at, st.okAt);
  assert.ok(e.coaches.claudia.calls.filter(c => c.fn === 'hubExport').every(c => c.args[0] === SECRET(1)), 'rahasia hanya ke coach itu');
  assert.deepEqual(plain(e.ctx.runPusatBackup()), { idle: true }, 'baru dibackup: tidak jatuh tempo');
});

test('backup: anggaran waktu normal = selesai dalam satu jalan; baris/kolom sheet ditambah bila kurang', () => {
  const wide = [Array.from({ length: 30 }, (_, i) => 'k' + i)];
  for (let i = 0; i < 1200; i++) wide.push(Array.from({ length: 30 }, (_, j) => String(i * j)));
  const e = bkEnv({ claudia: { Lebar: wide } }, { chunk: 500 });
  const r = e.ctx.runPusatBackup();
  assert.equal(r.done, true);
  assert.equal(r.rows, 1201);
  const book = e.drive.books[live(e, JSON.parse(e.props.BK_DIRS).claudia)[0].id];
  const sh = book.getSheetByName('Lebar');
  assert.ok(sh.maxR >= 1201 && sh.maxC >= 30);
  assert.deepEqual(sh.cells[1200], wide[1200]);
});

test('backup: satu coach per jalan; jatuh tempo setelah 7 hari, yang tertua dulu', () => {
  const e = bkEnv({ claudia: DATA, dina: DATA, eko: DATA });
  const day = 864e5, iso = ms => new Date(Date.now() - ms).toISOString();
  e.props.BKST_claudia = JSON.stringify({ at: iso(1 * day), okAt: iso(1 * day), fileUrl: 'x', rows: 1, error: '', fails: 0 });
  e.props.BKST_dina = JSON.stringify({ at: iso(9 * day), okAt: iso(9 * day), fileUrl: 'x', rows: 1, error: '', fails: 0 });
  e.props.BKST_eko = JSON.stringify({ at: iso(8 * day), okAt: iso(8 * day), fileUrl: 'x', rows: 1, error: '', fails: 0 });
  assert.equal(e.ctx.runPusatBackup().slug, 'dina', 'backup tertua dulu');
  assert.ok(!e.coaches.eko.calls.some(c => c.fn === 'hubExport'), 'hanya satu coach per jalan');
  assert.equal(e.ctx.runPusatBackup().slug, 'eko');
  assert.deepEqual(plain(e.ctx.runPusatBackup()), { idle: true }, 'claudia baru 1 hari');
  // Jalan lain masih bekerja (BK_RUN baru) = tidak ada apa-apa.
  e.props.BK_RUN = String(Date.now());
  e.call('pusatAction', e.tok(), 'backup', 'claudia');
  assert.deepEqual(plain(e.ctx.runPusatBackup()), { busy: true });
  e.props.BK_RUN = String(Date.now() - 8 * 60e3);
  assert.equal(e.ctx.runPusatBackup().slug, 'claudia', 'tanda jalan lama (mati di tengah) diabaikan');
});

test('Backup sekarang: tanpa token GitHub, mendahului antrean, satu trigger sekali jalan; coach tak dikenal ditolak', () => {
  const e = bkEnv({ claudia: DATA, dina: DATA });
  const tok = e.tok();
  e.props.BKST_claudia = JSON.stringify({ at: new Date().toISOString(), okAt: new Date().toISOString(), fileUrl: 'x', rows: 1, error: '', fails: 0 });
  const r = e.call('pusatAction', tok, 'backup', 'claudia');
  assert.deepEqual(r.data, { started: 'backup', slug: 'claudia', queued: true });
  e.call('pusatAction', tok, 'backup', 'claudia');
  assert.deepEqual(e.triggers.filter(t => t === 'runPusatBackupSoon'), ['runPusatBackupSoon'], 'satu trigger saja');
  assert.ok(!e.fetches.some(f => f.url.includes('api.github.com') && f.url.includes('dispatches')), 'tanpa GitHub');
  let ov = e.call('pusatOverview', tok).data.coaches.find(c => c.slug === 'claudia');
  assert.equal(ov.backup.queued, true);
  const done = e.ctx.runPusatBackupSoon();
  assert.equal(done.slug, 'claudia', 'claudia baru dibackup tetapi ditandai: dikerjakan dulu, sebelum dina yang jatuh tempo');
  assert.equal(e.triggers.includes('runPusatBackupSoon'), false, 'trigger sekali jalan menghapus dirinya');
  assert.equal(e.props.BKNOW_claudia, undefined);
  ov = e.call('pusatOverview', tok).data.coaches.find(c => c.slug === 'claudia');
  assert.deepEqual([ov.backup.queued, ov.backup.running, ov.backup.rows, ov.backup.fails], [false, false, 7, 0]);
  assert.match(ov.backup.fileUrl, /^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
  assert.match(e.call('pusatAction', tok, 'backup', 'zaki').error, /Coach tidak terdaftar/);
  assert.match(e.call('pusatAction', tok, 'backup', '../x').error, /Coach tidak terdaftar/);
  assert.equal(e.call('pusatAction', 'palsu', 'backup', 'claudia').auth, true);
  const json = JSON.stringify(e.call('pusatOverview', tok).data);
  assert.ok(!json.includes(SECRET(1)) && !json.includes('08123') && !json.includes('Ani'), 'dasbor: tanpa rahasia dan tanpa isi data');
});

test('backup: simpan 8 terbaru per coach, sisanya ke sampah', () => {
  const e = bkEnv({ claudia: DATA });
  e.ctx.runPusatBackup();
  const dir = JSON.parse(e.props.BK_DIRS).claudia;
  for (let i = 0; i < 9; i++) { e.props.BKNOW_claudia = '1'; assert.equal(e.ctx.runPusatBackup().done, true); }
  const files = Object.values(e.drive.files).filter(f => f.parents.includes(dir));
  assert.equal(files.length, 10);
  const kept = files.filter(f => !f.trashed).map(f => f.id), gone = files.filter(f => f.trashed).map(f => f.id);
  assert.equal(kept.length, 8);
  const order = files.map(f => f.id);
  assert.deepEqual(gone, order.slice(0, 2), 'yang tertua dibuang');
  assert.ok(kept.includes(bkst(e, 'claudia').fileUrl.split('/d/')[1].split('/')[0]), 'salinan terbaru tetap');
});

test('backup gagal: salinan setengah jadi ke sampah, gagal dihitung; 2 kali berturut-turut = email harian; berhasil = nol lagi', () => {
  const e = bkEnv({ claudia: DATA });
  e.ctx.PUSAT_BK_BUDGET_MS = 0;
  assert.equal(e.ctx.runPusatBackup().running, true);
  const partial = JSON.parse(e.props.BK_CUR).fileId;
  const srv = e.servers[EXEC(1)];
  delete e.servers[EXEC(1)];   // coach diam di tengah jalan
  const r = e.ctx.runPusatBackup();
  assert.match(r.error, /Address unavailable/);
  assert.equal(e.drive.files[partial].trashed, true);
  assert.equal(e.props.BK_CUR, undefined);
  let st = bkst(e, 'claudia');
  assert.deepEqual([st.fails, st.okAt, st.fileUrl], [1, '', '']);
  assert.deepEqual(plain(e.ctx.runPusatBackup()), { idle: true }, 'baru gagal: tunggu 6 jam, tidak menahan coach lain');
  e.ctx.runPusatDaily();
  assert.ok(!e.mails.some(m => /Backup gagal/.test(m.body)), 'sekali gagal belum diemail');
  e.call('pusatAction', e.tok(), 'backup', 'claudia');
  e.ctx.runPusatBackup();
  st = bkst(e, 'claudia');
  assert.equal(st.fails, 2);
  e.servers[EXEC(1)] = srv;
  const d = e.ctx.runPusatDaily();
  assert.equal(d.problems, 1, 'status coach beres, tetapi backup gagal 2 kali');
  assert.match(e.mails[e.mails.length - 1].body, /claudia: Backup gagal 2 kali berturut-turut \(.*Address unavailable.*\)\./);
  e.call('pusatAction', e.tok(), 'backup', 'claudia');
  e.ctx.PUSAT_BK_BUDGET_MS = 60e3;
  assert.equal(e.ctx.runPusatBackup().done, true);
  st = bkst(e, 'claudia');
  assert.deepEqual([st.fails, st.error], [0, '']);
});

test('backup: Library lama tanpa hubExport = pesan "perbarui coach"; Drive menolak = pesan izin', () => {
  const e = env({ servers: { [EXEC(1)]: req => (req.fn === 'hubExport' ? { ok: false, error: 'Permintaan tidak valid.', code: 'unknown_fn' } : { ok: true, data: {} }) } });
  e.call('pusatRegister', 'kode-daftar-9', 'claudia', EXEC(1), SECRET(1));
  assert.match(e.ctx.runPusatBackup().error, /Library coach belum punya hubExport; perbarui coach/);
  const d = bkEnv({ claudia: DATA }, { driveDown: true });
  assert.match(d.ctx.runPusatBackup().error, /Drive menolak \(403\)\. Jalankan setupPusat/);
  assert.equal(bkst(d, 'claudia').fails, 1);
});

test('backup: coach dihapus dari daftar di tengah jalan = salinan dibuang tanpa status; folder hilang dibuat lagi', () => {
  const e = bkEnv({ claudia: DATA, dina: DATA });
  e.ctx.PUSAT_BK_BUDGET_MS = 0;
  assert.equal(e.ctx.runPusatBackup().slug, 'claudia');
  const partial = JSON.parse(e.props.BK_CUR).fileId;
  const all = JSON.parse(e.props.COACHES); delete all.claudia; e.props.COACHES = JSON.stringify(all);
  const dirs = JSON.parse(e.props.BK_DIRS);
  e.drive.files[dirs.root].trashed = true;   // pemilik membuang folder XNK Backup
  assert.equal(e.ctx.runPusatBackup().slug, 'dina');
  assert.equal(e.drive.files[partial].trashed, true);
  assert.equal(bkst(e, 'claudia'), null);
  const nd = JSON.parse(e.props.BK_DIRS);
  assert.notEqual(nd.root, dirs.root, 'folder XNK Backup dibuat lagi');
  assert.equal(e.drive.files[nd.dina].parents[0], nd.root);
});

// ── Web Push di hub (T-2240) ─────────────────────────────────────────────────────────────────────────────────
const VAPID = 'B' + 'v'.repeat(86), PUSH_SECRET = 'p'.repeat(40);
function pushServer(secret, relay) {
  const calls = [];
  const fn = req => {
    calls.push(req);
    if (req.args[0] !== secret) return { ok: false, error: 'Permintaan tidak valid.' };
    if (req.fn === 'hubStatus') return { ok: true, data: status(SHA_NEW) };
    if (req.fn === 'hubPushKey') return { ok: true, data: { on: req.args[2] === true, relay, subs: 3 } };
    return { ok: false, error: 'x', code: 'unknown_fn' };
  };
  fn.calls = calls;
  return fn;
}
function pushEnv(extra) {
  const coaches = { claudia: { exec: EXEC(1), secret: SECRET(1), at: 'x' }, vinna: { exec: EXEC(2), secret: SECRET(2), at: 'x' } };
  const a = pushServer(SECRET(1), 'r'.repeat(64)), b = pushServer(SECRET(2), 's'.repeat(64));
  const e = env(Object.assign({ hub: JSON.stringify({ vapidPublic: VAPID, coaches: [] }), props: { COACHES: JSON.stringify(coaches), PUSAT_PUSH_SECRET: PUSH_SECRET }, servers: { [EXEC(1)]: a, [EXEC(2)]: b } }, extra || {}));
  e.tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return { e, a, b };
}
const fetchCount = e => e.fetches.filter(f => f.url.startsWith('https://script.google.com/') || f.url.startsWith('https://script.googleusercontent.com/')).length;

test('push: mati sampai pemilik menyalakan; nyalakan = kunci hub + true ke coach itu saja; matikan = false', () => {
  const { e, a, b } = pushEnv();
  assert.deepEqual(e.call('pusatPushTargets', PUSH_SECRET).data, { coaches: [] }, 'off by default');
  e.ctx.runPusatDaily();
  assert.equal(a.calls.filter(c => c.fn === 'hubPushKey').length, 0, 'a coach never switched on is never contacted');
  const r = e.call('pusatAction', e.tok, 'push-on', 'claudia');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(a.calls.at(-1), { fn: 'hubPushKey', args: [SECRET(1), VAPID, true] });
  assert.equal(b.calls.filter(c => c.fn === 'hubPushKey').length, 0);
  const view = r.data.coaches.find(c => c.slug === 'claudia').push;
  assert.deepEqual(view, { on: true, active: true, subs: 3, at: view.at, error: '' });
  assert.ok(!JSON.stringify(r.data).includes('r'.repeat(64)), 'relay secret never sent to the dashboard');
  assert.ok(!JSON.stringify(r.data).includes(SECRET(1)));
  assert.deepEqual(e.call('pusatPushTargets', PUSH_SECRET).data, { coaches: [{ slug: 'claudia', exec: EXEC(1), relay: 'r'.repeat(64) }] });
  e.call('pusatAction', e.tok, 'push-off', 'claudia');
  assert.deepEqual(a.calls.at(-1).args[2], false);
  assert.deepEqual(e.call('pusatPushTargets', PUSH_SECRET).data, { coaches: [] });
  assert.equal(e.call('pusatAction', e.tok, 'push-on', 'tidakada').ok, false);
  assert.equal(e.call('pusatAction', 'palsu', 'push-on', 'claudia').ok, false);
});

test('push: pusatPushTargets dijaga PUSAT_PUSH_SECRET; tanpa secret terpasang selalu menolak', () => {
  const { e } = pushEnv();
  assert.equal(e.call('pusatPushTargets', 'p'.repeat(39)).ok, false);
  assert.equal(e.call('pusatPushTargets', '').ok, false);
  assert.equal(e.call('pusatPushTargets', SECRET(1)).ok, false, 'a coach secret is not the push secret');
  const n = env({ props: { PUSAT_PUSH_SECRET: 'pendek' } });
  assert.equal(n.call('pusatPushTargets', 'pendek').ok, false, 'a secret under 32 chars never works');
});

test('push: kuota — putaran kirim tanpa UrlFetch; harian 2 fetch per coach menyala; dihitung per hari', () => {
  const { e } = pushEnv();
  e.call('pusatAction', e.tok, 'push-on', 'claudia');
  e.call('pusatAction', e.tok, 'push-on', 'vinna');
  const before = e.fetches.length;
  for (let i = 0; i < 12 * 24; i++) e.call('pusatPushTargets', PUSH_SECRET);   // satu hari putaran workflow
  assert.equal(e.fetches.length, before, 'zero UrlFetch per send round');
  const s0 = fetchCount(e);
  e.ctx.pushSyncAll_();
  assert.equal(fetchCount(e) - s0, 4, '2 fetches (POST + echo GET) per switched-on coach');
  const today = e.call('pusatOverview', e.tok).data.fetchToday;
  assert.equal(today, e.fetches.length, 'every UrlFetch counted');
});

test('push: kunci hub belum ada / Library lama = pesan jelas dan masuk email harian', () => {
  const { e } = pushEnv({ hub: JSON.stringify({ coaches: [] }) });
  const r = e.call('pusatAction', e.tok, 'push-on', 'claudia');
  assert.match(r.error, /Kunci publik hub belum ada/);
  const old = env({ hub: JSON.stringify({ vapidPublic: VAPID, coaches: [] }), props: { COACHES: JSON.stringify({ claudia: { exec: EXEC(1), secret: SECRET(1), at: 'x' } }) },
    servers: { [EXEC(1)]: req => (req.fn === 'hubStatus' ? { ok: true, data: status(SHA_NEW) } : { ok: false, error: 'x', code: 'unknown_fn' }) } });
  const t = old.call('pusatLogin', 'pin-rahasia-1').data.token;
  assert.match(old.call('pusatAction', t, 'push-on', 'claudia').error, /perbarui coach/);
  old.ctx.runPusatDaily();
  assert.equal(old.mails.length, 1);
  assert.match(old.mails[0].body, /Notifikasi push: Library coach belum punya hubPushKey/);
});
