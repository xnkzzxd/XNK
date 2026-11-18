'use strict';
// T-2233: hubStatus — laporan angka untuk XNK Pusat, dijaga HUB_SECRET; tanpa rahasia (produksi) selalu menolak.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const SECRET = 'h'.repeat(40);

test('hubStatus: tanpa HUB_SECRET atau rahasia salah = "Permintaan tidak valid."', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubStatus', ''), /Permintaan tidak valid/);
  assert.throws(() => env.call('hubStatus', SECRET), /Permintaan tidak valid/, 'produksi tanpa HUB_SECRET');
  env.props.HUB_SECRET = 'pendek';
  assert.throws(() => env.call('hubStatus', 'pendek'), /Permintaan tidak valid/, 'rahasia < 32 huruf tidak pernah berlaku');
  env.props.HUB_SECRET = SECRET;
  assert.throws(() => env.call('hubStatus', 'x'.repeat(40)), /Permintaan tidak valid/);
  assert.throws(() => env.call('hubStatus', SECRET + 'x'), /Permintaan tidak valid/);
});

test('hubStatus: angka saja (klien, sesi, trigger, pengingat), tanpa nama atau nomor klien', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.props.RMD_ENABLED = 'true';
  const r = env.call('hubStatus', SECRET);
  assert.deepEqual(Object.keys(r).sort(), ['api', 'at', 'clients', 'lib', 'reminders', 'sessions', 'triggers']);
  assert.ok(r.lib === null || (/^[0-9a-f]{12}$/.test(r.lib.hash) && typeof r.lib.commit === 'string'), 'produksi: null; Library: sidik build');
  assert.equal(r.reminders.enabled, true);
  for (const k of ['total', 'active30d']) assert.equal(typeof r.clients[k], 'number', k);
  for (const k of ['done7d', 'next7d']) assert.equal(typeof r.sessions[k], 'number', k);
  assert.ok(r.clients.total > 0);
  const text = JSON.stringify(r);
  assert.ok(!/08\d{6,}|62\d{8,}/.test(text), 'tidak ada nomor WA');
  assert.ok(!/[A-Z][a-z]+ [A-Z][a-z]+/.test(text.replace(/"at":"[^"]+"/, '')), 'tidak ada nama');
  // Lewat doPost (pintu halaman statis / XNK Pusat).
  const post = JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn: 'hubStatus', args: [SECRET] }) } }).content);
  assert.equal(post.ok, true);
  assert.equal(JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn: 'hubStatus', args: ['salah'] }) } }).content).ok, false);
});

// T-2250: hubExport — salinan penuh untuk backup mingguan XNK Pusat, dijaga HUB_SECRET yang sama.
const post = (env, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn: 'hubExport', args }) } }).content);

test('hubExport: tanpa HUB_SECRET atau rahasia salah = ditolak', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubExport', SECRET), /Permintaan tidak valid/, 'produksi tanpa HUB_SECRET');
  env.props.HUB_SECRET = SECRET;
  assert.throws(() => env.call('hubExport', 'x'.repeat(40)), /Permintaan tidak valid/);
  assert.throws(() => env.call('hubExport', 'x'.repeat(40), { sheet: 'MemberData', from: 1 }), /Permintaan tidak valid/);
  assert.equal(post(env, ['salah']).ok, false);
});

test('hubExport: daftar sheet {name, rows, cols}; tanpa Script Properties', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.props.ADMIN_PIN_HASH = 'rahasia-pin-hash-xyz';
  const r = env.call('hubExport', SECRET);
  assert.deepEqual(Object.keys(r).sort(), ['at', 'sheets']);
  const names = r.sheets.map(s => s.name);
  assert.deepEqual(names, env.ss.getSheets().map(s => s.getName()));
  assert.ok(names.includes('MemberData'));
  const md = r.sheets.find(s => s.name === 'MemberData');
  assert.equal(md.rows, env.ss.getSheetByName('MemberData').getLastRow());
  assert.equal(md.cols, env.ss.getSheetByName('MemberData').getLastColumn());
  const text = JSON.stringify(r) + JSON.stringify(env.call('hubExport', SECRET, { sheet: 'MemberData', from: 1 }));
  assert.ok(!text.includes(SECRET) && !text.includes('rahasia-pin-hash-xyz'), 'Script Properties tidak pernah ikut');
});

test('hubExport: baris sebagai teks (Date jadi teks), maks 2000 baris, lalu next = 0', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  const rows = [['Tanggal', 'Angka', 'Ya']];
  for (let i = 1; i < 2500; i++) rows.push([new Date(2026, 0, 1 + (i % 28), 9, 30), i, i % 2 === 0]);
  env.ss.seed('Besar', rows);
  const a = env.call('hubExport', SECRET, { sheet: 'Besar', from: 1 });
  assert.equal(a.rows.length, 2000);
  assert.equal(a.next, 2001);
  assert.equal(a.cols, 3);
  assert.deepEqual(a.rows[0], ['Tanggal', 'Angka', 'Ya']);
  assert.ok(a.rows.every(r => r.every(v => typeof v === 'string')), 'semua teks');
  assert.equal(a.rows[2][0], '2026-01-03 09:30:00');
  assert.deepEqual(a.rows[2].slice(1), ['2', 'TRUE']);
  const b = env.call('hubExport', SECRET, { sheet: 'Besar', from: a.next });
  assert.equal(b.rows.length, 500);
  assert.equal(b.next, 0);
  assert.equal(b.rows[499][1], '2499');
  assert.deepEqual(env.call('hubExport', SECRET, { sheet: 'Besar', from: 9999 }), { rows: [], cols: 3, next: 0 });
  // Lewat doPost: JSON polos.
  const p = post(env, [SECRET, { sheet: 'Besar', from: 2001 }]);
  assert.equal(p.ok, true);
  assert.equal(p.data.rows.length, 500);
});

test('hubExport: batas ukuran ±4 MB per panggilan (minimal satu baris); sheet/baris salah ditolak', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  const big = 'x'.repeat(1500000);
  env.ss.seed('Gemuk', [['a'], [big], [big], [big]]);
  const a = env.call('hubExport', SECRET, { sheet: 'Gemuk', from: 2 });
  assert.equal(a.rows.length, 2);
  assert.equal(a.next, 4);
  const b = env.call('hubExport', SECRET, { sheet: 'Gemuk', from: 4 });
  assert.equal(b.rows.length, 1);
  assert.equal(b.next, 0);
  env.ss.seed('Raksasa', [['y'.repeat(5000000)], ['z']]);
  assert.equal(env.call('hubExport', SECRET, { sheet: 'Raksasa', from: 1 }).rows.length, 1, 'satu baris besar tetap terkirim');
  assert.throws(() => env.call('hubExport', SECRET, { sheet: 'TidakAda', from: 1 }), /Sheet tidak ditemukan/);
  for (const from of [0, -1, 1.5, 'abc']) assert.throws(() => env.call('hubExport', SECRET, { sheet: 'Gemuk', from }), /Permintaan tidak valid/, String(from));
  assert.throws(() => env.call('hubExport', SECRET, { sheet: 5, from: 1 }), /Permintaan tidak valid/);
});
