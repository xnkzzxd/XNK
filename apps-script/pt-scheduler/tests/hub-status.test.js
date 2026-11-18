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
  assert.deepEqual(Object.keys(r).sort(), ['api', 'at', 'clients', 'lib', 'quota', 'reminders', 'sessions', 'triggers']);
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
