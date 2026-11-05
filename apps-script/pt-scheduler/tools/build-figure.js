#!/usr/bin/env node
// Fase U (T-1610): peta otot sendiri (pria/wanita, depan/belakang) → figure/figure.min.json (GitHub Pages).
// Bentuk otot dari paket npm react-muscle-highlighter (MIT, © 2024 My Muscle Contributors); lihat figure/CREDITS.md.
// Usage: node tools/build-figure.js <folder paket react-muscle-highlighter (berisi dist/cjs)>
// Setiap bagian dipetakan ke otot target pustaka (field `t`): chest → pectorals, upper-back → lats (bagian terbesar) +
// upper back, gluteal → glutes (terbesar) + abductors, dst. Bagian tanpa otot target (kepala, tangan, lutut…) jadi badan.
'use strict';
const fs = require('fs');
const path = require('path');

const SLUG_TARGET = {
  chest: 'pectorals', abs: 'abs', obliques: 'abs', biceps: 'biceps', triceps: 'triceps', trapezius: 'traps', deltoids: 'delts',
  adductors: 'adductors', quadriceps: 'quads', calves: 'calves', forearm: 'forearms', 'lower-back': 'spine', hamstring: 'hamstrings',
  'upper-back': ['lats', 'upper back'], gluteal: ['glutes', 'abductors'],
};
const VIEWS = {
  m: { front: ['bodyFront', '0 0 724 1448'], back: ['bodyBack', '724 0 724 1448'] },
  f: { front: ['bodyFemaleFront', '-50 -40 734 1538'], back: ['bodyFemaleBack', '756 0 774 1448'] },
};

// Tidak dibulatkan: path memakai bendera busur rapat ("a1 1 0 011.5 2") dan koordinat relatif, pembulatan merusak bentuk.
function slimPath(d) { return String(d).replace(/\s+/g, ' ').trim(); }

function outlines(pkg) {
  const out = {};
  [['m', 'SvgMaleWrapper'], ['f', 'SvgFemaleWrapper']].forEach(function (x) {
    const src = fs.readFileSync(path.join(pkg, 'dist', 'cjs', 'components', x[1] + '.js'), 'utf8');
    const re = /d: "([^"]+)", "aria-label": "(?:male|female)-body-outline-(front|back)"/g;
    let m;
    out[x[0]] = {};
    while ((m = re.exec(src))) out[x[0]][m[2]] = slimPath(m[1]);
  });
  return out;
}

function build(pkg) {
  const outl = outlines(pkg);
  const fig = { v: 1, credit: 'Muscle shapes: react-muscle-highlighter (MIT)', views: {} };
  Object.keys(VIEWS).forEach(function (sex) {
    fig.views[sex] = {};
    Object.keys(VIEWS[sex]).forEach(function (side) {
      const file = VIEWS[sex][side][0];
      const mod = require(path.resolve(pkg, 'dist', 'cjs', 'assets', file + '.js'));
      const list = mod[Object.keys(mod)[0]];
      const parts = {}, base = [];
      list.forEach(function (x) {
        const map = SLUG_TARGET[x.slug];
        ['common', 'left', 'right'].forEach(function (s) {
          let ds = ((x.path && x.path[s]) || []).map(slimPath);
          if (!ds.length) return;
          if (!map) { base.push.apply(base, ds); return; }
          if (typeof map === 'string') { (parts[map] = parts[map] || []).push.apply(parts[map], ds); return; }
          // Dua otot dalam satu bagian: path terpanjang = otot besar (lats / glutes), sisanya otot kedua.
          const big = ds.reduce(function (a, b) { return b.length > a.length ? b : a; });
          (parts[map[0]] = parts[map[0]] || []).push(big);
          ds.filter(function (d) { return d !== big; }).forEach(function (d) { (parts[map[1]] = parts[map[1]] || []).push(d); });
        });
      });
      // Path dibiarkan terpisah: sebagian memakai perintah relatif, jadi tidak boleh disambung jadi satu string.
      fig.views[sex][side] = { vb: VIEWS[sex][side][1], outline: outl[sex][side] || '', base: base, parts: parts };
    });
  });
  return fig;
}

if (require.main === module) {
  const pkg = process.argv[2];
  if (!pkg) { console.error('Usage: node build-figure.js <react-muscle-highlighter package folder>'); process.exit(1); }
  const out = path.join(__dirname, '..', '..', '..', 'figure', 'figure.min.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build(pkg)));
  console.log('figure → ' + out + ' (' + fs.statSync(out).size + ' bytes)');
}
module.exports = { build, slimPath, SLUG_TARGET };
