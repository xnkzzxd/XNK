'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { sane, microOk, parseRows } = require('../tools/build-foods.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../foods/foods.min.json'), 'utf8'));
const byId = {};
data.items.forEach(function (i) { byId[i.id] = i; });

// Values copied by hand from the TKPI 2020 PDF (per 100 g): id → [kal, protein, lemak, karbo]
const SPOT = {
  AP001: [180, 3, 0.3, 39.8],     // Nasi
  AP005: [149, 2.8, 0.4, 32.5],   // Nasi beras merah
  CP077: [201, 20.8, 8.8, 13.5],  // Tempe mentah
  CP061: [80, 10.9, 4.7, 0.8],    // Tahu mentah
  HR002: [154, 12.4, 10.8, 0.7],  // Telur ayam ras
  GR007: [123, 20, 4.8, 0],       // Ikan bandeng
  JR006: [61, 3.2, 3.5, 4.3],     // Susu sapi segar
  DR100: [28, 3.4, 0.7, 3.9],     // Kangkung
  ER074: [108, 1, 0.8, 24.3],     // Pisang ambon
  ER001: [85, 0.9, 6.5, 7.7],     // Alpukat
  KP002: [742, 0.5, 81.6, 1.4],   // Mentega
  MP007: [394, 0, 0, 94],         // Gula putih
  ER031: [64, 0.9, 0.3, 12.2],    // Jambu biji (berubah dari 49 kkal di TKPI 2017)
};

test('spot rows match the PDF', function () {
  Object.keys(SPOT).forEach(function (id) {
    const want = SPOT[id], got = byId[id];
    assert.ok(got, id + ' missing');
    assert.strictEqual(got.kal, want[0], id + ' kal');
    assert.strictEqual(got.p, want[1], id + ' protein');
    assert.strictEqual(got.l, want[2], id + ' lemak');
    assert.strictEqual(got.k, want[3], id + ' karbo');
  });
});

test('curated list has 150-300 items with portions, price and allergen tags', function () {
  assert.ok(data.items.length >= 150 && data.items.length <= 300, String(data.items.length));
  const ids = new Set();
  data.items.forEach(function (i) {
    assert.ok(!ids.has(i.id), 'duplicate ' + i.id); ids.add(i.id);
    assert.ok(i.n && i.g, i.id);
    assert.ok(Array.isArray(i.por) && i.por.length && i.por.every(function (p) { return p[0] && p[1] > 0; }), i.id + ' portions');
    assert.ok([1, 2, 3].indexOf(i.h) !== -1, i.id + ' price');
    assert.ok(Array.isArray(i.a), i.id + ' allergens');
    assert.strictEqual(typeof i.lak, 'boolean');
  });
});

test('every item passes the energy check; micronutrients are null or in range', function () {
  data.items.forEach(function (i) {
    assert.ok(sane({ kal: i.kal, protein: i.p, lemak: i.l, karbo: i.k, serat: 0, air: 50 }), i.id + ' ' + i.n + ' energy');
    if (i.fe != null) assert.ok(microOk({ fe: i.fe, ca: i.ca, na: i.na, s: i.s, k: i.k }), i.id + ' micro');
  });
});

test('estimates are flagged and not TKPI; TKPI items are not', function () {
  const est = data.items.filter(function (i) { return i.e; });
  assert.ok(est.length >= 40 && est.length <= 60);
  est.forEach(function (i) { assert.ok(/^E\d+$/.test(i.id), i.id); assert.strictEqual(i.fe, null); });
  data.items.filter(function (i) { return !i.e; }).forEach(function (i) { assert.ok(/^[A-Z]{2}\d{3}$/.test(i.id), i.id); });
});

test('allergen and lactose tags', function () {
  assert.ok(byId.HR002.a.includes('telur'));
  assert.ok(byId.GR007.a.includes('seafood'));
  assert.ok(byId.CP011.a.includes('kacang'));
  assert.ok(byId.JR006.a.includes('susu') && byId.JR006.lak === true);
  assert.deepStrictEqual(byId.AP001.a, []);
  assert.strictEqual(byId.AP001.lak, false);
  // nobody gets pork: the list has none
  assert.ok(!data.items.some(function (i) { return /babi|pork|ham\b|bacon/i.test(i.n); }));
});

test('parser drops rows with shifted columns', function () {
  const rows = parseRows('AR999 Contoh KZGPI- 1990 10.0 300 5.0 1.0 60.0 900 1.0 10 10 1 1 ');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(sane(rows[0]), false);
});
