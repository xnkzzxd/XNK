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

test('muscle levels: gym exercises use the EMG table (Otot.md), others the general map', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.html'), 'utf8');
  const body = src.slice(src.indexOf('const MM_PART_TARGETS'), src.indexOf('window.mmLevels = mmLevels;'));
  const mmLevels = new Function(body + '; return mmLevels;')();
  assert.deepEqual(mmLevels([{ exId: '0739', target: 'glutes' }]), { quads: 2, glutes: 1, adductors: 1 }, 'Leg Press: quads main, glutes + adductors helpers (Kinoshita 2026)');
  assert.deepEqual(mmLevels([{ exId: '0585', target: 'quads' }]), { quads: 2 }, 'Leg Extension: no helpers');
  assert.equal(mmLevels([{ exId: '2330' }]).biceps, 1);
  assert.deepEqual(mmLevels([{ target: 'hamstrings' }]), { hamstrings: 2, glutes: 1 });
  assert.equal(mmLevels([{ bodyPart: 'chest' }]).pectorals, 2, 'old rows with only a body part still light up');
  const otot = fs.readFileSync(path.join(DIR, '..', 'docs', 'program', 'Otot.md'), 'utf8');
  ['0493', '2330', '0739', '0585', '0861', '0596'].forEach(id => assert.ok(otot.includes('| ' + id + ' |'), id + ' documented in Otot.md'));
  assert.ok(!otot.includes('⚠'), 'every gym exercise has a source');
  assert.ok(!fs.readFileSync(path.join(DIR, '..', 'docs', 'program', 'Rules.md'), 'utf8').match(/⚠ belum|belum dicek/), 'no unchecked rule left');
});
