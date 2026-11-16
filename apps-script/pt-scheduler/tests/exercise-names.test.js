'use strict';
// Fase U (T-1601): nama gerakan ala Hevy untuk pustaka.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { displayName, applyNames, DUPES } = require('../tools/exercise-names');

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

test('common lifts have a plain name; a mismatched dataset GIF is replaced', () => {
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8')), shown = d.items.filter(x => !x.h), names = new Set(shown.map(x => x.n));
  ['Lat Pulldown (Cable)', 'Lat Pulldown (Machine)', 'Shoulder Press (Dumbbell)', 'Shoulder Press (Machine)', 'Bench Press (Barbell)', 'Squat (Barbell)', 'Deadlift (Barbell)',
    'Bicep Curl (Dumbbell)', 'Triceps Pushdown (Cable)', 'Chest Fly (Cable)', 'Crunch', 'Calf Raise', 'Kettlebell Swing', 'Push Up', 'Pull Up'].forEach(n => assert.ok(names.has(n), n));
  const by = new Map(d.items.map(x => [x.id, x]));
  assert.equal(by.get('2330').g, by.get('0198').g); assert.equal(by.get('0198').h, '2330');       // seated pulldown GIF
  assert.equal(by.get('0603').g, by.get('0869').g); assert.equal(by.get('0869').h, '0603');
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
  // a lone 'v. 2' loses its number; with a first version it keeps it
  assert.deepEqual(applyNames([{ id: '1', n: 'barbell split squat v. 2', q: 'barbell' }]).map(x => x.n), ['Split Squat (Barbell)']);
  assert.deepEqual(applyNames([{ id: '1', n: 'jump rope', q: 'rope' }, { id: '2', n: 'jump rope v. 2', q: 'rope' }]).map(x => x.n), ['Jump Rope', 'Jump Rope 2']);
  assert.equal(once[0].r, 'lever chest press');
  assert.deepEqual(applyNames(once).map(x => x.n), once.map(x => x.n));
});

test('shipped library: v2, every item named, unique names, raw kept, ≤ 80 chars, no mojibake', () => {
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(d.v, 2);
  const shown = d.items.filter(x => !x.h), byId = new Map(d.items.map(x => [x.id, x]));
  assert.equal(new Set(shown.map(x => x.n.toLowerCase())).size, shown.length);
  // T-1635: no numbered leftovers (the three names where the number belongs to the exercise are allowed)
  assert.deepEqual(shown.filter(x => / \d+( \(| - |$)/.test(x.n)).map(x => x.n).sort(), ['Figure 8 (Kettlebell)', 'Landmine 180 (Barbell)', 'Swing 360']);
  // hidden duplicates point at a shown exercise and carry its name
  d.items.filter(x => x.h).forEach(x => { const m = byId.get(x.h); assert.ok(m && !m.h, x.id); assert.equal(x.n, m.n, x.id); });
  assert.deepEqual(d.items.filter(x => x.h).map(x => x.id).sort(), Object.keys(DUPES).sort());
  d.items.forEach(x => {
    assert.ok(x.r && x.n && x.n.length <= 80, x.id);
    assert.ok(!/в/.test(x.n), x.id);
    assert.equal(x.n.charAt(0), x.n.charAt(0).toUpperCase(), x.id);
  });
  assert.deepEqual(applyNames(d.items).map(x => x.n), d.items.map(x => x.n), 'file is up to date: run node tools/exercise-names.js');
});
