'use strict';
// Fase U (T-1611): animasi gerakan sendiri. figure/rig.min.json harus sama dengan hasil tools/build-rig.js, sudut sendi
// tiap pola di dalam rentang bersumber (docs/program/Gerak.md), ruas tidak terlepas, titik yang dipaku diam, otot sama
// dengan tabel Otot.md (MM_BY_EX di App.html).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const rig = require('../tools/build-rig.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'figure', 'rig.min.json'), 'utf8'));
const first = k => data.pats[k].frames[0], last = k => data.pats[k].frames[data.pats[k].frames.length - 1];
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('rig.min.json is the build output (rerun tools/build-rig.js after editing the patterns)', () => {
  assert.deepEqual(data, JSON.parse(JSON.stringify(rig.build())));
});

test('every beginner gym exercise (catalog seed) has a pattern; gzip size stays small', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'src', 'LatihanKatalog.gs'), 'utf8');
  const names = [...seed.matchAll(/\['gym:[^']+', '([^']+)', '([^']*)', 'pemula-banget', '(?!kardio)[^']+'.*, true\],/g)];
  assert.equal(names.length, 8);
  names.forEach(m => {
    assert.ok(data.ex[m[1].toLowerCase()], 'pattern for ' + m[1]);
    if (m[2]) assert.equal(data.ex[m[2]], data.ex[m[1].toLowerCase()], 'library ID ' + m[2] + ' gives the same pattern as ' + m[1]);
  });
  const gz = require('zlib').gzipSync(fs.readFileSync(path.join(ROOT, 'figure', 'rig.min.json'))).length;
  assert.ok(gz < 40000, 'rig.min.json gzip ' + gz + ' B');
});

test('joint ranges match docs/program/Gerak.md', () => {
  // Leg Extension: knee 100° → 30° (Pedrosa 2021)
  assert.ok(near(first('leg-extension').j.knee, 100, 1) && near(last('leg-extension').j.knee, 30, 1));
  // Leg Press: knee 100° → 5° (Larsen 2025)
  assert.ok(near(first('leg-press').j.knee, 100, 1) && near(last('leg-press').j.knee, 5, 1));
  // Squat (Machine): knee 5° → 100°
  assert.ok(near(first('squat-machine').j.knee, 5, 1) && near(last('squat-machine').j.knee, 100, 1));
  // Hip Thrust: hip ends fully extended at the top (McCurdy 2021), starts flexed
  assert.ok(near(last('hip-thrust-machine').j.hip, 0, 3) && first('hip-thrust-machine').j.hip >= 60);
  // Lat Pulldown: arm overhead → elbows down beside the trunk
  assert.ok(first('lat-pulldown').j.shoulder >= 150 && last('lat-pulldown').j.shoulder <= 20 && last('lat-pulldown').j.elbow >= 120);
  // Seated Cable Row: arm forward → elbow behind the trunk (shoulder extension), elbow bent
  assert.ok(near(first('seated-cable-row').j.shoulder, 90, 8) && last('seated-cable-row').j.shoulder < 0 && last('seated-cable-row').j.elbow >= 110);
  // Incline Push Up: full elbow extension at the top (Kang 2019), about 90° at the bottom
  assert.ok(first('incline-push-up').j.elbow <= 6 && near(last('incline-push-up').j.elbow, 95, 3));
  // Chest Fly: arm at shoulder height, elbow soft and constant; the arm comes forward (projection grows)
  const fly = data.pats['chest-fly-machine'].frames;
  assert.ok(fly.every(f => near(f.j.shoulder, 88, 1) && near(f.j.elbow, 15, 1)) && fly[0].s.ua[3] < 0.3 && fly[fly.length - 1].s.ua[3] > 0.95);
});

test('segments stay attached and pinned points stay put', () => {
  const L = data.len;
  const end = (s, len) => [s[0] + len * Math.cos(s[2] * Math.PI / 180), s[1] + len * Math.sin(s[2] * Math.PI / 180)];
  Object.keys(data.pats).forEach(k => {
    data.pats[k].frames.forEach((f, i) => {
      const chain = [['torso', 'head', L.torso + 0], ['thigh', 'shin', L.thigh], ['shin', 'foot', L.shin], ['ua', 'fa', L.ua]];
      chain.forEach(([a, b, len]) => {
        if (a === 'torso') return;   // the neck sits on the shoulder, checked below
        const e = end(f.s[a], len * (f.s[a][3] || 1));
        assert.ok(Math.hypot(e[0] - f.s[b][0], e[1] - f.s[b][1]) < 0.6, k + ' frame ' + i + ': ' + b + ' attached to ' + a);
      });
      const sh = end(f.s.torso, L.torso);
      assert.ok(Math.hypot(sh[0] - f.s.ua[0], sh[1] - f.s.ua[1]) < 0.6, k + ' frame ' + i + ': arm on the shoulder');
      ['torso', 'thigh', 'shin', 'foot', 'ua', 'fa', 'head'].forEach(sg => {
        assert.ok(f.s[sg][0] > -5 && f.s[sg][0] < 205 && f.s[sg][1] > -5 && f.s[sg][1] < 205, k + ' ' + sg + ' inside the box');
      });
      if (i) Object.keys(f.s).forEach(sg => assert.ok(Math.abs(f.s[sg][2] - data.pats[k].frames[i - 1].s[sg][2]) < 60, k + ' ' + sg + ' turns smoothly'));
    });
  });
  const still = (k, j) => { const fr = data.pats[k].frames; return fr.every(f => Math.hypot(f.p[j][0] - fr[0].p[j][0], f.p[j][1] - fr[0].p[j][1]) < 1); };
  assert.ok(still('squat-machine', 'ankle'), 'squat: feet stay on the platform');
  assert.ok(still('hip-thrust-machine', 'ankle') && still('hip-thrust-machine', 'shoulder'), 'hip thrust: feet and upper back stay put');
  assert.ok(still('incline-push-up', 'wrist') && still('incline-push-up', 'ankle'), 'push up: hands and feet stay put');
  assert.ok(still('leg-press', 'hip') && still('leg-extension', 'hip') && still('lat-pulldown', 'hip'), 'seated lifts: the hips stay on the seat');
});

test('muscles match Otot.md (MM_BY_EX in App.html)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.html'), 'utf8');
  const by = eval('(' + app.match(/const MM_BY_EX = (\{[\s\S]*?\});/)[1] + ')');
  Object.keys(by).forEach(id => {
    const pat = data.ex[id];
    assert.ok(pat, 'pattern for ' + id);
    assert.deepEqual(data.pats[pat].muscles, by[id], pat + ' muscles');
  });
  const otot = fs.readFileSync(path.join(ROOT, 'docs', 'program', 'Otot.md'), 'utf8');
  assert.ok(/Squat \(Machine\)/.test(otot) && /Hip Thrust \(Machine\)/.test(otot));
  assert.deepEqual(data.pats['squat-machine'].muscles, [['quads'], ['glutes', 'adductors']]);
  assert.deepEqual(data.pats['hip-thrust-machine'].muscles, [['glutes'], ['hamstrings']]);
});
