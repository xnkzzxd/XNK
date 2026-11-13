#!/usr/bin/env node
// Builds foods/foods.min.json from the text of the TKPI 2020 PDF (Kemenkes, "Tabel Komposisi Pangan Indonesia").
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
 * Curated list: { tkpi: [[id, nama, kelompok, [[porsi, gram]], harga, flags]], estimasi: [[id, nama, kelompok, porsi, gram, kal, p, l, k, harga, flags]],
 *   rujukan: [[id, nama, kelompok, [[porsi, gram]], harga, flags, [kal, p, l, k, serat, natrium], sumber]],
 *   resep: [[id, nama, kelompok, [[porsi, gram]], harga, flags, [[bahanId, gram], ...]]], tag: { id: [tag] }, koreksi: { id: { field: value|null, alasan } } }.
 * TKPI entries take their numbers from the parsed table (must exist and pass the energy check); estimasi entries
 * carry per-portion values written by hand, are stored per 100 g and marked e:true (not from TKPI).
 * rujukan = rows from panganku.org (Kemenkes' online TKPI, 4-digit codes) that the 2020 PDF lacks, per 100 g, marked pk:true.
 * resep = home recipes whose numbers are COMPUTED here from their ingredients (any TKPI row of the PDF, or a rujukan row):
 *   the sum of the ingredients is one portion (the first porsi's gram = cooked weight); marked r:true with the ingredient list in `b`.
 * tag = santan | goreng | manis | asin (menu limits, docs/nutrition/Rules.md); koreksi = fixes for PDF cells that the parser shifted.
 */
const TAGS = ['santan', 'goreng', 'manis', 'asin'];
const r1 = function (x) { return Math.round(x * 10) / 10; };
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
  const pk = {};
  (list.rujukan || []).forEach(function (c) {
    if (!/^[A-Z]{2}\d{4}$/.test(c[0])) throw new Error('rujukan id must be a panganku code: ' + c[0]);
    const v = c[6];
    const o = { kal: v[0], protein: v[1], lemak: v[2], karbo: v[3], serat: v[4], air: 50 };
    const zero = o.kal === 0 && !o.protein && !o.lemak && !o.karbo;   // garam: no energy at all
    if (!zero && !sane(o)) throw new Error('rujukan row failed the energy check: ' + c[0]);
    pk[c[0]] = { nama: c[7] || c[1], kal: v[0], protein: v[1], lemak: v[2], karbo: v[3], serat: v[4], natrium: v[5] };
    items.push(Object.assign({ id: c[0], n: c[1], g: c[2], kal: v[0], p: v[1], l: v[2], k: v[3], s: v[4], ca: null, fe: null, na: v[5], por: c[3], h: c[4], pk: true }, tagsOf(c[5]), { src: c[7] || c[1] }));
  });
  const shown = {};
  items.forEach(function (i) { shown[i.id] = i.n; });
  (list.resep || []).forEach(function (c) {
    if (!/^R\d{2,3}$/.test(c[0])) throw new Error('resep id must be R + number: ' + c[0]);
    const cooked = c[3][0][1];
    const t = { kal: 0, p: 0, l: 0, k: 0, s: 0, na: 0 }, bahan = [];
    let sOk = true, naOk = true;
    c[6].forEach(function (b) {
      const r = byId[b[0]] && sane(byId[b[0]]) ? byId[b[0]] : pk[b[0]];
      if (!r) throw new Error('resep ' + c[0] + ': ingredient not found or not sane: ' + b[0]);
      const x = b[1] / 100;
      t.kal += r.kal * x; t.p += r.protein * x; t.l += r.lemak * x; t.k += r.karbo * x;
      if (r.serat == null) sOk = false; else t.s += r.serat * x;
      if (r.natrium == null) naOk = false; else t.na += r.natrium * x;
      bahan.push([shown[b[0]] || String(r.nama).split(',')[0], b[1]]);
    });
    const f = 100 / cooked;
    items.push(Object.assign({ id: c[0], n: c[1], g: c[2], kal: Math.round(t.kal * f), p: r1(t.p * f), l: r1(t.l * f), k: r1(t.k * f), s: sOk ? r1(t.s * f) : null, ca: null, fe: null, na: naOk ? Math.round(t.na * f) : null, por: c[3], h: c[4], r: true }, tagsOf(c[5]), { b: bahan }));
  });
  const byItem = {};
  items.forEach(function (i) { byItem[i.id] = i; });
  Object.keys(list.koreksi || {}).forEach(function (id) {
    const it = byItem[id];
    if (!it) throw new Error('koreksi for unknown id: ' + id);
    const fix = list.koreksi[id];
    Object.keys(fix).forEach(function (k) { if (k !== 'alasan') it[k] = fix[k]; });
  });
  Object.keys(list.tag || {}).forEach(function (id) {
    if (!byItem[id]) throw new Error('tag for unknown id: ' + id);
    list.tag[id].forEach(function (t) { if (TAGS.indexOf(t) === -1) throw new Error('unknown tag ' + t + ' on ' + id); });
    byItem[id].t = list.tag[id].slice();
  });
  items.forEach(function (i) { if (!i.t) i.t = []; });
  return items;
}

/**
 * Menu packages (paket): [id, nama, waktu, base, [[foodId, slot, gram]]]. waktu = sarapan | utama | camilan; slot = karbo | protein | sayur | buah | pelengkap.
 * Exactly one karbo and one protein (the planner scales those two); santan and goreng never in the same package.
 * The tags of a package are the union of its foods' tags.
 */
const PAKET_WAKTU = ['sarapan', 'utama', 'camilan'], PAKET_SLOTS = ['karbo', 'protein', 'sayur', 'buah', 'pelengkap'];
function paketOf(list, foods) {
  const ids = {};
  return (list.paket || []).map(function (c) {
    const id = c[0];
    if (!/^[SUC]\d{2}$/.test(id) || ids[id]) throw new Error('bad or duplicate paket id: ' + id);
    ids[id] = true;
    if (PAKET_WAKTU.indexOf(c[2]) === -1) throw new Error(id + ': waktu ' + c[2]);
    if (!c[3]) throw new Error(id + ': base missing');
    const tags = [];
    c[4].forEach(function (it) {
      if (!foods[it[0]]) throw new Error(id + ': food not in list: ' + it[0]);
      if (PAKET_SLOTS.indexOf(it[1]) === -1) throw new Error(id + ': slot ' + it[1]);
      if (!(it[2] > 0)) throw new Error(id + ': gram');
      (foods[it[0]].t || []).forEach(function (t) { if (tags.indexOf(t) === -1) tags.push(t); });
    });
    const count = function (s) { return c[4].filter(function (it) { return it[1] === s; }).length; };
    if (count('karbo') !== 1 || count('protein') !== 1) throw new Error(id + ': needs exactly one karbo and one protein');
    if (tags.indexOf('santan') !== -1 && tags.indexOf('goreng') !== -1) throw new Error(id + ': santan and goreng in one package');
    return { id: id, n: c[1], w: c[2], base: c[3], t: tags.sort(), items: c[4] };
  });
}

function build(text, list) {
  const rows = parseRows(text);
  const ok = rows.filter(sane);
  if (list) return { v: 3, source: 'TKPI 2020, Kemenkes RI (per 100 g BDD); pk:true = panganku.org; r:true = resep dihitung dari bahan; e:true = perkiraan, bukan TKPI', total: rows.length, items: curate(rows, list) };
  return { v: 1, source: 'TKPI 2020, Kemenkes RI (per 100 g BDD)', total: rows.length, kept: ok.length, items: ok.map(slim) };
}

/** Server copy of the curated list (Apps Script cannot read the Pages JSON cheaply): src/NutrisiData.gs. */
function serverData(out, list) {
  const foods = {};
  out.items.forEach(function (i) {
    foods[i.id] = { n: i.n, g: i.g, kal: i.kal, p: i.p, l: i.l, k: i.k, por: i.por, h: i.h, a: i.a, lak: i.lak, e: !!i.e, t: i.t || [] };
    if (i.r) foods[i.id].b = i.b.map(function (b) { return b[0] + ' ' + b[1] + ' g'; }).join(', ');
  });
  const ids = Object.keys(foods);
  const slots = list.menu || {};
  const check = function (arr, where) { arr.forEach(function (id) { if (!foods[id]) throw new Error('menu id not in list: ' + id + ' (' + where + ')'); }); };
  ['sarapan', 'utama'].forEach(function (m) { check(slots.karbo[m], 'karbo.' + m); check(slots.protein[m], 'protein.' + m); });
  check(slots.sayur, 'sayur'); check(slots.buah, 'buah');
  return '// GENERATED by tools/build-foods.js from tools/foods-curated.json + the TKPI 2020 table. Do not edit by hand.\n' +
    '// ' + ids.length + ' foods per 100 g; e:true = estimate, not TKPI. Slots = ids the menu planner may pick.\n' +
    'const NUT_FOODS = ' + JSON.stringify(foods) + ';\n' +
    'const NUT_SLOTS = ' + JSON.stringify(slots) + ';\n' +
    '// Menu packages (docs/nutrition/Menu.md): base = main protein for the repeat limits, t = tags from the foods.\n' +
    'const NUT_PAKET = ' + JSON.stringify(paketOf(list, foods)) + ';\n';
}
function writeServerData(out, list) {
  const dest = require('path').join(__dirname, '..', 'src', 'NutrisiData.gs');
  fs.writeFileSync(dest, serverData(out, list));
  console.log('wrote ' + dest);
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('Usage: node build-foods.js <tkpi.txt> [out.json]'); process.exit(1); }
  const curatedPath = process.argv[4] || require('path').join(__dirname, 'foods-curated.json');
  const list = fs.existsSync(curatedPath) ? JSON.parse(fs.readFileSync(curatedPath, 'utf8')) : null;
  const out = build(fs.readFileSync(src, 'utf8'), list);
  const dest = process.argv[3] || 'foods/foods.min.json';
  if (list) writeServerData(out, list);
  fs.mkdirSync(require('path').dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('parsed ' + out.total + ', wrote ' + out.items.length + ' → ' + dest);
}
module.exports = { parseRows, sane, microOk, build, curate, serverData, paketOf };
