#!/usr/bin/env node
// Fase U (T-1601): nama gerakan ala Hevy, "<Gerakan> (<Alat>)", untuk semua gerakan library.
// Nama mentah dari dataset (huruf kecil, kadang rusak: "sled 45в° leg press") disimpan di field `r` untuk pencarian;
// `n` menjadi nama tampilan. Nama ditulis sendiri mengikuti pola itu, bukan salinan database Hevy.
// Usage: node tools/exercise-names.js [exercises.min.json]   (menulis ulang file itu; idempoten, selalu dari `r`)
'use strict';
const fs = require('fs');
const path = require('path');

const OVERRIDES = require('./exercise-names-override.json');

// Label alat di akhir nama. Alat tanpa label (berat badan, kardio, dll.) tidak diberi kurung.
const EQUIP_LABEL = {
  'barbell': 'Barbell', 'olympic barbell': 'Barbell', 'ez barbell': 'EZ Bar', 'trap bar': 'Trap Bar',
  'dumbbell': 'Dumbbell', 'cable': 'Cable', 'leverage machine': 'Machine', 'sled machine': 'Machine',
  'smith machine': 'Smith Machine', 'band': 'Band', 'resistance band': 'Band', 'kettlebell': 'Kettlebell',
  'weighted': 'Weighted', 'medicine ball': 'Medicine Ball', 'stability ball': 'Stability Ball', 'bosu ball': 'Bosu Ball',
  'assisted': 'Assisted',
};
// Kata alat di depan nama mentah yang dibuang (labelnya pindah ke kurung). Urut dari yang terpanjang.
const LEAD = ['resistance band', 'olympic barbell', 'ez-barbell', 'ez barbell', 'ez bar', 'medicine ball', 'stability ball', 'bosu ball',
  'smith machine', 'trap bar', 'kettlebell', 'dumbbell', 'barbell', 'weighted', 'assisted', 'cable', 'lever', 'sled', 'smith', 'band'];
const SMALL = { a: 1, an: 1, and: 1, on: 1, of: 1, to: 1, with: 1, the: 1, in: 1, behind: 1, at: 1, or: 1, from: 1, into: 1, for: 1 };
const UPPER = { ez: 'EZ', rdl: 'RDL', jm: 'JM', ii: 'II', pov: 'POV' };
// Ejaan yang dibakukan (sebelum Title Case).
const FIX = [
  [/в°/g, '°'], [/\bv\.\s*(\d)/g, '$1'], [/\bpush-up\b/g, 'push up'], [/\bpush-ups\b/g, 'push ups'], [/\bsit-up\b/g, 'sit up'],
  [/\bsit-ups\b/g, 'sit ups'], [/\bpull-up\b/g, 'pull up'], [/\bchin-up\b/g, 'chin up'], [/\blateral pulldown\b/g, 'lat pulldown'],
  [/\bt bar\b/g, 't-bar'], [/\. /g, ' - '], [/\bexercise ball\b/g, 'stability ball'], [/\bv bar\b/g, 'v-bar'], [/\s+/g, ' '],
];

function titleWord(w, i) {
  if (!w) return w;
  const low = w.toLowerCase();
  if (UPPER[low]) return UPPER[low];
  if (i > 0 && SMALL[low]) return low;
  return w.split('-').map(function (p) { return UPPER[p] || (p.charAt(0).toUpperCase() + p.slice(1)); }).join('-');
}
function titleCase(s) { return s.split(' ').map(titleWord).join(' '); }

/** Murni: nama tampilan dari satu item library ({r|n, q}). */
function displayName(item) {
  if (OVERRIDES[item.id]) return OVERRIDES[item.id];
  let s = String(item.r || item.n || '').toLowerCase().trim();
  FIX.forEach(function (f) { s = s.replace(f[0], f[1]); });
  // Sudut kamera dan jenis kelamin model GIF bukan bagian nama gerakan.
  s = s.replace(/\s*\((?:back|side|front) pov\)/g, '').replace(/\s*\((?:male|female)\)/g, '').trim();
  for (let i = 0; i < LEAD.length; i++) {
    if (s.indexOf(LEAD[i] + ' ') === 0) { s = s.slice(LEAD[i].length + 1); break; }
  }
  // Isi kurung jadi " - keterangan" (gaya "Lat Pulldown - Close Grip (Cable)").
  const extra = [];
  s = s.replace(/\s*\(([^)]*)\)/g, function (_, x) { if (x.trim()) extra.push(x.trim()); return ''; }).trim();
  // Sudut di depan pindah ke kurung: "45° leg press" → "Leg Press (45°)".
  const ang = /^(\d+°)\s+(.*)$/.exec(s);
  if (ang) s = ang[2];
  let out = titleCase(s);
  if (ang) out += ' (' + ang[1] + ')';
  if (extra.length) out += ' - ' + extra.map(titleCase).join(', ');
  const lbl = EQUIP_LABEL[item.q];
  // Sled bersudut ("Leg Press (45°)") sudah jelas mesin; label alat tidak ditambah.
  if (lbl && !(ang && item.q === 'sled machine') && out.toLowerCase().indexOf(lbl.toLowerCase()) === -1) out += ' (' + lbl + ')';
  return out.slice(0, 80);
}

/** Murni: beri nama semua item; nama kembar dibedakan dengan angka (2, 3, …) sesuai urutan id. */
function applyNames(items) {
  const out = items.map(function (x) {
    const r = x.r || x.n;
    return Object.assign({}, x, { r: r, n: displayName(Object.assign({}, x, { r: r })) });
  });
  const seen = {};
  out.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (x) {
    const k = x.n.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) x.n = (x.n.replace(/ \(([^)]*)\)$/, '') + ' ' + seen[k] + (/ \(([^)]*)\)$/.test(x.n) ? x.n.match(/ \([^)]*\)$/)[0] : '')).slice(0, 80);
  });
  return out;
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '..', '..', '..', 'exercises', 'exercises.min.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  d.v = 2;
  d.items = applyNames(d.items);
  fs.writeFileSync(file, JSON.stringify(d));
  console.log(d.items.length + ' names → ' + file + ' (' + fs.statSync(file).size + ' bytes)');
  const gs = path.join(__dirname, '..', 'src', 'LatihanData.gs');
  fs.writeFileSync(gs, serverData(d.items));
  console.log('server index → ' + gs + ' (' + fs.statSync(gs).size + ' bytes)');
}
/** Isi src/LatihanData.gs: daftar ringkas pustaka untuk server (cocokkan nama gerakan manual, otot). */
function serverData(items) {
  const rows = items.map(function (x) { return [x.id, x.n, x.r, x.b, x.t]; });
  return '// GENERATED by tools/exercise-names.js from exercises/exercises.min.json. Do not edit by hand.\n' +
    '// [id, nama tampilan, nama mentah, bagian tubuh, otot target] per gerakan pustaka (Fase U, T-1603).\n' +
    'const EX_LIB_ = ' + JSON.stringify(rows) + ';\n';
}

module.exports = { displayName, applyNames, serverData, EQUIP_LABEL };
