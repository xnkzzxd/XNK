'use strict';
// XNK HQ (T-2233): login PIN, pendaftaran coach, pemeriksaan harian + email, aksi ke GitHub. Layanan Google palsu.
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
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getContent: () => [...Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] });
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID(),
      newBlob: t => ({ getBytes: () => [...Buffer.from(String(t))] }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ content: t, setMimeType() { return this; } }) },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'pemilik@contoh.id' }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })), deleteTrigger: t => triggers.splice(triggers.indexOf(t.getHandlerFunction()), 1),
      newTrigger: h => { const b = { timeBased: () => b, atHour: () => b, everyDays: () => b, everyHours: () => b, everyMinutes: () => b, after: () => b, inTimezone: () => b, create: () => triggers.push(h) }; return b; },
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
        if (url.startsWith(UPLOAD)) return driveUpload(drive, url, o, reply, opts);
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
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
/** Unggah multipart (salinan .xlsx coach keluar, T-2252): metadata JSON di bagian pertama, isi di bagian kedua. */
function driveUpload(drive, url, o, reply, opts) {
  assert.equal(o.headers.Authorization, 'Bearer tok-pusat');
  assert.match(url, /uploadType=multipart/);
  if (opts.uploadDown) return reply(500, '{}');
  const b = (String(o.contentType).match(/boundary=(\S+)/) || [])[1];
  assert.ok(b, 'boundary');
  const text = Buffer.from(o.payload.map(x => x & 255)).toString('latin1');
  const meta = JSON.parse(text.split('--' + b)[1].split('\r\n\r\n')[1].trim());
  const body = text.split('--' + b)[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
  const id = 'f' + (++drive.n);
  drive.files[id] = { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || [], trashed: false, body, createdTime: new Date(Date.UTC(2026, 0, 1) + drive.n * 1000).toISOString() };
  return reply(200, { id, webViewLink: 'https://drive.google.com/file/d/' + id + '/view' });
}
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
  if (/\/export$/.test(p)) {   // T-2252: ekspor .xlsx
    const f = drive.files[decodeURIComponent(p.slice(1, -7))];
    if (!f || opts.xlsxDown) return reply(403, '{}');
    assert.equal(q.get('mimeType'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return reply(200, 'PK-XLSX-' + f.id);
  }
  const id = decodeURIComponent(p.slice(1));
  if (id) {
    const f = drive.files[id];
    if (!f) return reply(404, '{}');
    if (method === 'patch') {
      Object.assign(f, JSON.parse(o.payload));
      if (q.get('addParents')) f.parents = f.parents.filter(x => x !== q.get('removeParents')).concat([q.get('addParents')]);
    }
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

test('setupPusat: kunci sesi, trigger harian, backup tiap jam dan pembangun push; diulang tetap satu', () => {
  const e = env();
  e.ctx.setupPusat();
  assert.ok(e.props.SESSION_SECRET.length >= 32);
  assert.deepEqual(e.triggers, ['runPusatDaily', 'runPusatBackup', 'runPusatPushKick']);
  e.ctx.setupPusat();
  assert.deepEqual(e.triggers, ['runPusatDaily', 'runPusatBackup', 'runPusatPushKick']);
});

test('siapkan dari /adminxnk: tanda siap 10 menit membuka setupPusat lewat doGet; tanda palsu/kedaluwarsa tidak; overview melapor', () => {
  const e = env({ driveDown: true });
  e.triggers.length = 0;
  const tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  const ov = e.call('pusatOverview', tok).data.setup;
  assert.deepEqual([ov.ok, ov.auth, ov.daily, ov.backup, ov.pushKick], [false, false, false, false, false]);
  assert.equal(e.call('pusatAction', 'palsu', 'setup').auth, true, 'butuh login PIN');
  const t = e.call('pusatAction', tok, 'setup').data.ticket;
  assert.match(t, /^setup\.\d+\.[\w-]+$/);
  assert.ok(!t.includes(tok.split('.')[1]), 'bukan token sesi');
  assert.equal(e.ctx.doGet({ parameter: {} }).content, 'XNK HQ');
  assert.match(e.ctx.doGet({ parameter: { setup: t.replace(/.$/, 'x') } }).content, /tidak berlaku/);
  assert.match(e.ctx.doGet({ parameter: { setup: tok } }).content, /tidak berlaku/, 'token sesi bukan tanda siap');
  assert.deepEqual(e.triggers, []);
  const msg = e.ctx.doGet({ parameter: { setup: t } }).content;
  assert.match(msg, /izin Google baru .* belum diberikan/, 'jujur: izin baru tidak bisa lewat link web');
  assert.match(msg, /https:\/\/script\.google\.com\/d\/SCRIPTPUSAT\/edit/);
  assert.equal(e.call('pusatOverview', tok).data.setup.editor, 'https://script.google.com/d/SCRIPTPUSAT/edit');
  const g = env(), gt = g.call('pusatAction', g.call('pusatLogin', 'pin-rahasia-1').data.token, 'setup').data.ticket;
  assert.match(g.ctx.doGet({ parameter: { setup: gt } }).content, /XNK HQ siap: izin Google lengkap/);
  e.ctx.doGet({ parameter: { setup: t } });
  assert.deepEqual(e.triggers, ['runPusatDaily', 'runPusatBackup', 'runPusatPushKick'], 'diulang tetap satu');
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
  // T-2262: riwayat harian (angka saja), satu baris per hari WIB; gagal = null + 0.
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const hc = JSON.parse(e.props.HIST_claudia);
  assert.equal(hc.length, 1);
  assert.equal(hc[0][0], today);
  assert.equal(hc[0][1], 7);
  assert.equal(hc[0][8], 1);
  assert.deepEqual(JSON.parse(e.props.HIST_fani)[0].slice(1), [null, null, null, null, null, null, null, 0]);
  e.ctx.runPusatDaily();
  assert.equal(JSON.parse(e.props.HIST_claudia).length, 1, 'cek kedua di hari yang sama menimpa baris hari itu');
  const old = []; for (let i = 40; i >= 1; i--) old.push([new Date(Date.now() + 7 * 3600e3 - i * 86400e3).toISOString().slice(0, 10), i, 0, 0, 0, 0, 0, 0, 1]);
  e.props.HIST_claudia = JSON.stringify(old);
  e.ctx.runPusatDaily();
  const h2 = JSON.parse(e.props.HIST_claudia);
  assert.equal(h2.length, 30, 'hanya 30 hari');
  assert.equal(h2[29][0], today);
  assert.ok(!/0812|nama|name/i.test(e.props.HIST_claudia), 'tanpa data klien');
  const tokh = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  assert.equal(e.call('pusatOverview', tokh).data.coaches.find(c => c.slug === 'claudia').hist.length, 30, 'overview membawa riwayat');
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

test('kuota: kemarin penuh (quotaDays) dicek dan menimpa angka pagi di riwayat; Library lama tanpa quotaDays tetap jalan', () => {
  const wib = i => new Date(Date.now() + 7 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);
  const days = [{ date: wib(1), mail: 80, fetch: 300, triggerMin: 4.25, mailSkipped: 0 }, { date: wib(2), mail: 3, fetch: 10, triggerMin: 0.5 }];
  const servers = {
    [EXEC(1)]: server(SECRET(1), status(SHA_NEW, { quota: { date: wib(0), mail: 0, fetch: 0, triggerMin: 0.02 }, quotaDays: days })),
    [EXEC(2)]: server(SECRET(2), status(SHA_NEW, { quota: { date: wib(0), mail: 1, fetch: 0, triggerMin: 0 } })),
  };
  const e = env({ servers });
  [['claudia', 1], ['dina', 2]].forEach(([s, n]) => assert.equal(e.call('pusatRegister', 'kode-daftar-9', s, EXEC(n), SECRET(n)).ok, true));
  e.props.HIST_claudia = JSON.stringify([[wib(2), 5, 6, 1, 1, 0, 0, 0, 1], [wib(1), 5, 6, 1, 1, 0, 0, 0.1, 1]]);
  e.ctx.runPusatDaily();
  assert.equal(e.mails.length, 1);
  assert.match(e.mails[0].body, /claudia: Kuota email kemarin 80 dari 100 \(≥ 70 %\)\./);
  assert.ok(!/dina/.test(e.mails[0].body), 'Library lama: hanya hari ini');
  const h = JSON.parse(e.props.HIST_claudia);
  assert.deepEqual(h.map(r => r[0]), [wib(2), wib(1), wib(0)], 'tidak menambah hari yang tidak pernah dicek');
  assert.deepEqual(h[0].slice(5), [3, 10, 0.5, 1]);
  assert.deepEqual(h[1].slice(1), [5, 6, 1, 1, 80, 300, 4.25, 1], 'klien/sesi kemarin tetap, kuota jadi hari penuh');
  assert.deepEqual(h[2].slice(5, 8), [0, 0, 0.02]);
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

// ── Ganti slug (T-2243) ──────────────────────────────────────────────────────────────────────────────────────
function renameEnv(extra) {
  extra = extra || {};
  const coaches = { lama: { exec: EXEC(1), secret: SECRET(1), at: 'x' }, vinna: { exec: EXEC(2), secret: SECRET(2), at: 'x' } };
  const calls = [];
  const a = req => {
    calls.push(req);
    if (req.args[0] !== SECRET(1)) return { ok: false, error: 'Permintaan tidak valid.' };
    if (req.fn === 'hubSiteUrl' && !extra.oldLib) return { ok: true, data: { siteUrl: req.args[1], changed: true } };
    if (req.fn === 'hubPushKey') return { ok: true, data: { on: true, relay: 'r'.repeat(64), subs: 2 } };
    return { ok: false, error: 'Fungsi tidak dikenal.', code: 'unknown_fn' };
  };
  const hub = { vapidPublic: VAPID, coaches: [{ slug: 'lama', exec: EXEC(1) }, { slug: 'vinna', exec: EXEC(2), aliases: ['vina'] }] };
  const props = Object.assign({ COACHES: JSON.stringify(coaches), PUSAT_PUSH_SECRET: PUSH_SECRET,
    ST_lama: JSON.stringify({ at: 'x', ok: true, problems: [] }), HIST_lama: JSON.stringify([['2026-11-18', 3, 5, 1, 2, 0, 0, 0, 1]]), BKST_lama: JSON.stringify({ okAt: '2026-11-15T00:00:00Z', fileUrl: 'u', fails: 0 }),
    PUSH_lama: JSON.stringify({ on: true, active: true, relay: 'r'.repeat(64), exec: EXEC(1), subs: 2 }), BK_DIRS: JSON.stringify({ root: 'f1', lama: 'f2', vinna: 'f3' }) }, extra.props || {});
  const e = env({ hub: JSON.stringify(hub), props, servers: { [EXEC(1)]: a, [EXEC(2)]: () => ({ ok: false }) } });
  e.drive.files.f1 = { id: 'f1', name: 'XNK Backup', parents: [], trashed: false };
  e.drive.files.f2 = { id: 'f2', name: 'lama', parents: ['f1'], trashed: false };
  e.tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return { e, calls };
}

test('ganti slug: pendaftaran, status, backup, push dan folder pindah; coach menerima SITE_URL baru; workflow Hub XNK dijalankan', () => {
  const { e, calls } = renameEnv({ props: { GITHUB_TOKEN: 'github_pat_x' } });
  const r = e.call('pusatRename', e.tok, 'lama', 'Baru');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.data, { slug: 'baru', from: 'lama', site: 'ok', folder: 'ok', hub: 'ok' });
  const all = JSON.parse(e.props.COACHES);
  assert.deepEqual(Object.keys(all).sort(), ['baru', 'vinna']);
  assert.deepEqual(all.baru, { exec: EXEC(1), secret: SECRET(1), at: 'x' }, 'rahasia dan link /exec tetap');
  for (const k of ['ST_', 'HIST_', 'BKST_', 'PUSH_']) { assert.ok(e.props[k + 'baru'], k + ' pindah'); assert.equal(e.props[k + 'lama'], undefined, k + ' lama dihapus'); }
  assert.deepEqual(JSON.parse(e.props.BK_DIRS), { root: 'f1', baru: 'f2', vinna: 'f3' });
  assert.equal(e.drive.files.f2.name, 'baru', 'folder XNK Backup/lama → XNK Backup/baru (ID sama, salinan lama tetap)');
  assert.deepEqual(calls.filter(c => c.fn === 'hubSiteUrl').map(c => c.args), [[SECRET(1), 'https://xnk.web.id/baru']]);
  assert.equal(e.props.SITEQ_baru, undefined, 'diterima = antrean kosong');
  const d = e.fetches.filter(f => f.url.includes('/dispatches'));
  assert.equal(d.length, 1);
  assert.match(d[0].url, /\/actions\/workflows\/hub\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(d[0].o.payload), { ref: 'main', inputs: { aksi: 'ganti-slug', slug: 'lama', slug_baru: 'baru' } });
  // Push tetap ke /exec coach yang sama, sekarang dengan nama baru.
  assert.deepEqual(e.call('pusatPushTargets', PUSH_SECRET).data, { coaches: [{ slug: 'baru', exec: EXEC(1), relay: 'r'.repeat(64) }] });
  const ov = e.call('pusatOverview', e.tok).data.coaches.find(c => c.slug === 'baru');
  assert.equal(ov.backup.fileUrl, 'u');
  assert.equal(ov.panel, 'https://xnk.web.id/baru/');
  assert.ok(!JSON.stringify(r.data).includes(SECRET(1)));
});

test('ganti slug: penjaga dan penolakan (token, nama sistem, nama dipakai coach lain atau alamat lamanya, tidak terdaftar)', () => {
  const { e } = renameEnv();
  assert.equal(e.call('pusatRename', 'palsu', 'lama', 'baru').auth, true);
  for (const [from, to, re] of [['lama', 'admin', /dipakai sistem/], ['lama', 'a b', /tidak valid/], ['lama', 'lama', /sama dengan nama sekarang/],
    ['lama', 'vinna', /sudah dipakai coach "vinna"/], ['lama', 'vina', /sudah dipakai coach "vinna"/], ['tidakada', 'baru', /tidak terdaftar/]]) {
    const r = e.call('pusatRename', e.tok, from, to);
    assert.equal(r.ok, false, from + '→' + to);
    assert.match(r.error, re);
  }
  assert.deepEqual(Object.keys(JSON.parse(e.props.COACHES)).sort(), ['lama', 'vinna'], 'tidak ada yang berubah');
  assert.ok(e.props.ST_lama);
});

test('ganti slug: tanpa token GitHub = langkah manual; coach lama tanpa hubSiteUrl = dicoba lagi tiap pagi sampai diterima', () => {
  const opt = { oldLib: true };
  const { e, calls } = renameEnv(opt);
  const r = e.call('pusatRename', e.tok, 'lama', 'baru').data;
  assert.match(r.hub, /Hub XNK → aksi ganti-slug, slug lama, slug_baru baru/);
  assert.match(r.site, /belum punya hubSiteUrl/);
  assert.equal(e.props.SITEQ_baru, 'https://xnk.web.id/baru');
  assert.equal(e.fetches.filter(f => f.url.includes('/dispatches')).length, 0);
  e.ctx.runPusatDaily();
  assert.ok(e.mails.some(m => /baru: .*Alamat baru belum diterima coach/.test(m.body)), 'masuk email harian');
  assert.equal(e.props.SITEQ_baru, 'https://xnk.web.id/baru', 'tetap di antrean');
  // Coach diperbarui: pagi berikutnya alamat diterima dan antrean kosong.
  opt.oldLib = false;
  calls.length = 0;
  e.ctx.runPusatDaily();
  assert.deepEqual(calls.filter(c => c.fn === 'hubSiteUrl').map(c => c.args[1]), ['https://xnk.web.id/baru']);
  assert.equal(e.props.SITEQ_baru, undefined);
  calls.length = 0;
  e.ctx.runPusatDaily();
  assert.equal(calls.filter(c => c.fn === 'hubSiteUrl').length, 0, 'sudah diterima = tidak dikirim lagi');
});

test('ganti slug: nama dicek sama dengan tools/build-hub.js (RESERVED, pola slug)', () => {
  const hub = require('../../xnk-library/tools/build-hub');
  const { e } = renameEnv();
  assert.deepEqual(Array.from(e.ctx.PUSAT_RESERVED), hub.RESERVED);
  assert.equal(String(e.ctx.PUSAT_SLUG_RE), String(hub.SLUG_RE));
});

// ── Langganan bulanan (T-2251) ──────────────────────────────────────────────────────────────────────────────
const wib = (d) => new Date(Date.now() + 7 * 3600 * 1000 + (d || 0) * 864e5).toISOString().slice(0, 10);
/** Coach palsu dengan hubStatus + hubReadonly; `old` = Library lama tanpa hubReadonly. */
function roCoach(secret, old) {
  const st = { on: false, calls: [] };
  const fn = req => {
    if (req.args[0] !== secret) return { ok: false, error: 'Permintaan tidak valid.' };
    if (req.fn === 'hubStatus') return { ok: true, data: status(SHA_NEW) };
    if (req.fn === 'hubReadonly' && !old) { st.calls.push(req.args.slice(1)); st.on = req.args[1] === true; return { ok: true, data: { on: st.on, note: req.args[2] || '', changed: true } }; }
    return { ok: false, error: 'Permintaan tidak valid.', code: 'unknown_fn' };
  };
  fn.st = st;
  return fn;
}
function subEnv(opts) {
  opts = opts || {};
  const a = roCoach(SECRET(1), opts.oldA), b = roCoach(SECRET(2));
  const coaches = { claudia: { exec: EXEC(1), secret: SECRET(1), at: 'x' }, vinna: { exec: EXEC(2), secret: SECRET(2), at: 'x' } };
  const e = env({ hub: JSON.stringify({ coaches: [{ slug: 'claudia', name: 'Claudia Fit' }] }), props: Object.assign({ COACHES: JSON.stringify(coaches) }, opts.props || {}), servers: { [EXEC(1)]: a, [EXEC(2)]: b } });
  e.tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return { e, a, b };
}
const subOf = (r, slug) => r.data.coaches.find(c => c.slug === slug).sub;

test('langganan: bawaan semua coach = gratis; tanpa baris tidak pernah baca saja dan tidak dihubungi', () => {
  const { e, a, b } = subEnv();
  const r = e.call('pusatOverview', e.tok);
  for (const s of ['claudia', 'vinna']) {
    const v = subOf(r, s);
    assert.equal(v.plan, 'gratis'); assert.equal(v.state, 'gratis'); assert.equal(v.readonly, false); assert.equal(v.ro, 'auto');
  }
  e.ctx.runPusatDaily();
  assert.equal(a.st.calls.length + b.st.calls.length, 0, 'free coaches are never sent hubReadonly');
  assert.equal(e.mails.length, 0);
  assert.equal(e.ctx.subStatus_(e.ctx.subState_('tidakada'), wib()).readonly, false);
});

test('langganan: hitungan status — aktif, segera (≤ 7 hari), tenggang 7 hari, lalu baca saja; sakelar tangan menang', () => {
  const { e } = subEnv();
  const S = (due, ro, plan) => e.ctx.subStatus_({ plan: plan || 'bulanan', due, ro: ro || 'auto' }, '2026-11-19');
  assert.equal(S('2026-12-19').state, 'aktif');
  assert.equal(S('2026-11-26').state, 'segera');
  assert.equal(S('2026-11-19').state, 'segera');
  assert.deepEqual([S('2026-11-18').state, S('2026-11-18').graceLeft, S('2026-11-18').readonly], ['tenggang', 6, false]);
  assert.deepEqual([S('2026-11-12').state, S('2026-11-12').readonly], ['tenggang', false], 'day 7 of grace is still grace');
  assert.deepEqual([S('2026-11-11').state, S('2026-11-11').readonly], ['lewat', true]);
  assert.equal(S('2026-11-01', 'off').readonly, false, 'manual off wins');
  assert.equal(S('2026-12-19', 'on').readonly, true, 'manual on wins');
  assert.equal(S('', 'on', 'gratis').readonly, true, 'owner can switch a free coach to read-only by hand');
  assert.equal(S('', 'auto', 'bulanan').readonly, false, 'monthly without a due date is never read-only');
  assert.equal(e.ctx.addMonth_('2026-01-31'), '2026-02-28');
  assert.equal(e.ctx.addMonth_('2028-01-31'), '2028-02-29');
  assert.equal(e.ctx.addMonth_('2026-12-15'), '2027-01-15');
});

test('langganan: simpan dari /adminxnk diperiksa; hanya pemilik; coach tak dikenal ditolak', () => {
  const { e } = subEnv();
  assert.equal(e.call('pusatSubSave', 'palsu', 'claudia', { plan: 'bulanan', due: wib(30) }).ok, false);
  assert.equal(e.call('pusatSubSave', e.tok, 'tidakada', { plan: 'bulanan', due: wib(30) }).ok, false);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan' }).error, /jatuh tempo/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: '2026-02-30' }).error, /tidak valid/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(30), price: '12,5' }).error, /bilangan bulat/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(30), email: 'bukan email' }).error, /Email/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'x' }).error, /Pilih paket/);
  const r = e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(30), price: '150.000', email: 'coach@contoh.id' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([subOf(r, 'claudia').price, subOf(r, 'claudia').state, subOf(r, 'claudia').email], [150000, 'aktif', 'coach@contoh.id']);
  assert.ok(!JSON.stringify(r.data).includes(SECRET(1)));
});

test('langganan: lewat tenggang = hubReadonly(true) ke coach itu saja; Tandai lunas = +1 bulan, riwayat, mati lagi', () => {
  const { e, a, b } = subEnv();
  e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(-8), price: 100000 });
  assert.deepEqual(a.st.calls.at(-1), [true, 'Langganan lewat jatuh tempo ' + wib(-8) + '.'], 'pushed at once on save');
  assert.equal(a.st.on, true);
  assert.equal(b.st.calls.length, 0);
  let r = e.call('pusatOverview', e.tok);
  assert.deepEqual([subOf(r, 'claudia').state, subOf(r, 'claudia').readonly, subOf(r, 'claudia').pushed.on], ['lewat', true, true]);
  r = e.call('pusatAction', e.tok, 'sub-paid', 'claudia');
  assert.equal(r.ok, true, r.error);
  const v = subOf(r, 'claudia');
  assert.equal(v.due, e.ctx.addMonth_(wib(-8)));
  assert.equal(v.history.length, 1);
  assert.equal(v.history[0].due, wib(-8));
  assert.equal(v.readonly, false);
  assert.deepEqual(a.st.calls.at(-1), [false, '']);
  assert.equal(a.st.on, false);
  assert.match(e.call('pusatAction', e.tok, 'sub-paid', 'vinna').error, /paket bulanan/, 'free coach cannot be marked paid');
});

test('langganan: baca saja tangan nyala/mati/otomatis kapan saja; dikirim hanya saat berubah; cek harian menyamakan', () => {
  const { e, a } = subEnv();
  e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(20) });
  assert.equal(a.st.calls.length, 0, 'nothing to send while active and never pushed');
  let r = e.call('pusatAction', e.tok, 'sub-ro-on', 'claudia');
  assert.equal(subOf(r, 'claudia').readonly, true);
  assert.deepEqual(a.st.calls.at(-1), [true, 'Dinyalakan oleh pengelola XNK.']);
  const n = a.st.calls.length;
  e.call('pusatOverview', e.tok);
  assert.equal(a.st.calls.length, n, 'overview never contacts coaches');
  r = e.call('pusatAction', e.tok, 'sub-ro-off', 'claudia');
  assert.deepEqual([subOf(r, 'claudia').readonly, a.st.on], [false, false]);
  e.call('pusatAction', e.tok, 'sub-ro-auto', 'claudia');
  // Coach mengubah sendiri (mis. Library diperbarui): cek harian mengirim lagi keadaan yang benar.
  e.call('pusatAction', e.tok, 'sub-ro-on', 'claudia');
  a.st.on = false;
  const s = JSON.parse(e.props.SUB_claudia); s.pushed.error = 'x'; e.props.SUB_claudia = JSON.stringify(s);
  e.ctx.runPusatDaily();
  assert.equal(a.st.on, true);
  assert.equal(e.call('pusatAction', e.tok, 'sub-zzz', 'claudia').ok, false);
});

test('langganan: email H-7 dan H-1 ke email coach (kosong = pemilik), sekali per jatuh tempo; tenggang masuk email pemilik', () => {
  const { e } = subEnv({ props: { PUSAT_EMAIL: 'owner@xnk.id' } });
  e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(7), price: 150000, email: 'claudia@contoh.id' });
  e.call('pusatSubSave', e.tok, 'vinna', { plan: 'bulanan', due: wib(1) });
  e.ctx.runPusatDaily();
  const toC = e.mails.filter(m => m.to === 'claudia@contoh.id');
  assert.equal(toC.length, 1);
  assert.match(toC[0].subject, /Claudia Fit.*7 hari lagi/);
  assert.match(toC[0].body, /Rp 150\.000/);
  assert.match(toC[0].body, /tidak pernah dihapus/);
  const toV = e.mails.filter(m => m.to === 'owner@xnk.id' && /besok/.test(m.subject));
  assert.equal(toV.length, 1, 'no coach email = owner email');
  const before = e.mails.length;
  e.ctx.runPusatDaily();
  assert.equal(e.mails.length, before, 'each reminder once per due date');
  // Masa tenggang: masuk email masalah pemilik; belum baca saja.
  e.call('pusatSubSave', e.tok, 'vinna', { plan: 'bulanan', due: wib(-2) });
  e.ctx.runPusatDaily();
  const daily = e.mails.at(-1);
  assert.match(daily.subject, /perlu dicek/);
  assert.match(daily.body, /vinna: .*masa tenggang 5 hari lagi/);
});

test('langganan: Library lama tanpa hubReadonly = pesan "perbarui coach", tersimpan, masuk email; ganti slug ikut memindahkan', () => {
  const { e } = subEnv({ oldA: true });
  e.call('pusatSubSave', e.tok, 'claudia', { plan: 'bulanan', due: wib(20) });
  const r = e.call('pusatAction', e.tok, 'sub-ro-on', 'claudia');
  assert.equal(r.ok, true);
  assert.match(r.data.notice, /belum punya hubReadonly; perbarui coach/);
  assert.match(subOf(r, 'claudia').pushed.error, /perbarui coach/);
  e.ctx.runPusatDaily();
  assert.match(e.mails.at(-1).body, /claudia: .*Mode baca saja belum diterima coach/);
  assert.ok(e.ctx.PUSAT_SLUG_KEYS.includes('SUB_'));
});

// ── Tempat latihan (T-2258) ──────────────────────────────────────────────────────────────────────────────────
function placeEnv(props) {
  const hub = { coaches: [{ slug: 'lama', exec: EXEC(1), place: { name: 'Gold Gym', city: 'Bandung' } }, { slug: 'vinna', exec: EXEC(2) }, { slug: 'baru', exec: EXEC(3) }] };
  const e = env({ hub: JSON.stringify(hub), props: Object.assign({ COACHES: JSON.stringify({ lama: { exec: EXEC(1), secret: SECRET(1), at: 'x' }, vinna: { exec: EXEC(2), secret: SECRET(2), at: 'x' } }) }, props || {}) });
  e.tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return e;
}

test('tempat: overview membawa tempat tiap coach di hub.json (juga yang belum terdaftar)', () => {
  const e = placeEnv();
  assert.deepEqual(JSON.parse(JSON.stringify(e.call('pusatOverview', e.tok).data.places)), { lama: { name: 'Gold Gym', city: 'Bandung' }, vinna: null, baru: null });
});

test('tempat: simpan dan hapus menjalankan Hub XNK aksi simpan (warna tetap); tanpa token GitHub = langkah manual', () => {
  const e = placeEnv({ GITHUB_TOKEN: 'github_pat_x' });
  let r = e.call('pusatSetPlace', e.tok, 'vinna', "  Gold's   Gym ", 'Jakarta Selatan');
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.data, { slug: 'vinna', place: { name: "Gold's Gym", city: 'Jakarta Selatan' }, hub: 'ok' });
  r = e.call('pusatSetPlace', e.tok, 'lama', '', '');
  assert.deepEqual(r.data, { slug: 'lama', place: null, hub: 'ok' });
  const d = e.fetches.filter(f => f.url.includes('/dispatches'));
  assert.equal(d.length, 2);
  assert.match(d[0].url, /\/repos\/xnkzzxd\/xnk-template-site\/actions\/workflows\/hub\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(d[0].o.payload), { ref: 'main', inputs: { aksi: 'simpan', slug: 'vinna', warna: 'tetap', tempat: "Gold's Gym", kota: 'Jakarta Selatan' } });
  assert.deepEqual(JSON.parse(d[1].o.payload).inputs, { aksi: 'simpan', slug: 'lama', warna: 'tetap', tempat: '-', kota: '' });
  const m = placeEnv();
  r = m.call('pusatSetPlace', m.tok, 'vinna', 'Gym', 'Bogor').data;
  assert.match(r.hub, /Hub XNK → aksi simpan, slug vinna, tempat Gym, kota Bogor/);
  assert.equal(m.fetches.filter(f => f.url.includes('/dispatches')).length, 0);
});

test('tempat: penjaga (token, slug, coach tidak di hub.json, isian salah); GitHub menolak = pesan + langkah manual', () => {
  const e = placeEnv({ GITHUB_TOKEN: 'github_pat_x' });
  assert.equal(e.call('pusatSetPlace', 'palsu', 'lama', 'Gym', 'B').auth, true);
  for (const [slug, n, c, re] of [['a b', 'Gym', 'B', /tidak valid/], ['siapa', 'Gym', 'B', /belum ada di hub\.json/], ['lama', 'Gym', '', /Isi nama tempat dan kota/],
    ['lama', '<i>', 'B', /tidak boleh berisi tanda < >/], ['lama', 'x'.repeat(61), 'B', /paling panjang 60/]]) {
    const r = e.call('pusatSetPlace', e.tok, slug, n, c);
    assert.equal(r.ok, false, slug + n);
    assert.match(r.error, re);
  }
  assert.equal(e.fetches.filter(f => f.url.includes('/dispatches')).length, 0, 'tidak ada yang dikirim');
  const x = env({ dispatch: 422, hub: JSON.stringify({ coaches: [{ slug: 'lama', exec: EXEC(1) }] }), props: { GITHUB_TOKEN: 'x' } });
  x.tok = x.call('pusatLogin', 'pin-rahasia-1').data.token;
  const r = x.call('pusatSetPlace', x.tok, 'lama', 'Gym', 'Bogor').data;
  assert.match(r.hub, /^GitHub menolak \(422\)\. Jalankan sendiri: repo hub → Actions → Hub XNK/);
});

// ── Coach keluar (T-2252) ───────────────────────────────────────────────────────────────────────────────────
/** Coach palsu lengkap: hubStatus (readonly ikut keadaan), hubExport, hubReadonly (dengan tanda keluar), hubPushKey. */
const OUT_VAPID = 'B' + 'q'.repeat(86);
function outCoach(secret, sheets) {
  const st = { on: false, left: false, ro: [], push: [], calls: [] };
  const ex = coach(secret, sheets, 3);
  const fn = req => {
    st.calls.push(req.fn);
    if (req.args[0] !== secret) return { ok: false, error: 'Permintaan tidak valid.' };
    if (req.fn === 'hubStatus') return { ok: true, data: status('e'.repeat(40), { readonly: st.on, left: st.left }) };
    if (req.fn === 'hubReadonly') { st.ro.push(req.args.slice(1)); st.on = req.args[1] === true; st.left = st.on && req.args[3] === true; return { ok: true, data: { on: st.on, left: st.left, note: req.args[2] || '', changed: true } }; }
    if (req.fn === 'hubPushKey') { st.push.push(req.args[2]); return { ok: true, data: { on: req.args[2] === true, relay: 'r'.repeat(40), subs: 2 } }; }
    return ex(req);
  };
  fn.st = st;
  return fn;
}
function outEnv(opts) {
  opts = opts || {};
  const a = outCoach(SECRET(1), DATA), b = outCoach(SECRET(2), DATA);
  const hub = { vapidPublic: OUT_VAPID, coaches: [{ slug: 'claudia', brand: 'Claudia', exec: EXEC(1), inactive: !!opts.hubInactive }, { slug: 'vinna', brand: 'Coach Vinna', exec: EXEC(2) }] };
  const coaches = { claudia: { exec: EXEC(1), secret: SECRET(1), at: 'x' }, vinna: { exec: EXEC(2), secret: SECRET(2), at: 'x' } };
  const push = { on: true, active: true, relay: 'r'.repeat(40), exec: EXEC(1), subs: 2 };
  const props = Object.assign({ COACHES: JSON.stringify(coaches), PUSAT_PUSH_SECRET: 'p'.repeat(40), PUSH_claudia: JSON.stringify(push), PUSH_vinna: JSON.stringify(Object.assign({}, push, { exec: EXEC(2) })) }, opts.github === false ? {} : { GITHUB_TOKEN: 'ghp' }, opts.props || {});
  const e = env(Object.assign({}, opts, { hub: JSON.stringify(hub), props, servers: { [EXEC(1)]: a, [EXEC(2)]: b } }));
  e.tok = e.call('pusatLogin', 'pin-rahasia-1').data.token;
  return { e, a, b };
}
const outOf = (e, slug) => JSON.parse(e.props['OUT_' + slug] || 'null');
const dispatches = e => e.fetches.filter(f => f.url.includes('/hub.yml/dispatches')).map(f => JSON.parse(f.o.payload).inputs);

test('coach keluar: konfirmasi slug; baca saja permanen + tanda keluar, push mati, folder Akhir, backup akhir + Excel, hub nonaktif; coach lain tidak tersentuh', () => {
  const { e, a, b } = outEnv();
  assert.equal(e.call('pusatLeave', 'palsu', 'claudia', 'claudia').auth, true);
  assert.match(e.call('pusatLeave', e.tok, 'claudia', 'Claudia').error, /Ketik "claudia" persis/);
  assert.match(e.call('pusatLeave', e.tok, 'claudia', '').error, /Ketik "claudia" persis/);
  assert.match(e.call('pusatLeave', e.tok, 'zaki', 'zaki').error, /Coach tidak terdaftar/);
  assert.equal(outOf(e, 'claudia'), null, 'nothing written when refused');

  const r = e.call('pusatLeave', e.tok, 'claudia', ' claudia ');
  assert.equal(r.ok, true, r.error);
  const d = r.data;
  assert.deepEqual([d.slug, d.day, d.deleteOn, d.readonly, d.push, d.backup, d.hub], ['claudia', wib(), wib(30), 'ok', 'ok', 'ok', 'ok']);
  assert.match(d.dirUrl, /^https:\/\/drive\.google\.com\/drive\/folders\/f\d+$/);
  assert.deepEqual(a.st.ro.at(-1), [true, e.ctx.PUSAT_OUT_NOTE, true], 'read-only with the leave flag');
  assert.equal(a.st.left, true);
  assert.deepEqual(a.st.push, [false], 'push switched off at the coach');
  assert.deepEqual(dispatches(e), [{ aksi: 'nonaktif', slug: 'claudia' }]);
  assert.ok(e.props.BKNOW_claudia, 'final backup queued');
  assert.ok(e.triggers.includes('runPusatBackupSoon'));
  assert.match(e.call('pusatLeave', e.tok, 'claudia', 'claudia').error, /sudah ditandai keluar/);

  // Coach lain: tidak dihubungi, push tetap, tidak ada tanda keluar.
  assert.deepEqual([b.st.ro.length, b.st.push.length], [0, 0]);
  const targets = e.call('pusatPushTargets', 'p'.repeat(40)).data.coaches.map(c => c.slug);
  assert.deepEqual(targets, ['vinna'], 'coach keluar never receives push');

  // Backup akhir berjalan sampai selesai: spreadsheet + .xlsx di folder Akhir, link dicatat, email ke pemilik.
  const done = e.ctx.runPusatBackupSoon();
  assert.equal(done.slug, 'claudia');
  assert.equal(done.done, true);
  const o = outOf(e, 'claudia');
  assert.equal(o.final.state, 'selesai');
  const dir = o.final.dir, sheet = e.drive.files[o.final.fileUrl.match(/\/d\/(f\d+)\//)[1]];
  assert.deepEqual(sheet.parents, [dir], 'final spreadsheet moved into Akhir');
  const xlsx = Object.values(e.drive.files).find(f => f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual([xlsx.name, xlsx.parents, xlsx.body], ['claudia ' + wib() + '.xlsx', [dir], 'PK-XLSX-' + sheet.id]);
  assert.equal(e.drive.files[dir].name, 'Akhir');
  assert.equal(o.final.xlsxUrl, 'https://drive.google.com/file/d/' + xlsx.id + '/view');
  const mail = e.mails.find(m => /backup akhir claudia siap/.test(m.subject));
  assert.ok(mail && mail.body.includes(o.final.xlsxUrl) && mail.body.includes(wib(30)));
  assert.equal(e.triggers.includes('runPusatBackupSoon'), false, 'chain stops when the final backup is done');
  const ov = e.call('pusatOverview', e.tok).data;
  const oc = ov.coaches.find(c => c.slug === 'claudia').out;
  assert.deepEqual([oc.deleteOn, oc.daysLeft, oc.canUndo, oc.final.state, oc.final.xlsxUrl], [wib(30), 30, true, 'selesai', o.final.xlsxUrl]);
  assert.equal(ov.coaches.find(c => c.slug === 'vinna').out, null);
  assert.ok(!JSON.stringify(ov).includes(SECRET(1)) && !JSON.stringify(ov).includes('08123'), 'dashboard: no secrets, no client data');
  // Folder Akhir tidak ikut dipangkas: 8 backup lain di folder coach tidak menyentuh salinan akhir.
  assert.equal(e.drive.files[sheet.id].trashed, false);
});

test('coach keluar: cek harian tidak membatalkan baca saja; tanpa tagihan; tanpa backup mingguan; push/langganan diblokir', () => {
  const { e, a, b } = outEnv({ hubInactive: true });
  e.props.SUB_claudia = JSON.stringify({ plan: 'bulanan', price: 100000, due: wib(1), ro: 'off' });
  e.call('pusatLeave', e.tok, 'claudia', 'claudia');
  e.ctx.runPusatBackupSoon();
  const n = a.st.ro.length;
  e.mails.length = 0;
  e.ctx.runPusatDaily();
  assert.deepEqual(a.st.ro.at(-1), [true, e.ctx.PUSAT_OUT_NOTE, true], 'daily check re-sends read-only + leave (switch "off" and the subscription lose)');
  assert.equal(a.st.ro.length, n + 1);
  assert.ok(!e.mails.some(m => /langganan/i.test(m.subject)), 'no billing email for a coach who left');
  assert.ok(!e.mails.some(m => /Hapus akun Google/.test(m.body)), 'no reminder before H-3');
  assert.equal(b.st.ro.length, 0, 'other coach untouched');
  // Backup mingguan tidak lagi untuk coach keluar yang backup akhirnya sudah jadi.
  e.props.BKST_vinna = JSON.stringify({ at: new Date().toISOString(), okAt: new Date().toISOString(), fileUrl: 'x', rows: 1, error: '', fails: 0 });
  const old = new Date(Date.now() - 9 * 864e5).toISOString();
  e.props.BKST_claudia = JSON.stringify({ at: old, okAt: old, fileUrl: 'x', rows: 1, error: '', fails: 0 });
  assert.deepEqual(plain(e.ctx.runPusatBackup()), { idle: true });
  assert.match(e.call('pusatAction', e.tok, 'push-on', 'claudia').error, /sudah keluar/);
  assert.match(e.call('pusatAction', e.tok, 'sub-ro-off', 'claudia').error, /sudah keluar/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { plan: 'gratis' }).error, /sudah keluar/);
  // Status: Library lama tidak jadi masalah; yang dicek hanya baca saja.
  const st = e.call('pusatCheck', e.tok, 'claudia').data.coaches.find(c => c.slug === 'claudia').status;
  assert.deepEqual(st.problems, []);
  a.st.on = false;
  assert.match(e.call('pusatCheck', e.tok, 'claudia').data.coaches.find(c => c.slug === 'claudia').status.problems.join(' '), /baca saja belum menyala/);
});

test('coach keluar: pengingat "hapus akun Google coach" mulai H-3 di email harian sampai "Akun sudah dihapus"', () => {
  const { e } = outEnv({ hubInactive: true });
  e.call('pusatLeave', e.tok, 'claudia', 'claudia');
  e.ctx.runPusatBackupSoon();
  const at = d => { const o = outOf(e, 'claudia'); o.deleteOn = wib(d); e.props.OUT_claudia = JSON.stringify(o); };
  at(4); e.mails.length = 0; e.ctx.runPusatDaily();
  assert.ok(!e.mails.some(m => /Hapus akun Google coach claudia/.test(m.body)), 'H-4: not yet');
  for (const d of [3, 0, -2]) {
    at(d); e.mails.length = 0; e.ctx.runPusatDaily();
    const m = e.mails.find(x => /Hapus akun Google coach claudia/.test(x.body));
    assert.ok(m, 'reminder at H' + (d >= 0 ? '-' : '+') + Math.abs(d));
    assert.match(m.body, new RegExp(wib(d)));
    assert.match(m.body, /Akun sudah dihapus/);
  }
  const r = e.call('pusatAction', e.tok, 'leave-done', 'claudia');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.coaches.find(c => c.slug === 'claudia').out.done, wib());
  e.mails.length = 0; e.fetches.length = 0;
  e.ctx.runPusatDaily();
  assert.ok(!e.mails.some(m => /claudia/.test(m.body)), 'reminders stop');
  assert.ok(!e.fetches.some(f => f.url === EXEC(1)), 'deleted account is no longer contacted');
  assert.match(e.call('pusatAction', e.tok, 'leave-undo', 'claudia').error, /sudah ditandai dihapus/);
});

test('coach keluar: Aktifkan lagi sebelum H+30 = baca saja kembali ke langganan, tanda keluar hilang, hub aktifkan; setelah H+30 ditolak', () => {
  const { e, a } = outEnv();
  e.call('pusatLeave', e.tok, 'claudia', 'claudia');
  e.ctx.runPusatBackupSoon();
  const r = e.call('pusatAction', e.tok, 'leave-undo', 'claudia');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data.notice, undefined);
  assert.equal(outOf(e, 'claudia'), null);
  assert.deepEqual(a.st.ro.at(-1), [false, ''], 'free coach: read-only off, no leave flag');
  assert.deepEqual([a.st.on, a.st.left], [false, false]);
  assert.deepEqual(dispatches(e).at(-1), { aksi: 'aktifkan', slug: 'claudia' });
  assert.equal(r.data.coaches.find(c => c.slug === 'claudia').out, null);
  assert.match(e.call('pusatAction', e.tok, 'leave-undo', 'claudia').error, /tidak sedang keluar/);
  // Lewat H+30.
  e.call('pusatLeave', e.tok, 'claudia', 'claudia');
  const o = outOf(e, 'claudia'); o.deleteOn = wib(0); e.props.OUT_claudia = JSON.stringify(o);
  assert.match(e.call('pusatAction', e.tok, 'leave-undo', 'claudia').error, /Lewat 30 hari/);
  assert.equal(e.call('pusatOverview', e.tok).data.coaches.find(c => c.slug === 'claudia').out.canUndo, false);
});

test('coach keluar: tanpa token GitHub = langkah manual; backup akhir dilanjutkan sampai selesai; Excel gagal tidak menggagalkan; hub.json belum nonaktif masuk email', () => {
  const { e } = outEnv({ github: false, xlsxDown: true });
  const r = e.call('pusatLeave', e.tok, 'claudia', 'claudia').data;
  assert.match(r.hub, /Hub XNK → aksi nonaktif, slug claudia/);
  assert.equal(dispatches(e).length, 0);
  // Anggaran waktu 0 = satu potong per jalan: rantai trigger sekali jalan berlanjut sampai selesai.
  e.ctx.PUSAT_BK_BUDGET_MS = 0;
  let steps = 0, res;
  do { res = e.ctx.runPusatBackupSoon(); steps++; } while (res.running && steps < 20);
  assert.ok(steps > 2, 'took several runs');
  assert.equal(res.done, true);
  const o = outOf(e, 'claudia');
  assert.deepEqual([o.final.state, o.final.xlsxUrl], ['selesai', '']);
  assert.match(o.final.xlsxError, /Ekspor Excel ditolak/);
  assert.ok(e.mails.some(m => /backup akhir claudia siap/.test(m.subject) && /File → Download/.test(m.body)));
  // Sehari kemudian hub.json masih aktif = masalah di email harian.
  o.day = wib(-1); e.props.OUT_claudia = JSON.stringify(o);
  e.mails.length = 0;
  e.ctx.runPusatDaily();
  assert.ok(e.mails.some(m => /masih aktif di hub\.json/.test(m.body)));
});

test('coach keluar: ganti slug ikut memindahkan tanda keluar', () => {
  const { e } = outEnv();
  e.call('pusatLeave', e.tok, 'claudia', 'claudia');
  e.call('pusatRename', e.tok, 'claudia', 'claudia-fit');
  assert.equal(outOf(e, 'claudia'), null);
  assert.equal(outOf(e, 'claudia-fit').deleteOn, wib(30));
});

// ── T-2264: paket proposal, cara bayar, catat pembayaran, ringkasan uang ──
test('paket (T-2264): data lama {plan, price, history} tetap terbaca; paket ditebak dari harga', () => {
  const { e } = subEnv({ props: {
    SUB_claudia: JSON.stringify({ plan: 'bulanan', price: 249000, due: wib(10), history: [{ at: '2026-10-19T03:00:00.000Z', due: '2026-10-19', next: '2026-11-19', price: 249000 }] }),
    SUB_vinna: JSON.stringify({ plan: 'bulanan', price: 99000, due: wib(3) }),
  } });
  const r = e.call('pusatOverview', e.tok);
  const c = subOf(r, 'claudia'), v = subOf(r, 'vinna');
  assert.deepEqual([c.tier, c.tierName, c.cycle, c.plan, c.state], ['pro', 'Pro', 'bulanan', 'bulanan', 'aktif']);
  assert.deepEqual(c.pay.map(p => [p.kind, p.amount, p.date]), [['langganan', 249000, '2026-10-19']]);
  assert.equal(c.history[0].price, 249000, 'history view kept for old readers');
  assert.deepEqual([v.tier, v.state], ['lain', 'segera']);
});

test('paket (T-2264): harga bawaan dari proposal, tahunan +12 bulan, lifetime/beli putus tidak pernah baca saja karena tanggal', () => {
  const { e } = subEnv();
  let r = e.call('pusatSubSave', e.tok, 'claudia', { tier: 'pro', cycle: 'tahunan', due: wib(-1), setupKind: 'standar' });
  assert.equal(r.ok, true, r.error);
  let c = subOf(r, 'claudia');
  assert.deepEqual([c.price, c.plan, c.state, c.setup.kind, c.setup.price, c.setup.paidAt], [2490000, 'bulanan', 'tenggang', 'standar', 400000, '']);
  assert.deepEqual(r.data.money.setupUnpaid, ['claudia']);
  assert.equal(r.data.money.mrr, Math.round(2490000 / 12), 'yearly counts as price / 12 per month');
  r = e.call('pusatSubPay', e.tok, 'claudia', { kind: 'langganan' });
  assert.equal(r.ok, true, r.error);
  c = subOf(r, 'claudia');
  assert.equal(c.due, e.ctx.addMonths_(wib(-1), 12));
  assert.equal(c.state, 'aktif');
  assert.equal(c.pay.at(-1).amount, 2490000);
  r = e.call('pusatSubPay', e.tok, 'claudia', { kind: 'setup', amount: '400.000', date: wib(), note: 'transfer' });
  assert.equal(subOf(r, 'claudia').setup.paidAt, wib());
  assert.deepEqual(r.data.money.setupUnpaid, []);
  assert.equal(r.data.money.monthIn, 2490000 + 400000);
  assert.equal(r.data.money.payments[0].note, 'transfer');
  // lifetime: belum → lunas, tanpa jatuh tempo, tidak masuk MRR
  r = e.call('pusatSubSave', e.tok, 'vinna', { tier: 'starter', cycle: 'lifetime' });
  let v = subOf(r, 'vinna');
  assert.deepEqual([v.price, v.plan, v.state, v.due, v.readonly], [3900000, 'sekali', 'belum', '', false]);
  assert.match(e.call('pusatSubPay', e.tok, 'vinna', { kind: 'langganan' }).error, /bulanan atau tahunan/);
  assert.match(e.call('pusatSubPay', e.tok, 'vinna', { kind: 'putus' }).error, /bukan beli putus/);
  r = e.call('pusatSubPay', e.tok, 'vinna', { kind: 'lifetime' });
  assert.equal(subOf(r, 'vinna').state, 'lunas');
  assert.equal(r.data.money.mrr, Math.round(2490000 / 12));
  assert.deepEqual(r.data.money.upcoming.map(u => u.slug), ['claudia']);
  assert.equal(r.data.money.months.length, 6);
  assert.equal(r.data.money.months.at(-1).amount, 2490000 + 400000 + 3900000);
  assert.equal(e.ctx.addMonths_('2026-01-31', 13), '2027-02-28');
  assert.equal(e.ctx.addMonths_('2026-03-15', -3), '2025-12-15');
});

test('catat pembayaran (T-2264): hanya pemilik; jumlah, tanggal dan jenis diperiksa', () => {
  const { e } = subEnv();
  e.call('pusatSubSave', e.tok, 'claudia', { tier: 'starter', cycle: 'bulanan', due: wib(5) });
  assert.equal(e.call('pusatSubPay', 'palsu', 'claudia', { kind: 'langganan' }).ok, false);
  assert.match(e.call('pusatSubPay', e.tok, 'claudia', { kind: 'aneh' }).error, /Jenis/);
  assert.match(e.call('pusatSubPay', e.tok, 'claudia', { kind: 'langganan', amount: '0' }).error, /Jumlah/);
  assert.match(e.call('pusatSubPay', e.tok, 'claudia', { kind: 'langganan', date: wib(5) }).error, /Tanggal/);
  assert.match(e.call('pusatSubPay', e.tok, 'claudia', { kind: 'setup' }).error, /setup/);
  assert.match(e.call('pusatSubSave', e.tok, 'claudia', { tier: 'emas' }).error, /Pilih paket/);
  const r = e.call('pusatAction', e.tok, 'sub-paid', 'claudia');
  assert.equal(subOf(r, 'claudia').pay.at(-1).amount, 149000, 'sub-paid = catat pembayaran langganan sebesar harga');
});

// ── Pembangun Push XNK (2026-11-25): jam Google menjalankan workflow Push XNK tiap 10 menit, 05:00–22:59 WIB ──
function atWib(e, hour, fn) {
  const D = vm.runInContext('Date', e.ctx), real = D.now;
  const base = Date.UTC(2026, 10, 25, hour - 7, 30);
  D.now = () => base;
  try { return JSON.parse(JSON.stringify(fn())); } finally { D.now = real; }
}
const kicks = e => e.fetches.filter(f => f.url.endsWith('/actions/workflows/push.yml/dispatches'));

test('pembangun push: tanpa coach menyala, di luar jam, atau tanpa token tidak menjalankan apa-apa', () => {
  const { e } = pushEnv();
  e.props.GITHUB_TOKEN = 'github_pat_x';
  assert.deepEqual(atWib(e, 19, () => e.ctx.runPusatPushKick()), { skipped: 'mati' }, 'push belum menyala di coach mana pun');
  e.call('pusatAction', e.tok, 'push-on', 'claudia');
  assert.deepEqual(atWib(e, 4, () => e.ctx.runPusatPushKick()), { skipped: 'jam' }, '04:30 WIB');
  assert.deepEqual(atWib(e, 23, () => e.ctx.runPusatPushKick()), { skipped: 'jam' }, '23:30 WIB');
  delete e.props.GITHUB_TOKEN;
  assert.deepEqual(atWib(e, 19, () => e.ctx.runPusatPushKick()), { skipped: 'token' });
  assert.equal(kicks(e).length, 0);
});

test('pembangun push: coach menyala jam 05–22 WIB → satu workflow_dispatch Push XNK aksi kirim; coach keluar tidak dihitung', () => {
  const { e } = pushEnv();
  e.props.GITHUB_TOKEN = 'github_pat_x';
  e.call('pusatAction', e.tok, 'push-on', 'claudia');
  assert.deepEqual(atWib(e, 5, () => e.ctx.runPusatPushKick()), { started: true, code: 204 });
  assert.deepEqual(atWib(e, 22, () => e.ctx.runPusatPushKick()), { started: true, code: 204 });
  const k = kicks(e);
  assert.equal(k.length, 2);
  assert.equal(k[0].url, 'https://api.github.com/repos/xnkzzxd/xnk-template-site/actions/workflows/push.yml/dispatches');
  assert.deepEqual(JSON.parse(k[0].o.payload), { ref: 'main', inputs: { aksi: 'kirim' } });
  assert.equal(k[0].o.headers.Authorization, 'Bearer github_pat_x');
  assert.equal(e.props.PUSHKICK_LAST, undefined);
  e.props.OUT_claudia = JSON.stringify({ at: 'x' });
  assert.deepEqual(atWib(e, 19, () => e.ctx.runPusatPushKick()), { skipped: 'mati' }, 'coach keluar tidak membangunkan push');
});

test('pembangun push: GitHub menolak → tidak melempar, dicatat di PUSHKICK_LAST', () => {
  const { e } = pushEnv({ dispatch: 403 });
  e.props.GITHUB_TOKEN = 'github_pat_x';
  e.call('pusatAction', e.tok, 'push-on', 'claudia');
  assert.deepEqual(atWib(e, 19, () => e.ctx.runPusatPushKick()), { started: false, code: 403 });
  assert.equal(JSON.parse(e.props.PUSHKICK_LAST).code, 403);
});
