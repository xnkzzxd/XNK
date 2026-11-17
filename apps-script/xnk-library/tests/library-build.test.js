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
