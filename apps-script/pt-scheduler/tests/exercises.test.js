'use strict';
// Exercise library (L1): the slim JSON the admin picker loads from GitHub Pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build } = require('../tools/build-exercises');
const { seededEnv } = require('./fixtures');

const FILE = path.join(__dirname, '..', '..', '..', 'exercises', 'exercises.min.json');

test('build: keeps only picker fields and drops other languages/media', () => {
  const out = build([{ id: '0001', name: '3/4 sit-up', body_part: 'waist', equipment: 'body weight', target: 'abs', gif_url: 'videos/0001-x.gif', instructions: { en: 'x' }, image: 'images/a.jpg' }]);
  assert.deepEqual(out.items[0], { id: '0001', n: '3/4 sit-up', b: 'waist', q: 'body weight', t: 'abs', g: '0001-x.gif' });
  assert.match(out.base, /^https:\/\/.+\/videos\/$/);
});

test('shipped exercises.min.json: small, unique ids, every line round-trips through the program parser', () => {
  const stat = fs.statSync(FILE);
  assert.ok(stat.size < 250 * 1024, 'stays small for fast load');
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.ok(d.items.length > 1000);
  assert.equal(new Set(d.items.map(x => x.id)).size, d.items.length);
  const env = seededEnv();
  const lines = d.items.map(x => (x.n.charAt(0).toUpperCase() + x.n.slice(1)).replace(/[|\r\n]+/g, ' ').slice(0, 80) + ' | 3x10 | ex:' + x.id);
  for (let i = 0; i < lines.length; i += 12) {
    const p = JSON.parse(JSON.stringify(env.call('_parseProgramText_', lines.slice(i, i + 12).join('\n'))));
    assert.equal(p.days[0].items.length, Math.min(12, lines.length - i));
  }
});
