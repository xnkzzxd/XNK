'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { sane, parseRows } = require('../tools/build-foods.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../foods/foods.min.json'), 'utf8'));
const byId = {};
data.items.forEach(function (i) { byId[i.id] = i; });

// Values copied by hand from the TKPI 2017 PDF (per 100 g): [kal, protein, lemak, karbo]
const SPOT = {
  AR001: ['Beras giling, mentah', 357, 8.4, 1.7, 77.1],
  AR004: null,
  AR015: ['Jagung mentah muda, kuning', 147, 5.1, 0.7, 31.5],
  AR016: ['Jagung kering, mentah kuning pipil', 366, 9.8, 7.3, 69.1],
  AR011: ['Beras parboiled', 353, 6.8, 0.6, 80.0],
  AR012: ['Beras tumbuk, mentah', 354, 7.8, 0.4, 79.9],
  AR010: ['Beras menir, mentah', 362, 7.7, 4.4, 73.0],
};

test('spot rows match the PDF', function () {
  Object.keys(SPOT).forEach(function (id) {
    const want = SPOT[id];
    if (!want) return;
    const got = byId[id];
    assert.ok(got, id + ' missing');
    assert.strictEqual(got.kal, want[1], id + ' kal');
    assert.strictEqual(got.p, want[2], id + ' protein');
    assert.strictEqual(got.l, want[3], id + ' lemak');
    assert.strictEqual(got.k, want[4], id + ' karbo');
  });
});

test('every kept row passes the energy sanity check', function () {
  assert.ok(data.items.length > 900);
  data.items.forEach(function (i) {
    assert.ok(sane({ kal: i.kal, protein: i.p, lemak: i.l, karbo: i.k, serat: i.s, air: 50 }), i.id + ' ' + i.n);
  });
});

test('parser drops rows with shifted columns', function () {
  const rows = parseRows('AR999 Contoh KZGPI- 1990 10.0 300 5.0 1.0 60.0 900 1.0 10 10 1 1 ');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(sane(rows[0]), false);
});
