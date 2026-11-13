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
    if (i.id === 'NR0077') { assert.ok(i.kal === 0 && i.na > 30000, 'garam'); return; }   // garam: tanpa energi
    assert.ok(sane({ kal: i.kal, protein: i.p, lemak: i.l, karbo: i.k, serat: 0, air: 50 }), i.id + ' ' + i.n + ' energy');
    if (i.fe != null) assert.ok(microOk({ fe: i.fe, ca: i.ca, na: i.na, s: i.s, k: i.k }), i.id + ' micro');
  });
});

test('estimates are flagged and not TKPI; TKPI items are not', function () {
  const est = data.items.filter(function (i) { return i.e; });
  assert.ok(est.length >= 40 && est.length <= 60);
  est.forEach(function (i) { assert.ok(/^E\d+$/.test(i.id), i.id); assert.strictEqual(i.fe, null); });
  data.items.filter(function (i) { return !i.e && !i.pk && !i.r; }).forEach(function (i) { assert.ok(/^[A-Z]{2}\d{3}$/.test(i.id), i.id); });
  data.items.filter(function (i) { return i.pk; }).forEach(function (i) { assert.ok(/^[A-Z]{2}\d{4}$/.test(i.id), i.id); assert.ok(i.src, i.id); });
  data.items.filter(function (i) { return i.r; }).forEach(function (i) { assert.ok(/^R\d{2}$/.test(i.id), i.id); assert.ok(i.b.length >= 2, i.id); });
});

test('recipes are the sum of their ingredients (TKPI 2020 or panganku), per 100 g of the cooked portion', function () {
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '../tools/foods-curated.json'), 'utf8'));
  const ruj = {};
  list.rujukan.forEach(function (r) { ruj[r[0]] = r[6]; });
  // Bahan dari panganku dihitung ulang di sini; bahan TKPI cukup dicek lewat contoh R14 (tempe 50 g + kecap 5 g + minyak 2 g = 55 g).
  const r14 = byId.R14;
  const kal = (201 * 50 + 71 * 5 + 884 * 2) / 100;
  assert.strictEqual(r14.kal, Math.round(kal / 55 * 100));
  assert.strictEqual(r14.p, Math.round((20.8 * 50 + 5.7 * 5) / 100 / 55 * 1000) / 10);
  const r03 = byId.R03, a = ruj.FP0120, b = ruj.NP0177;   // dada bakar 80 g + sambal hijau 20 g = 100 g
  assert.strictEqual(r03.kal, Math.round((a[0] * 80 + b[0] * 20) / 100));
  assert.strictEqual(r03.na, Math.round((a[5] * 80 + b[5] * 20) / 100));
  list.resep.forEach(function (r) { assert.ok(byId[r[0]] && byId[r[0]].r, r[0]); });
});

test('shifted TKPI cells are corrected and tags are known', function () {
  assert.strictEqual(byId.HP001.na, null);            // telur dadar: natrium kosong di TKPI 2020 (bukan 36 dari kolom retinol)
  assert.strictEqual(byId.CP011.na, null);
  assert.ok(!byId.E50 && !byId.E37, 'estimates replaced by panganku rows');
  assert.strictEqual(byId.CP0211.kal, 101);           // tahu bacem panganku
  data.items.forEach(function (i) { (i.t || []).forEach(function (t) { assert.ok(['santan', 'goreng', 'manis', 'asin'].includes(t), i.id + ' ' + t); }); });
  assert.ok(byId.FP0456.t.includes('santan') && byId.R01.t.includes('goreng'));
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
