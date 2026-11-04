'use strict';
// Fase U (T-1610): our own muscle figure (figure/figure.min.json) — shapes, coverage, size, credits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', '..', '..', 'figure');
const TARGETS = ['pectorals', 'lats', 'upper back', 'traps', 'spine', 'delts', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves'];

test('figure: male and female, front and back, every counted muscle drawn, paths kept separate', () => {
  const f = JSON.parse(fs.readFileSync(path.join(DIR, 'figure.min.json'), 'utf8'));
  ['m', 'f'].forEach(sex => {
    const drawn = new Set();
    ['front', 'back'].forEach(side => {
      const v = f.views[sex][side];
      assert.equal(v.vb.split(' ').length, 4);
      assert.ok(v.outline.length > 1000, sex + side + ' outline');
      assert.ok(Array.isArray(v.base) && v.base.length > 5);
      Object.keys(v.parts).forEach(t => {
        assert.ok(TARGETS.includes(t), 'unknown muscle ' + t);
        assert.ok(Array.isArray(v.parts[t]) && v.parts[t].every(d => /^[Mm]/.test(d)), sex + side + ' ' + t);
        drawn.add(t);
      });
    });
    assert.deepEqual([...drawn].sort(), TARGETS.slice().sort(), sex + ' covers all 16 muscles');
  });
});

test('figure: small enough to load lazily, credits and licence shipped', () => {
  const raw = fs.readFileSync(path.join(DIR, 'figure.min.json'));
  assert.ok(zlib.gzipSync(raw).length < 80 * 1024, 'under 80 KB gzip');
  const cr = fs.readFileSync(path.join(DIR, 'CREDITS.md'), 'utf8');
  assert.match(cr, /react-muscle-highlighter/);
  assert.match(cr, /MIT/);
  assert.ok(fs.existsSync(path.join(DIR, 'LICENSE-react-muscle-highlighter.txt')));
});
