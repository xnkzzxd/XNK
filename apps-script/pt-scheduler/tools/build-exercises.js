#!/usr/bin/env node
// Slims hasaneyldrm/exercises-dataset (MIT data, media © Gym visual) into exercises/exercises.min.json.
// Usage: node tools/build-exercises.js <path/to/upstream/data/exercises.json> [out.json]
// Only English names and the fields the picker needs are kept. Media is NOT copied: the picker hotlinks
// `base + gif` for admin previews only.
const fs = require('fs');
const path = require('path');

const MEDIA_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';

function slim(list) {
  return list.map(function (e) {
    return {
      id: String(e.id),
      n: String(e.name).trim(),
      b: e.body_part || e.category || '',
      q: e.equipment || '',
      t: e.target || '',
      g: String(e.gif_url || '').replace(/^videos\//, ''),
    };
  }).filter(function (e) { return e.id && e.n && /^[A-Za-z0-9_-]{1,20}$/.test(e.id) && e.n.length <= 80; });
}

function build(list) {
  return { v: 1, base: MEDIA_BASE + 'videos/', credit: 'Exercises Dataset (MIT) · media © Gym visual', items: slim(list) };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('Usage: node build-exercises.js <exercises.json> [out.json]'); process.exit(1); }
  const out = process.argv[3] || path.join(__dirname, '..', '..', '..', 'exercises', 'exercises.min.json');
  const data = build(JSON.parse(fs.readFileSync(src, 'utf8')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(data.items.length + ' exercises → ' + out + ' (' + fs.statSync(out).size + ' bytes)');
}
module.exports = { build, slim, MEDIA_BASE };
