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
      newTrigger: h => { const b = { timeBased: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b, create: () => triggers.push(h) }; return b; },
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        o = o || {};
        fetches.push({ url, o });
        if (url.includes('/matching-refs/tags/lib-v')) return reply(200, [{ ref: 'refs/tags/lib-v3', object: { type: 'tag', sha: 't3' } }, { ref: 'refs/tags/lib-v11', object: { type: 'tag', sha: 't11' } }]);
        if (url.endsWith('/git/tags/t11')) return reply(200, { object: { sha: SHA_NEW } });
        if (url.includes('/dispatches')) return reply(opts.dispatch || 204, '');
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
  return { ctx, props, mails, fetches, triggers, call };
}

const status = (commit, extra) => Object.assign({ at: 'x', lib: { hash: 'h', commit }, api: 1, triggers: { runReminderTick: 1 }, reminders: { enabled: false, lastTickAt: '' }, clients: { total: 12, active30d: 7 }, sessions: { done7d: 9, next7d: 5 } }, extra || {});
const server = (secret, data) => req => (req.fn === 'hubStatus' && req.args[0] === secret ? { ok: true, data } : { ok: false, error: 'Permintaan tidak valid.' });

test('setupPusat: kunci sesi dan satu trigger harian; diulang tetap satu', () => {
  const e = env();
  e.ctx.setupPusat();
  assert.ok(e.props.SESSION_SECRET.length >= 32);
  assert.deepEqual(e.triggers, ['runPusatDaily']);
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
