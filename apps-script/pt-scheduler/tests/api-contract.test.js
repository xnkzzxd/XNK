'use strict';
// Static contract between the UI and the doPost door list (Phase AAA, T-1706): every server
// function the HTML calls must be reachable through doPost, and called with the right kind of
// token helper (adminCall -> admin, memberCall -> member, publicCall -> public).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('./api-lists');

const SRC = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.html'));

function names(re, text) {
  const out = new Map();
  let m;
  while ((m = re.exec(text))) { const n = m[1]; out.set(n, (out.get(n) || 0) + 1); }
  return out;
}

const all = files.map(f => ({ f, t: read(f) }));
const scan = re => { const o = []; for (const { f, t } of all) for (const n of names(re, t).keys()) o.push([n, f]); return o; };

test('contract: adminCall names are admin functions', () => {
  const found = scan(/\badminCall\(\s*'([A-Za-z0-9_]+)'/g);
  assert.ok(found.length > 80, 'expected many adminCall sites, found ' + found.length);
  for (const [n, f] of found) assert.ok(L.ADMIN.includes(n), `${f}: adminCall('${n}') is not in ADMIN`);
});

test('contract: memberCall names are member functions (or public functions that take an optional token)', () => {
  const found = scan(/\bmemberCall\(\s*'([A-Za-z0-9_]+)'/g);
  assert.ok(found.length > 20, 'expected many memberCall sites, found ' + found.length);
  for (const [n, f] of found) assert.ok(L.MEMBER.includes(n) || L.PUBLIC_API.includes(n), `${f}: memberCall('${n}') is not in MEMBER/PUBLIC`);
});

test('contract: publicCall names are public functions', () => {
  const found = scan(/\bpublicCall\(\s*'([A-Za-z0-9_]+)'/g);
  assert.ok(found.length >= 3, 'expected publicCall sites, found ' + found.length);
  for (const [n, f] of found) assert.ok(L.PUBLIC_API.includes(n), `${f}: publicCall('${n}') is not in PUBLIC_API`);
});

test('contract: the landing page only calls public functions', () => {
  const t = read('LandingScript.html');
  const found = [...names(/(?<![A-Za-z0-9_.])call\(\s*'([A-Za-z0-9_]+)'/g, t).keys()];
  assert.ok(found.length >= 6, 'expected landing call sites, found ' + found.length);
  for (const n of found) assert.ok(L.PUBLIC_API.includes(n), `LandingScript.html: call('${n}') is not in PUBLIC_API`);
});

test('contract: direct google.script.run chains call functions in the door list', () => {
  // A chain is written as `google.script.run` alone on a line, then `.withX(...)` lines and the
  // server call at the same indentation. Chains inside the call helpers are not matched.
  const found = [];
  for (const { f, t } of all) {
    const lines = t.split('\n');
    lines.forEach((line, i) => {
      const m = /^(\s*)google\.script\.run\s*$/.exec(line);
      if (!m) return;
      const pad = m[1].length + 2;
      for (let j = i + 1; j < lines.length && j < i + 200; j++) {
        const c = /^(\s*)\.([A-Za-z][A-Za-z0-9_]*)\(/.exec(lines[j]);
        if (c && c[1].length === pad && !/^with/.test(c[2])) { found.push([c[2], f]); return; }
      }
      found.push(['<none>', f]);
    });
  }
  assert.ok(found.length >= 3, 'expected direct run chains, found ' + found.length);
  for (const [n, f] of found) assert.ok(L.API_FUNCTIONS.includes(n), `${f}: google.script.run.${n} is not in the door list`);
  assert.deepEqual(found.map(x => x[0]).sort(), ['adminLogin', 'memberLoginByKey', 'memberLoginByPhone']);
});

test('contract: UI calls with a computed name are reviewed', () => {
  // A call whose first argument is not a string literal cannot be checked here; keep this list short and known.
  const dynamic = [];
  for (const { f, t } of all) {
    for (const m of t.matchAll(/\b(adminCall|memberCall|publicCall)\(\s*([^'"\s)][^,)]*)/g)) {
      if (/^(name|fn|runner)\b/.test(m[2])) continue;   // the helpers' own definitions
      dynamic.push(`${f}: ${m[1]}(${m[2]}`);
    }
  }
  assert.deepEqual(dynamic, [], 'computed-name call found: add it to the door list check by hand');
});
