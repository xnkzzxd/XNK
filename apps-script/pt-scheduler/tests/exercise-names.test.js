'use strict';
// Fase U (T-1601): nama gerakan ala Hevy untuk pustaka.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { displayName, applyNames } = require('../tools/exercise-names');

const FILE = path.join(__dirname, '..', '..', '..', 'exercises', 'exercises.min.json');

test('pattern: movement first, equipment in brackets, no equipment for body weight', () => {
  assert.equal(displayName({ id: 'x1', r: 'dumbbell lateral raise', q: 'dumbbell' }), 'Lateral Raise (Dumbbell)');
  assert.equal(displayName({ id: 'x2', r: 'lever seated hip abduction', q: 'leverage machine' }), 'Seated Hip Abduction (Machine)');
  assert.equal(displayName({ id: 'x3', r: 'barbell bent over row', q: 'barbell' }), 'Bent Over Row (Barbell)');
  assert.equal(displayName({ id: 'x4', r: 'pull-up', q: 'body weight' }), 'Pull Up');
});

test('fixes broken degree sign, drops camera/model notes, brackets become " - "', () => {
  assert.equal(displayName({ id: 'x5', r: 'sled 45в° calf press', q: 'sled machine' }), 'Calf Press (45°)');
  assert.equal(displayName({ id: 'x6', r: 'arms apart circular toe touch (male)', q: 'body weight' }), 'Arms Apart Circular Toe Touch');
  assert.equal(displayName({ id: 'x7', r: 'cable curl (with rope)', q: 'cable' }), 'Curl - Rope (Cable)');
  assert.equal(displayName({ id: 'x8', r: 'weighted crunch (on stability ball)', q: 'weighted' }), 'Crunch - Stability Ball (Weighted)');
});

test('T-1634: typos fixed, tail notes become " - note", body positions keep "On"', () => {
  assert.equal(displayName({ id: 'y1', r: 'barbell revers wrist curl v. 2', q: 'barbell' }), 'Reverse Wrist Curl 2 (Barbell)');
  assert.equal(displayName({ id: 'y2', r: 'dumbbell kickbacks on exercise ball', q: 'dumbbell' }), 'Kickback - Stability Ball (Dumbbell)');
  assert.equal(displayName({ id: 'y3', r: 'cable pushdown (with rope attachment)', q: 'cable' }), 'Pushdown - Rope (Cable)');
  assert.equal(displayName({ id: 'y4', r: 'crunch floor', q: 'body weight' }), 'Floor Crunch');
  assert.equal(displayName({ id: 'y5', r: 'close-grip push-up (on knees)', q: 'body weight' }), 'Close-Grip Push Up - On Knees');
  assert.equal(displayName({ id: 'y6', r: 'dumbbell tricep kickback with stork stance', q: 'dumbbell' }), 'Triceps Kickback - Stork Stance (Dumbbell)');
  assert.equal(displayName({ id: '0031', r: 'barbell curl', q: 'barbell' }), 'Bicep Curl (Barbell)');
});

test('overrides win for the gym list', () => {
  assert.equal(displayName({ id: '0861', r: 'cable seated row', q: 'cable' }), 'Seated Cable Row');
  assert.equal(displayName({ id: '2330', r: 'cable lat pulldown full range of motion', q: 'cable' }), 'Lat Pulldown (Cable)');
  assert.equal(displayName({ id: '0739', r: 'sled 45в° leg press', q: 'sled machine' }), 'Leg Press (45°)');
  assert.equal(displayName({ id: '0596', r: 'lever seated fly', q: 'leverage machine' }), 'Chest Fly (Machine)');
  assert.equal(displayName({ id: '0585', r: 'lever leg extension', q: 'leverage machine' }), 'Leg Extension (Machine)');
  assert.equal(displayName({ id: '0493', r: 'incline push-up', q: 'body weight' }), 'Incline Push Up');
});

test('applyNames: keeps raw name in r, idempotent, numbers duplicates', () => {
  const once = applyNames([{ id: '1', n: 'lever chest press', q: 'leverage machine' }, { id: '2', n: 'lever chest press', q: 'leverage machine' }]);
  assert.deepEqual(once.map(x => x.n), ['Chest Press (Machine)', 'Chest Press 2 (Machine)']);
  assert.equal(once[0].r, 'lever chest press');
  assert.deepEqual(applyNames(once).map(x => x.n), once.map(x => x.n));
});

test('shipped library: v2, every item named, unique names, raw kept, ≤ 80 chars, no mojibake', () => {
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(d.v, 2);
  assert.equal(new Set(d.items.map(x => x.n.toLowerCase())).size, d.items.length);
  d.items.forEach(x => {
    assert.ok(x.r && x.n && x.n.length <= 80, x.id);
    assert.ok(!/в/.test(x.n), x.id);
    assert.equal(x.n.charAt(0), x.n.charAt(0).toUpperCase(), x.id);
  });
  assert.deepEqual(applyNames(d.items).map(x => x.n), d.items.map(x => x.n), 'file is up to date: run node tools/exercise-names.js');
});
