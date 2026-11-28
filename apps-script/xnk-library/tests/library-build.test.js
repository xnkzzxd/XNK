'use strict';
// Hasil build Library: bersih dari layanan bersama dan identitas XNK, tanpa landing pemilik, dan produksi tidak berubah.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const lib = require('../tools/build-lib');

const SRC = path.join(__dirname, '..', '..', 'pt-scheduler', 'src');

test('kode Library tidak memakai Properties/Cache/Lock/ScriptApp milik Library', () => {
  const { files } = lib.build();
  for (const [f, t] of Object.entries(files)) {
    if (!f.endsWith('.gs') || f === 'Konteks.gs' || f === 'LibApi.gs') continue;
    const code = t.split('\n').filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).map(l => l.replace(/\/\/.*$/, '')).join('\n');
    for (const re of [/\bPropertiesService\b/, /\bCacheService\b/, /\bLockService\b/, /\bScriptApp\b/, /getActiveSpreadsheet/]) {
      assert.ok(!re.test(code), `${f}: ${re}`);
    }
  }
  assert.ok(/_props_\(\)/.test(files['Kode.gs']));
});

test('identitas XNK diganti pengaturan per spreadsheet; landing pemilik tidak ikut', () => {
  const { files } = lib.build();
  for (const f of lib.DROP_FILES) assert.equal(files[f], undefined, f);
  const gs = Object.entries(files).filter(([f]) => f.endsWith('.gs')).map(([, t]) => t).join('\n');
  assert.ok(!/book\.xnkbooking\.my\.id|'https:\/\/xnkbooking\.my\.id'|1tyEjraoYNXV8nEMNylT9xSUUpLiLHw7bpcWfiQ3J6Uo/.test(gs));
  assert.equal(JSON.parse(files['appsscript.json']).webapp, undefined);
  assert.match(files['LibVersi.gs'], /var LIB_BUILD = \{"hash":"[0-9a-f]{12}"/);
});

test('halaman (HTML) Library tidak lagi mengirim klien coach lain ke portal XNK', () => {
  const { files } = lib.build();
  // Yang sengaja tetap: daftar origin pembungkus lama, pustaka statis (gerakan, makanan, peta otot) dari xnk.my.id,
  // dan domain di UID kalender (tidak terlihat). Komentar diabaikan.
  const KEEP = /HOST_ORIGINS|EX_URL|FIG_URL|RIG_URL|FOOD_URL|@xnk\.my\.id/;
  const bad = [];
  for (const [f, t] of Object.entries(files)) {
    if (!f.endsWith('.html')) continue;
    t.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || KEEP.test(line)) return;
      if (/xnkbooking\.my\.id|xnk\.my\.id/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('setiap berkas .gs Library bisa diurai, nama berkas unik, dan build stabil', () => {
  const a = lib.build(), b = lib.build();
  assert.equal(a.hash, b.hash);
  for (const [f, t] of Object.entries(a.files)) if (f.endsWith('.gs')) new vm.Script(t, { filename: f });
  const bases = Object.keys(a.files).filter(f => f !== 'appsscript.json').map(f => f.replace(/\.(gs|html)$/, ''));
  assert.equal(new Set(bases).size, bases.length);
});

test('build tidak mengubah kode produksi', () => {
  const before = fs.readdirSync(SRC).map(f => f + ':' + fs.statSync(path.join(SRC, f)).mtimeMs).join('|');
  lib.build();
  const after = fs.readdirSync(SRC).map(f => f + ':' + fs.statSync(path.join(SRC, f)).mtimeMs).join('|');
  assert.equal(after, before);
});

test('checkout Windows (akhiran CRLF) menghasilkan Library yang sama persis', () => {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xnk-crlf-'));
  const APPS = path.join(__dirname, '..', '..');
  const copy = (rel, crlf) => {
    const from = path.join(APPS, rel), to = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.statSync(from).isDirectory()) { for (const f of fs.readdirSync(from)) copy(path.join(rel, f), crlf); return; }
    const t = fs.readFileSync(from, 'utf8');
    fs.writeFileSync(to, crlf && /\.(gs|html|json)$/.test(from) ? t.replace(/\r?\n/g, '\r\n') : t);
  };
  try {
    copy('pt-scheduler/src', true);
    copy('pt-scheduler/tests/api-lists.js', false);
    copy('xnk-library/lib-extra', true);
    copy('xnk-library/tools/build-lib.js', false);
    const winLib = require(path.join(tmp, 'xnk-library', 'tools', 'build-lib.js'));
    assert.equal(winLib.build().hash, lib.build().hash);
    assert.equal(lib.lf('a\r\nb\rc\n'), 'a\nb\nc\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('tidak ada teks "XNK" yang tampil ke coach atau klien di kode Library (nama usaha dipakai)', () => {
  const { files } = lib.build();
  const own = new Set(fs.readdirSync(path.join(__dirname, '..', 'lib-extra')).concat(['LibTabel.gs', 'LibVersi.gs']));
  // Sengaja tetap: pengenal teknis, PRODID kalender, nama folder Drive di akun coach sendiri.
  const KEEP = /PRODID:-\/\/XNK\/\/|createFolder\('XNK |XNK_[A-Z]|XNKOffline|XNKHostLocal|XNKAndroid|XNKiOS|xnk_|^\s*XNK Personal Training —|<title>XNK Personal Training<\/title>|>XNK<\/a>|poweredBy: '(Powered by|Didukung) XNK'/;
  const bad = [];
  for (const [f, t] of Object.entries(files)) {
    if (own.has(f) || !/\.(gs|html)$/.test(f)) continue;
    t.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*|<!--)/.test(line)) return;
      const code = line.replace(KEEP, '');
      if (/\bXNK\b/.test(code)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(bad, [], 'tambahkan TEXT_SWAPS di build-lib.js (browser: window.brandName(), server: _brandName_())');
});

test('tanda "Didukung XNK" hanya di Library: layar masuk panel + portal dan kartu bagikan (T-2257)', () => {
  const { files } = lib.build();
  assert.match(files['Index.html'], /class="hint xnk-by"[^\n]*Didukung <a href="https:\/\/xnk\.web\.id\/\?hub"/);
  assert.match(files['App.html'], /class="hint xnk-by"[^\n]*Didukung <a href="https:\/\/xnk\.web\.id\/\?hub"/);
  assert.match(files['Bagikan.html'], /Tx\(ctx, T\.poweredBy, W - 72, R\.H - 30/);
  // Produksi (xnk.my.id) tidak berubah.
  for (const f of ['Index.html', 'App.html', 'Bagikan.html']) assert.ok(!/xnk-by|poweredBy/.test(fs.readFileSync(path.join(SRC, f), 'utf8')), f);
});

test('Google Analytics milik xnk.my.id tidak ikut ke Library (T-2223)', () => {
  const { files } = require('../tools/build-lib').build();
  for (const [f, t] of Object.entries(files)) assert.ok(!/G-93SRTYH3SG|googletagmanager\.com/.test(t), f);
});

test('nomor WA pemilik XNK tidak ikut ke Library: tombol WA klien memakai No WA profil coach', () => {
  const { files } = require('../tools/build-lib').build();
  for (const [f, t] of Object.entries(files)) assert.ok(!/6288221254305/.test(t), f + ' masih memuat nomor WA pemilik');
  assert.match(files['App.html'], /const COACH_WA_NUMBER = '';/);
});

test('poster coach (Fase AG): merek coach + tanda kecil di Library, poster XNK Coach hanya di produksi', () => {
  const { files } = lib.build();
  assert.match(files['PosterData.gs'], /^const POSTER_XNK = null;$/m);
  assert.match(files['App.html'], /const poBrand = function \(\) \{ return window\.brandName\(\); \};/);
  assert.match(files['Bagikan.html'], /mark: function \(\) \{ return L\.id\.poweredBy; \}/);
  const prod = fs.readFileSync(path.join(SRC, 'PosterData.gs'), 'utf8');
  assert.match(prod, /^const POSTER_XNK = \{ title: 'XNK Coach'/m);
});
