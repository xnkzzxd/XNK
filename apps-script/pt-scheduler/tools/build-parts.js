'use strict';
// App.html and Theme.html are far too big to edit as one file (App.html ~800 KB in one IIFE). Their source lives in
// small part files under parts/app/ and parts/theme/; this tool joins them, in file-name order and byte for byte, into
// src/App.html and src/Theme.html. The generated files stay in src/ (Apps Script serves them, and every other tool reads
// them), so nothing downstream changed. tests/parts.test.js fails when a generated file is stale.
//   node apps-script/pt-scheduler/tools/build-parts.js           # write src/App.html and src/Theme.html
//   node apps-script/pt-scheduler/tools/build-parts.js --check   # exit 1 when they are stale
//   node apps-script/pt-scheduler/tools/build-parts.js --split   # one-time: cut the current files into parts (refuses if parts exist)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = {
  app: { out: 'src/App.html', dir: 'parts/app', banner: /^ {2}\/\/ ── (.*?)[ ─]*$/, every: 700 },
  theme: { out: 'src/Theme.html', dir: 'parts/theme', banner: /^\/\* ── (.*?)[ ─]*\*\/$/, every: 650 },
};
const EXT = '.part';

function partFiles(t) {
  const dir = path.join(ROOT, t.dir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => n.endsWith(EXT)).sort();
}
function assemble(t) {
  return partFiles(t).map(n => fs.readFileSync(path.join(ROOT, t.dir, n), 'utf8')).join('');
}
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bagian';

function split(name) {
  const t = TARGETS[name];
  if (partFiles(t).length) throw new Error(`${t.dir} already has parts; edit them instead of splitting again.`);
  const text = fs.readFileSync(path.join(ROOT, t.out), 'utf8');
  const lines = text.split('\n');                       // keeps the exact bytes when joined back with '\n'
  const cuts = [0];
  let last = 0;
  for (let i = 1; i < lines.length; i++) {
    if (i - last >= t.every && t.banner.test(lines[i])) { cuts.push(i); last = i; }
  }
  cuts.push(lines.length);
  fs.mkdirSync(path.join(ROOT, t.dir), { recursive: true });
  const width = String(cuts.length).length < 2 ? 2 : String(cuts.length).length;
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k], b = cuts[k + 1];
    const first = lines[a].match(t.banner) || lines.slice(a, b).map(l => l.match(t.banner)).find(Boolean);
    const title = k === 0 ? 'awal' : (first ? first[1] : 'bagian');
    const body = lines.slice(a, b).join('\n') + (b < lines.length ? '\n' : '');
    fs.writeFileSync(path.join(ROOT, t.dir, String(k + 1).padStart(width, '0') + '-' + slug(title) + EXT), body);
  }
  if (assemble(t) !== text) throw new Error('split is not byte-identical for ' + name);
  return cuts.length - 1;
}

function main() {
  const arg = process.argv[2];
  if (arg === '--split') { for (const n of Object.keys(TARGETS)) console.log(`${n}: ${split(n)} parts`); return; }
  let stale = 0;
  for (const [n, t] of Object.entries(TARGETS)) {
    const want = assemble(t);
    if (!want) throw new Error(`${t.dir} has no parts`);
    const have = fs.existsSync(path.join(ROOT, t.out)) ? fs.readFileSync(path.join(ROOT, t.out), 'utf8') : '';
    if (arg === '--check') { if (have !== want) { console.error(`${t.out} is stale: run node apps-script/pt-scheduler/tools/build-parts.js`); stale++; } }
    else if (have !== want) { fs.writeFileSync(path.join(ROOT, t.out), want); console.log('wrote ' + t.out); }
  }
  if (stale) process.exit(1);
  if (arg === '--check') console.log('parts: generated files are up to date');
}
if (require.main === module) main();
module.exports = { TARGETS, assemble, partFiles, ROOT, EXT };
