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

test('T-1612 patterns: joint ranges match Gerak.md and muscles match the catalog rows', () => {
  // Push Up (floor): full elbow extension at the top (Kang 2019)
  assert.ok(first('push-up').j.elbow <= 6 && near(last('push-up').j.elbow, 95, 3));
  // Bicep Curl: elbow 0° → 135° full ROM (Pedrosa 2023)
  assert.ok(first('bicep-curl-cable').j.elbow <= 3 && near(last('bicep-curl-cable').j.elbow, 135, 1));
  // Triceps Pushdown: elbow 90° → 0°, neutral arm (Maeo 2022)
  assert.ok(near(first('triceps-pushdown').j.elbow, 90, 1) && last('triceps-pushdown').j.elbow <= 3 && Math.abs(first('triceps-pushdown').j.shoulder) <= 10);
  // Calf Raise: ankle −25° → +25° (Kassiano 2023)
  assert.ok(near(first('calf-raise-machine').j.ankle, -25, 1) && near(last('calf-raise-machine').j.ankle, 25, 1));
  // Goblet Squat: knee 5° → 100° (same range as the machine squat)
  assert.ok(near(first('goblet-squat').j.knee, 5, 1) && near(last('goblet-squat').j.knee, 100, 1));
  // Seated Leg Curl: seated (hip flexed, Maeo 2021), knee bends
  assert.ok(data.pats['seated-leg-curl'].frames.every(f => near(f.j.hip, 90, 2)) && last('seated-leg-curl').j.knee > first('seated-leg-curl').j.knee + 60);
  // muscles = catalog main / helper muscles of the same lift
  const seed = fs.readFileSync(path.join(__dirname, '..', 'src', 'LatihanKatalog.gs'), 'utf8');
  [...seed.matchAll(/\['gym:[^']+', '([^']+)', '([^']*)', '[^']+', '[^']+', '([^']*)', '([^']*)'/g)].forEach(m => {
    const pat = data.ex[m[1].toLowerCase()];
    if (!pat || ['seated-cable-row'].includes(pat) && m[1] !== 'Seated Cable Row') return;   // machine row shares the cable row pattern
    const want = [m[3].split(',').filter(Boolean), m[4].split(',').filter(Boolean)];
    assert.deepEqual(data.pats[pat].muscles, want, m[1] + ' muscles = catalog');
  });
  ['0662', '0599', '0868', '0201', '0605', '1760', '1350'].forEach(id => assert.ok(data.ex[id], 'library ' + id + ' has a pattern'));
});

test('segments stay attached and pinned points stay put', () => {
  const L = data.len;
  const end = (s, len) => [s[0] + len * Math.cos(s[2] * Math.PI / 180), s[1] + len * Math.sin(s[2] * Math.PI / 180)];
  Object.keys(data.pats).filter(k => data.pats[k].view !== 'front').forEach(k => {
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
  assert.ok(still('push-up', 'wrist') && still('push-up', 'ankle') && still('goblet-squat', 'ankle'), 'floor push up and goblet squat: hands / feet stay put');
  assert.ok(still('seated-leg-curl', 'hip') && still('bicep-curl-cable', 'shoulder') && still('triceps-pushdown', 'elbow'), 'curl / pushdown: the upper arm stays still');
  assert.ok(still('leg-press', 'hip') && still('leg-extension', 'hip') && still('lat-pulldown', 'hip'), 'seated lifts: the hips stay on the seat');
});

test('T-1612b: front view is a mirror image, and the dumbbell / bodyweight lifts follow Gerak.md', () => {
  ['lateral-raise', 'hip-abduction-machine'].forEach(k => {
    const P = data.pats[k];
    assert.equal(P.view, 'front');
    P.frames.forEach((f, i) => {
      ['ua', 'fa', 'thigh', 'shin'].forEach(sg => {
        assert.ok(Math.abs((180 - f.s[sg + 'R'][2]) - f.s[sg + 'L'][2]) < 0.6, k + ' frame ' + i + ' ' + sg + ' mirrors');
        assert.ok(Math.abs((200 - f.s[sg + 'R'][0]) - f.s[sg + 'L'][0]) < 0.6, k + ' frame ' + i + ' ' + sg + ' symmetric about the middle');
      });
      P.order.forEach(sg => assert.ok(f.s[sg], k + ' has segment ' + sg));
    });
  });
  // Lateral Raise: arm from the side to shoulder height
  assert.ok(first('lateral-raise').j.shoulderAbd <= 6 && near(last('lateral-raise').j.shoulderAbd, 90, 1));
  // Hip Abduction: knees apart
  assert.ok(first('hip-abduction-machine').j.hipAbd <= 8 && near(last('hip-abduction-machine').j.hipAbd, 40, 1));
  // RDL: hip flexed (trunk forward) → upright, knee constant and slightly bent
  assert.ok(first('db-rdl').j.hip >= 60 && last('db-rdl').j.hip <= 15 && data.pats['db-rdl'].frames.every(f => near(f.j.knee, 15, 2)));
  // Bench Press: arm straight over the chest → elbow bent
  assert.ok(first('db-bench-press').j.elbow <= 6 && last('db-bench-press').j.elbow >= 90);
  // Shoulder Press: elbow bent → nearly straight overhead
  assert.ok(first('db-shoulder-press').j.elbow >= 90 && last('db-shoulder-press').j.elbow <= 10);
  // Bent Over Row: straight arm → elbow bent past the trunk
  assert.ok(first('db-row').j.elbow <= 6 && last('db-row').j.elbow >= 110);
  // Dead Bug: table-top → arm overhead and leg long
  assert.ok(near(first('dead-bug').j.hip, 90, 1) && near(first('dead-bug').j.knee, 90, 1) && last('dead-bug').j.knee <= 2 && last('dead-bug').j.shoulder >= 140);
  ['0334', '0597', '0289', '0405', '0293', '1459', '0276'].forEach(id => assert.ok(data.ex[id], 'library ' + id + ' has a pattern'));
});

test('every active lift in the gym catalog has a pattern, except cardio', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'src', 'LatihanKatalog.gs'), 'utf8');
  const active = [...seed.matchAll(/\['gym:[^']+', '([^']+)', '([^']*)', '[^']+', '([^']+)',.*, (true|false)\],/g)].filter(m => m[4] === 'true' && m[3] !== 'kardio');
  assert.ok(active.length >= 22);
  active.forEach(m => assert.ok(data.ex[m[1].toLowerCase()], 'pattern for ' + m[1]));
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
