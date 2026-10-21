#!/usr/bin/env node
// Builds foods/foods.min.json from the text of the TKPI 2017 PDF (Kemenkes, "Tabel Komposisi Pangan Indonesia").
// Usage: node tools/build-foods.js <tkpi.txt> [out.json]   (tkpi.txt = plain text of the PDF)
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

function build(text) {
  const rows = parseRows(text);
  const ok = rows.filter(sane);
  return { v: 1, source: 'TKPI 2017, Kemenkes RI (per 100 g BDD)', total: rows.length, kept: ok.length, items: ok.map(slim) };
}

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('Usage: node build-foods.js <tkpi.txt> [out.json]'); process.exit(1); }
  const out = build(fs.readFileSync(src, 'utf8'));
  const dest = process.argv[3] || 'foods/foods.min.json';
  fs.mkdirSync(require('path').dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('parsed ' + out.total + ', kept ' + out.kept + ' → ' + dest);
}
module.exports = { parseRows, sane, build };
