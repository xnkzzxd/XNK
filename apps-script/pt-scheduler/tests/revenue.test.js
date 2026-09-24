'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const LOG_HEADERS = ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'];

test('revenue sums Price List prices of package transactions in that month', () => {
  const env = seededEnv();
  env.ss.seed('Members', [
    LOG_HEADERS,
    ['T1', 'PT-A', '3/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', ''],
    ['T2', 'PT-B', '20/9/2026', 'Perpanjang', 'P2', 'Flex', 1, '', '', ''],
    ['T3', 'PT-C', '28/9/2026', 'Baru', 'P3', 'Lama', 4, '', '', ''],        // inactive package still has a price
    ['T4', 'PT-A', '2/8/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', ''],     // other month
    ['T5', 'PT-B', '5/9/2026', 'Baru', '', 'regular 8', 8, '', '', ''],      // matched by name
  ]);
  const res = env.call('getRevenueSummary', env.adminToken(), 9, 2026);
  assert.equal(res.count, 4);
  assert.equal(res.total, 800000 + 1500000 + 100000 + 800000);
  assert.equal(res.byPackage[0].namaPaket, 'Flex');
});

test('revenue is admin-only', () => {
  const env = seededEnv();
  assert.throws(() => env.call('getRevenueSummary', 'nope', 9, 2026), /AUTH_REQUIRED/);
});

test('the page title is XNK Personal Training', () => {
  const env = seededEnv();
  let title = null;
  const orig = env.context.HtmlService.createTemplateFromFile;
  env.context.HtmlService.createTemplateFromFile = name => {
    const t = orig(name);
    return { evaluate: () => { const out = t.evaluate(); const set = out.setTitle; out.setTitle = v => { title = v; return set(v); }; return out; } };
  };
  env.context.doGet({ parameter: { view: 'public' } });
  assert.equal(title, 'XNK Personal Training');
});
