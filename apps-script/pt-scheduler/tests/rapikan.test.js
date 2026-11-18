'use strict';
// Rapikan sheet: grid kosong di luar data dikecilkan tanpa pernah menyentuh isi, header, atau sheet yang tidak dikenal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./harness');

const OWNER = 'owner@example.com';
const clone = x => JSON.parse(JSON.stringify(x));

/** Aturan format bersyarat palsu seperti ConditionalFormatRule (copy → setRanges → build). */
function cfRule(ranges, cond) {
  return {
    _ranges: ranges, cond,
    getRanges() { return this._ranges.slice(); },
    getBooleanCondition() {
      if (!cond) return null;
      return { getCriteriaType: () => cond.type, getCriteriaValues: () => cond.values || [], getBackground: () => cond.bg || null,
        getFontColor: () => null, getBold: () => null, getItalic: () => null, getStrikethrough: () => null, getUnderline: () => null };
    },
    getGradientCondition() { return null; },
    copy() { let rs = null; return { setRanges(x) { rs = x; return this; }, build: () => cfRule(rs, cond) }; },
  };
}
const RED = { type: 'TEXT_EQUAL_TO', values: ['Batal'], bg: '#ff0000' };
const GREEN = { type: 'TEXT_EQUAL_TO', values: ['Selesai'], bg: '#00ff00' };

function setup() {
  const env = createEnv({ activeUserEmail: OWNER, effectiveUserEmail: OWNER });
  const ss = env.ss;
  // MemberData: 3 baris data × 5 kolom, grid 5000 × 80, baris header beku.
  const md = ss.seed('MemberData', [['ID', 'Nama', 'HP', 'Paket', 'Catatan'], ['M1', 'Ani', '0812', 'A', ''], ['M2', 'Budi', '0813', 'B', 'x']]);
  md.maxRows = 5000; md.maxCols = 80; md.frozenRows = 1;
  // Schedules: 10 baris × 13 kolom, grid bawaan 1000 × 26.
  const rows = [Array.from({ length: 13 }, (_, i) => 'H' + (i + 1))];
  for (let i = 1; i < 10; i++) rows.push(Array.from({ length: 13 }, (_, j) => 'S' + i + '-' + j));
  const sc = ss.seed('Schedules', rows);
  sc.cfRules = [
    cfRule([sc.getRange(2, 9, 999, 1)], RED),     // I2:I1000 → dipotong ke baris 60
    cfRule([sc.getRange(2, 9, 999, 1)], RED),     // kembar persis → dibuang
    cfRule([sc.getRange(2, 9, 999, 1)], GREEN),   // syarat lain, rentang sama → tetap ada
    cfRule([sc.getRange(900, 1, 50, 3)], GREEN),  // seluruhnya di area yang dihapus → dibuang
    cfRule([sc.getRange(2, 1, 9, 2)], null),      // tak terbaca: tidak pernah dianggap kembar
    cfRule([sc.getRange(2, 1, 9, 2)], null),
  ];
  sc.getRange(5, 20).setDataValidation({ list: ['Ya', 'Tidak'] });   // kolom cadangan kanan data → dibersihkan
  sc.getRange(1, 20).setBackground('#ffff00');                      // baris header → tidak disentuh
  sc.getRange(3, 18).setBackground('#ffff00');                      // kolom cadangan → dibersihkan
  sc.getRange(20, 3).setDataValidation({ list: ['Ya'] });           // validasi per kolom di baris cadangan → tetap
  sc.getRange(1000, 3).setDataValidation({ list: ['Ya'] });         // menyebar sampai ujung grid
  sc.getRange(15, 2).setNote('sisa');                               // catatan di baris cadangan → dihapus
  // Sheet kosong: satu dikenal kode, satu tidak.
  const tasks = ss.seed('Tasks', []); tasks.maxRows = 1000;
  const lain = ss.seed('Sheet5', []); lain.maxRows = 1000; lain.hidden = true;
  lain.getRange(10, 3).setBackground('#ff0000');
  // Sheet sudah rapi: 70 baris data, grid pas data + 50.
  const rapi = ss.seed('Progress', Array.from({ length: 70 }, (_, i) => ['P' + i, i]));
  rapi.maxRows = 120;
  return { env, ss, md, sc, tasks, lain, rapi };
}

test('planner reports grid, conditional formats, validations and empty sheets without changing anything', () => {
  const { env, md, sc, lain } = setup();
  const before = clone([md.rows, sc.rows, sc.marks, md.getMaxRows(), sc.cfRules.length]);
  const r = env.call('rapikanSheet');
  assert.deepEqual(clone([md.rows, sc.rows, sc.marks, md.getMaxRows(), sc.cfRules.length]), before, 'dry run changes nothing');
  const by = Object.fromEntries(r.sheets.map(p => [p.name, p]));

  const m = by.MemberData;
  assert.equal(m.lastRow, 3); assert.equal(m.lastCol, 5);
  assert.equal(m.keepRows, 53); assert.equal(m.keepCols, 60, 'MemberData keeps its fixed columns');
  assert.equal(m.delRows, 4947); assert.equal(m.delCols, 20);
  assert.equal(m.cellsBefore, 400000); assert.equal(m.cellsAfter, 53 * 60);
  assert.ok(m.todo);

  const s = by.Schedules;
  assert.equal(s.keepRows, 60); assert.equal(s.keepCols, 26);
  assert.equal(s.delRows, 940); assert.equal(s.delCols, 0);
  assert.equal(s.cfRules, 6);
  assert.equal(s.cfReachRow, 1000);
  assert.equal(s.cfDup, 1, 'one exact duplicate');
  assert.equal(s.cfTrim, 4, 'two trimmed rules + one duplicate + one fully outside');
  assert.equal(s.clearCells, 2, 'validation + background right of the data, header row excluded');
  assert.equal(s.rowNotes, 1);
  assert.equal(s.dvFar, true);

  assert.equal(by.Tasks.empty, true); assert.equal(by.Tasks.known, true); assert.equal(by.Tasks.delRows, 950);
  assert.equal(by.Sheet5.skip, 'kosong-tak-dikenal'); assert.equal(by.Sheet5.todo, false); assert.equal(by.Sheet5.hidden, true);
  assert.deepEqual(r.emptyUnknown, ['Sheet5']);
  assert.equal(by.Progress.todo, false, 'already tidy');

  assert.equal(r.cellsBefore, 400000 + 26000 + 26000 + 26000 + 120 * 26);
  assert.equal(r.pctBefore, Math.round(r.cellsBefore / 1e7 * 1000) / 10);
  assert.ok(r.cellsAfter < r.cellsBefore);
  assert.equal(r.todo, 3);
  assert.equal(lain.getMaxRows(), 1000);
  assert.match(env.context._tidyText_(r), /Sheet5/);
});

test('apply removes only empty grid beyond the data, keeps data, headers and unknown sheets; a second run does nothing', () => {
  const { env, md, sc, tasks, lain, rapi } = setup();
  const data = clone([md.rows, sc.rows, rapi.rows]);
  const r = env.call('rapikanSheetSekarang');
  assert.equal(r.applied, true);
  assert.deepEqual(clone([md.rows, sc.rows, rapi.rows]), data, 'no cell with content changed');

  assert.equal(md.getMaxRows(), 53); assert.equal(md.getMaxColumns(), 60);
  assert.equal(sc.getMaxRows(), 60); assert.equal(sc.getMaxColumns(), 26);
  assert.equal(tasks.getMaxRows(), 50);
  assert.equal(lain.getMaxRows(), 1000, 'unknown empty sheet untouched');
  assert.equal(lain.marks.bg['10,3'], '#ff0000');
  assert.equal(rapi.getMaxRows(), 120);
  assert.equal(env.ss.getSheets().length, 5, 'no sheet deleted');

  // Format bersyarat: dipotong ke baris 60, kembar dan yang di luar dibuang, yang tak terbaca tetap dua.
  const cf = sc.getConditionalFormatRules();
  assert.equal(cf.length, 4);
  assert.deepEqual(clone(cf.map(x => x.cond && x.cond.values[0])), ['Batal', 'Selesai', null, null]);
  assert.deepEqual(clone(cf.slice(0, 2).map(x => x.getRanges()[0].getA1Notation())), ['I2:I60', 'I2:I60']);

  assert.equal(sc.marks.dv['5,20'], undefined, 'validation right of the data cleared');
  assert.equal(sc.marks.bg['3,18'], undefined);
  assert.equal(sc.marks.bg['1,20'], '#ffff00', 'header row untouched');
  assert.deepEqual(clone(sc.marks.dv['20,3']), { list: ['Ya'] }, 'column validation below the data kept for new rows');
  assert.equal(sc.marks.note['15,2'], undefined);

  assert.equal(r.after.todo, 0);
  assert.deepEqual(r.after.emptyUnknown, ['Sheet5']);
  const writes = sc.cfWrites;
  const again = env.call('rapikanSheetSekarang');
  assert.deepEqual(clone(again.done), [], 'second run is a no-op');
  assert.equal(sc.cfWrites, writes);
  assert.equal(env.call('rapikanSheet').todo, 0);
});

test('apply stops before touching data that appeared after the plan', () => {
  const { env, sc } = setup();
  const snaps = env.ss.getSheets().map(env.context._tidySnap_);
  const plan = env.context._tidyPlan_(snaps);
  const i = plan.sheets.findIndex(p => p.name === 'Schedules');
  sc.getRange(500, 1).setValue('baru');   // data baru di area yang direncanakan untuk dihapus
  assert.throws(() => env.context._tidyApplySheet_(snaps[i], plan.sheets[i]), /data di Schedules berubah/);
  assert.equal(sc.getRange(500, 1).getValue(), 'baru');
});

test('rapikanSheet is owner-only', () => {
  const { env } = setup();
  env.activeUserEmail = 'tamu@example.com';
  assert.throws(() => env.call('rapikanSheet'), /pemilik/);
  assert.throws(() => env.call('rapikanSheetSekarang'), /pemilik/);
  env.activeUserEmail = '';
  assert.throws(() => env.call('rapikanSheetSekarang'), /pemilik/);
});

test('after tidying, batch writes still fit: _ensureRoomRows_ grows the grid first', () => {
  const { env, sc } = setup();
  env.call('rapikanSheetSekarang');
  sc.strictGrid = true;
  const rows = Array.from({ length: 80 }, (_, i) => Array.from({ length: 13 }, () => 'n' + i));
  assert.throws(() => sc.getRange(sc.getLastRow() + 1, 1, rows.length, 13), /outside the dimensions/);
  env.context._ensureRoomRows_(sc, rows.length);
  sc.getRange(sc.getLastRow() + 1, 1, rows.length, 13).setValues(rows);
  assert.equal(sc.getLastRow(), 90);
});

test('TIDY_KNOWN_SHEETS lists every sheet name the code reads or creates', () => {
  const env = createEnv();
  const known = new Set(env.context.TIDY_KNOWN_SHEETS);
  const src = path.join(__dirname, '..', 'src');
  const found = new Set();
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.gs'))) {
    const t = fs.readFileSync(path.join(src, f), 'utf8');
    for (const m of t.matchAll(/[A-Za-z_]*[Ss]heet[A-Za-z_]*\(\s*'([A-Z][A-Za-z]+)'/g)) found.add(m[1]);
    for (const m of t.matchAll(/_SHEET\s*=\s*'([A-Za-z]+)'/g)) found.add(m[1]);
  }
  const fin = fs.readFileSync(path.join(src, 'Keuangan.gs'), 'utf8').match(/const FIN_TABLES = \{([\s\S]*?)\n\};/)[1];
  for (const m of fin.matchAll(/^\s*([A-Za-z]+):\s*\[/gm)) found.add(m[1]);
  const dates = fs.readFileSync(path.join(src, 'Kode.gs'), 'utf8').match(/const DATE_TEXT_SHEETS_ = \[([^\]]*)\]/)[1];
  for (const m of dates.matchAll(/'([A-Za-z]+)'/g)) found.add(m[1]);
  assert.ok(found.has('Tagihan') && found.has('MemberData') && found.has('PushOutbox'));
  const missing = [...found].filter(n => !known.has(n)).sort();
  assert.deepEqual(missing, [], 'add these to TIDY_KNOWN_SHEETS in src/Rapikan.gs');
});
