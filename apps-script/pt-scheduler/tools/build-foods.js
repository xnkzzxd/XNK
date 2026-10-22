#!/usr/bin/env node
// Builds foods/foods.min.json from the text of the TKPI 2017 PDF (Kemenkes, "Tabel Komposisi Pangan Indonesia").
// Usage: node tools/build-foods.js <tkpi.txt> [out.json] [curated.json]   (tkpi.txt = plain text of the PDF;
// curated.json defaults to tools/foods-curated.json: the staples the app offers, plus hand-made estimates)
// Only the columns the app needs are kept (per 100 g edible part): kal, protein, lemak, karbo, serat, kalsium, besi, natrium.
// PDF rows lose blank cells, so a row is kept only when its macros pass an energy sanity check (4P + 4K + 9L within 25 % of kal).
const fs = require('fs');

const GROUPS = { A: 'Serealia', B: 'Umbi', C: 'Kacang & biji', D: 'Sayuran', E: 'Buah', F: 'Daging & unggas', G: 'Ikan & seafood', H: 'Telur', J: 'Susu', K: 'Lemak & minyak', L: 'Gula', M: 'Bumbu', N: 'Minuman', Q: 'Lainnya' };
// TKPI column order after the source: air, kal, protein, lemak, karbo, serat, abu, kalsium, fosfor, besi, natrium, ...
const COLS = ['air', 'kal', 'protein', 'lemak', 'karbo', 'serat', 'abu', 'kalsium', 'fosfor', 'besi', 'natrium'];

function parseRows(text) {
  const flat = text.replace(/\r/g, ' ').replace(/\s+/g, ' ');
  const re = /\b([A-Z]{2}\d{3}) /g;
  const hits = [];
  let m;
  while ((m = re.exec(flat))) hits.push({ code: m[1], at: m.index, from: re.lastIndex });
  const rows = [];
  hits.forEach(function (h, i) {
    const body = flat.slice(h.from, i + 1 < hits.length ? hits[i + 1].at : flat.length);
    // name ends where the source tag starts: "KZGMI-2001", "DABM-1964", "KZGPI- 1990", "P3G", "TKPI", "MEXT" ...
    const sm = body.match(/\s(?:[A-Z0-9]{2,6}-?\s?(?:19|20)\d\d|P3G|TKPI|MEXT|FAO\S*|USDA\S*|[A-Z]{3,6})\s+(?=\d)/);
    if (!sm) return;
    const name = body.slice(0, sm.index).replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
    const nums = (body.slice(sm.index + sm[0].length).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (!name || nums.length < 11) return;
    const o = { id: h.code, nama: name };
    COLS.forEach(function (c, k) { o[c] = nums[k]; });
    rows.push(o);
  });
  return rows;
}

function sane(r) {
  if (!(r.kal > 0 && r.kal < 950) || r.protein < 0 || r.lemak < 0 || r.karbo < 0) return false;
  const est = 4 * r.protein + 4 * r.karbo + 9 * r.lemak;
  return Math.abs(est - r.kal) <= Math.max(25, 0.25 * r.kal) && r.air >= 0 && r.air <= 100 && r.serat >= 0 && r.serat <= Math.max(r.karbo, 1) + 1;
}

function slim(r) {
  const k = r.id[0];
  return { id: r.id, n: r.nama, g: GROUPS[k] || 'Lainnya', mentah: /mentah/i.test(r.nama), kal: r.kal, p: r.protein, l: r.lemak, k: r.karbo, s: r.serat, ca: r.kalsium, fe: r.besi, na: r.natrium };
}

function microOk(o) {
  return o.fe <= 40 && o.ca <= 1500 && o.na <= 3000 && o.s <= Math.max(o.k, 1) + 1;
}

const ALLERGEN = { t: 'telur', s: 'seafood', k: 'kacang', m: 'susu' };
function tagsOf(flags) {
  const f = String(flags || '');
  return { a: Object.keys(ALLERGEN).filter(function (k) { return f.indexOf(k) !== -1; }).map(function (k) { return ALLERGEN[k]; }), lak: f.indexOf('l') !== -1 || f.indexOf('m') !== -1 };
}

/**
 * Curated list: { tkpi: [[id, nama, kelompok, [[porsi, gram]], harga, flags]], estimasi: [[id, nama, kelompok, porsi, gram, kal, p, l, k, harga, flags]] }.
 * TKPI entries take their numbers from the parsed table (must exist and pass the energy check); estimasi entries
 * carry per-portion values written by hand, are stored per 100 g and marked e:true (not from TKPI).
 */
function curate(rows, list) {
  const byId = {};
  rows.forEach(function (r) { byId[r.id] = r; });
  const items = [];
  list.tkpi.forEach(function (c) {
    const r = byId[c[0]];
    if (!r) throw new Error('TKPI id not found: ' + c[0]);
    if (!sane(r)) throw new Error('TKPI row failed the energy check: ' + c[0] + ' ' + r.nama);
    const o = slim(r);
    // Micronutrient cells shift when a row has blanks: out-of-range values are dropped (null), never shown.
    const ok = microOk(o);
    items.push(Object.assign({ id: o.id, n: c[1], g: c[2], kal: o.kal, p: o.p, l: o.l, k: o.k, s: ok ? o.s : null, ca: ok ? o.ca : null, fe: ok ? o.fe : null, na: ok ? o.na : null, por: c[3], h: c[4] }, tagsOf(c[5]), { src: r.nama }));
  });
  (list.estimasi || []).forEach(function (c) {
    const f = 100 / c[4], r1 = function (x) { return Math.round(x * f * 10) / 10; };
    items.push(Object.assign({ id: c[0], n: c[1], g: c[2], kal: Math.round(c[5] * f), p: r1(c[6]), l: r1(c[7]), k: r1(c[8]), s: null, ca: null, fe: null, na: null, por: [[c[3], c[4]]], h: c[9], e: true }, tagsOf(c[10])));
  });
  return items;
}

function build(text, list) {
  const rows = parseRows(text);
  const ok = rows.filter(sane);
  if (list) return { v: 2, source: 'TKPI 2017, Kemenkes RI (per 100 g BDD); item e:true = perkiraan, bukan TKPI', total: rows.length, items: curate(rows, list) };
  return { v: 1, source: 'TKPI 2017, Kemenkes RI (per 100 g BDD)', total: rows.length, kept: ok.length, items: ok.map(slim) };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('Usage: node build-foods.js <tkpi.txt> [out.json]'); process.exit(1); }
  const curatedPath = process.argv[4] || require('path').join(__dirname, 'foods-curated.json');
  const list = fs.existsSync(curatedPath) ? JSON.parse(fs.readFileSync(curatedPath, 'utf8')) : null;
  const out = build(fs.readFileSync(src, 'utf8'), list);
  const dest = process.argv[3] || 'foods/foods.min.json';
  fs.mkdirSync(require('path').dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('parsed ' + out.total + ', wrote ' + out.items.length + ' → ' + dest);
}
module.exports = { parseRows, sane, microOk, build, curate };
