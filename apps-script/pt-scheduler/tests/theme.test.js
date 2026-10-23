'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../src/Theme.html'), 'utf8');

function block(startMarker) {
  const i = css.indexOf(startMarker);
  assert.ok(i >= 0, startMarker);
  const open = css.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
  return css.slice(open + 1, j);
}
function tokens(text) {
  const out = {};
  text.replace(/(--[\w-]+):\s*([^;]+);/g, (m, k, v) => { out[k] = v.trim(); return m; });
  return out;
}
const light = tokens(block(':root {'));
const darkMedia = tokens(block('@media (prefers-color-scheme: dark)'));
const darkAttr = tokens(block(':root[data-theme="dark"]'));

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

test('dark theme blocks carry identical tokens', () => {
  assert.deepStrictEqual(darkMedia, darkAttr);
});

test('danger tokens exist in light and dark', () => {
  for (const t of [light, darkAttr]) { assert.ok(t['--danger']); assert.ok(t['--danger-soft']); }
});

test('danger text meets AA on surfaces', () => {
  for (const [name, t] of [['light', light], ['dark', darkAttr]]) {
    for (const bg of ['--surface', '--bg', '--danger-soft']) {
      const r = contrast(t['--danger'], t[bg]);
      assert.ok(r >= 4.5, `${name} --danger on ${bg}: ${r.toFixed(2)}`);
    }
  }
});

test('ink card text is readable', () => {
  for (const [name, t] of [['light', light], ['dark', darkAttr]]) {
    assert.ok(contrast(t['--on-ink'], t['--ink']) >= 7, name + ' on-ink');
  }
});

test('font tokens are rem so big text scales', () => {
  for (const k of Object.keys(light).filter(k => k.startsWith('--fs-'))) assert.match(light[k], /rem$/, k);
});

test('band tokens exist and match in both dark blocks, ink text is readable on them', () => {
  for (const t of [light, darkAttr]) { assert.ok(t['--band'] && t['--band-card'] && t['--on-band']); }
  assert.strictEqual(darkMedia['--band'], darkAttr['--band']);
  for (const t of [light, darkAttr]) assert.ok(contrast(t['--on-band'], t['--band']) >= 7);
});

test('page text is readable on the new near-white background', () => {
  assert.ok(contrast(light['--fg'], light['--bg']) >= 7);
  assert.ok(contrast(light['--fg-muted'], light['--bg']) >= 4.5);
});

test('buttons wrap and text holders use min-height', () => {
  const btn = block('.btn {');
  assert.ok(!/white-space:\s*nowrap/.test(btn));
  for (const sel of ['.chip {', '.pill {']) assert.ok(!/(^|[;\s])height:/.test(block(sel)), sel);
});
