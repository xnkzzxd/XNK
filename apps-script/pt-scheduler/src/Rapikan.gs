// Rapikan sheet: kecilkan grid kosong yang membuat spreadsheet berat dibuka di Chrome.
// Spreadsheet yang lama dipakai sering punya ribuan baris/kolom kosong, format sisa, validasi data dan format
// bersyarat yang menyebar ke area kosong. Semua itu ikut dimuat browser walau tidak berisi apa pun.
//
// _tidyPlan_ hanya MEMBACA dan melaporkan. _tidyRun_({apply:true}) menjalankan rencana di bawah script lock:
//   - hapus baris/kolom kosong DI LUAR data terakhir, sisakan cadangan TIDY_ROW_BUF baris dan TIDY_COL_BUF kolom;
//   - bersihkan format, validasi dan catatan hanya di kolom cadangan kanan data (baris header tidak disentuh), dan
//     catatan di baris cadangan bawah data. Format/validasi per kolom di baris cadangan bawah SENGAJA dibiarkan:
//     kode memberi format teks '@' ke kolom tanggal dan baris baru harus mewarisinya;
//   - potong rentang format bersyarat yang melewati cadangan, buang aturan yang persis sama.
// Tidak pernah: menyentuh sel berisi, menghapus sheet, atau mengubah sheet kosong yang namanya tidak dikenal kode
// (hanya dilaporkan). Kolom tidak dikecilkan di bawah TIDY_COL_MIN: kode menulis header di nomor kolom tetap.
// Dijalankan ulang = tidak ada yang dikerjakan (idempoten).

var TIDY_ROW_BUF = 50;
var TIDY_COL_BUF = 2;
var TIDY_COL_MIN = 26;                       // jumlah kolom bawaan Google; header tetap di sheet lain ≤ kolom 26
var TIDY_COL_MIN_BY_SHEET = { MemberData: 60 };   // MemberData memakai kolom tetap sampai 48
var TIDY_CELL_LIMIT = 10000000;              // batas sel per spreadsheet dari Google
var TIDY_SCAN_MAX = 200000;                  // area cadangan lebih besar dari ini tidak dipindai (dan tidak dibersihkan)
// Sheet yang dibaca/dibuat kode. tests/rapikan.test.js memastikan daftar ini lengkap.
var TIDY_KNOWN_SHEETS = ['Assessments', 'ClassGroups', 'ClientHolds', 'CoachAvailability', 'CoachTimeOff', 'Coaches', 'Content',
  'ExerciseAlias', 'FitnessTests', 'FoodLog', 'GymExercises', 'HealthScreening', 'Idem', 'KategoriKeuangan', 'Logs', 'MealTips',
  'MemberData', 'Members', 'NutritionAdvice', 'PackageEvaluations', 'Pembayaran', 'Pengeluaran', 'PesanVariasi',
  'PriceList', 'ProgramItems', 'ProgramLog', 'Progress', 'ProgressPhotos', 'PushOutbox', 'PushSubs', 'ReminderLog',
  'RenewalRequests', 'Schedules', 'SessionNotes', 'SessionRatings', 'Tagihan', 'TaskTemplates', 'Tasks', 'WorkoutLog',
  'WorkoutSessions'];

/**
 * Laporan rapikan sheet (tanpa mengubah apa pun). Hanya pemilik, dari editor Apps Script (lihat Logs).
 * @return {Object} laporan _tidyPlan_
 */
function rapikanSheet() {
  requireOwner_();
  const r = _tidyRun_({ apply: false });
  Logger.log(_tidyText_(r));
  return r;
}

/**
 * Jalankan rapikan sheet sekarang (hapus grid kosong di luar data). Hanya pemilik, dari editor Apps Script.
 * Jalankan rapikanSheet dulu untuk melihat rencananya.
 * @return {Object} {applied, done[], before, after}
 */
function rapikanSheetSekarang() {
  requireOwner_();
  const r = _tidyRun_({ apply: true });
  Logger.log(_tidyText_(r));
  return r;
}

/** Inti bersama produksi dan Library (XNK.tidySheets). Pemanggil sudah memeriksa pemilik. */
function _tidyRun_(opts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!opts || !opts.apply) return _tidyPlan_(ss.getSheets().map(_tidySnap_));
  return _locked_(function () {
    const snaps = ss.getSheets().map(_tidySnap_);
    const before = _tidyPlan_(snaps);
    const done = [];
    snaps.forEach(function (s, i) {
      const p = before.sheets[i];
      if (p.todo) done.push(_tidyApplySheet_(s, p));
    });
    if (done.length) SpreadsheetApp.flush();
    const after = _tidyPlan_(ss.getSheets().map(_tidySnap_));
    return { applied: true, done: done, before: before, after: after };
  });
}

/** Batas yang disisakan: data + cadangan, tidak di bawah kolom minimum dan baris/kolom beku, tidak lebih dari grid. */
function _tidyKeep_(s) {
  const colMin = Object.prototype.hasOwnProperty.call(TIDY_COL_MIN_BY_SHEET, s.name) ? TIDY_COL_MIN_BY_SHEET[s.name] : TIDY_COL_MIN;
  const rows = Math.max(s.lastRow + TIDY_ROW_BUF, (s.frozenRows || 0) + 1, 1);
  const cols = Math.max(s.lastCol + TIDY_COL_BUF, colMin, (s.frozenCols || 0) + 1, 1);
  return { rows: Math.min(s.maxRows, rows), cols: Math.min(s.maxCols, cols) };
}

/** Baca satu sheet (hanya baca). */
function _tidySnap_(sheet) {
  const name = sheet.getName();
  const s = {
    sheet: sheet, name: name,
    maxRows: sheet.getMaxRows(), maxCols: sheet.getMaxColumns(),
    lastRow: sheet.getLastRow(), lastCol: sheet.getLastColumn(),
    frozenRows: sheet.getFrozenRows(), frozenCols: sheet.getFrozenColumns(),
    hidden: !!sheet.isSheetHidden(),
  };
  const keep = _tidyKeep_(s);
  s.rules = sheet.getConditionalFormatRules();
  s.cf = s.rules.map(function (rule) {
    return { cond: _tidyCfCond_(rule), ranges: rule.getRanges().map(function (r) {
      return { r: r.getRow(), c: r.getColumn(), nr: r.getNumRows(), nc: r.getNumColumns() };
    }) };
  });
  // Kolom cadangan kanan data (tanpa baris header): format, validasi, catatan.
  s.colBuf = null;
  const startRow = s.lastRow >= 1 ? 2 : 1;
  const cbRows = keep.rows - startRow + 1, cbCols = keep.cols - s.lastCol;
  if (cbRows > 0 && cbCols > 0) {
    if (cbRows * cbCols > TIDY_SCAN_MAX) s.colBuf = { r: startRow, c: s.lastCol + 1, nr: cbRows, nc: cbCols, marks: -1 };
    else {
      const rg = sheet.getRange(startRow, s.lastCol + 1, cbRows, cbCols);
      const dv = rg.getDataValidations(), notes = rg.getNotes(), bg = rg.getBackgrounds();
      let marks = 0;
      for (let i = 0; i < cbRows; i++) for (let j = 0; j < cbCols; j++) {
        if (dv[i][j] || notes[i][j] || _tidyBgSet_(bg[i][j])) marks++;
      }
      s.colBuf = { r: startRow, c: s.lastCol + 1, nr: cbRows, nc: cbCols, marks: marks };
    }
  }
  // Baris cadangan bawah data: hanya catatan.
  s.rowNotes = 0;
  const rbRows = keep.rows - s.lastRow;
  if (s.lastRow >= 1 && s.lastCol >= 1 && rbRows > 0) {
    s.rowNotes = sheet.getRange(s.lastRow + 1, 1, rbRows, s.lastCol).getNotes()
      .reduce(function (n, line) { return n + line.filter(function (v) { return !!v; }).length; }, 0);
  }
  // Validasi sampai ujung grid? (satu baris contoh: baris terakhir grid, bila baris itu akan dihapus)
  s.dvFar = false;
  if (s.maxRows > keep.rows && keep.cols >= 1) {
    s.dvFar = sheet.getRange(s.maxRows, 1, 1, keep.cols).getDataValidations()[0].some(function (v) { return !!v; });
  }
  return s;
}

/** Latar sel yang bukan putih/bawaan. */
function _tidyBgSet_(bg) {
  const v = String(bg || '').toLowerCase();
  return !!v && v !== '#ffffff' && v !== 'white';
}

/** Isi aturan format bersyarat sebagai teks pembanding; null = tidak terbaca (aturan itu tidak pernah dianggap kembar). */
function _tidyCfCond_(rule) {
  const val = function (v) { return v && typeof v.getA1Notation === 'function' ? 'R:' + v.getA1Notation() : v; };
  try {
    const out = {};
    const b = rule.getBooleanCondition();
    if (b) out.b = [String(b.getCriteriaType()), (b.getCriteriaValues() || []).map(val), b.getBackground(), b.getFontColor(),
      b.getBold(), b.getItalic(), b.getStrikethrough(), b.getUnderline()];
    const g = rule.getGradientCondition();
    if (g) out.g = [g.getMinColor(), String(g.getMinType()), g.getMinValue(), g.getMidColor(), String(g.getMidType()),
      g.getMidValue(), g.getMaxColor(), String(g.getMaxType()), g.getMaxValue()];
    if (!out.b && !out.g) return null;
    return JSON.stringify(out);
  } catch (e) {
    return null;
  }
}

/** Potong rentang ke batas sisa; null = seluruhnya di luar batas. */
function _tidyClip_(rg, keep) {
  if (rg.r > keep.rows || rg.c > keep.cols) return null;
  return { r: rg.r, c: rg.c, nr: Math.min(rg.nr, keep.rows - rg.r + 1), nc: Math.min(rg.nc, keep.cols - rg.c + 1) };
}

/** Aturan format bersyarat setelah dipotong dan tanpa kembar: [{i (indeks asal), ranges, changed}]. */
function _tidyCfPlan_(cf, keep) {
  const seen = {}, out = [];
  cf.forEach(function (rule, i) {
    let changed = false;
    const ranges = [];
    rule.ranges.forEach(function (rg) {
      const c = _tidyClip_(rg, keep);
      if (!c) { changed = true; return; }
      if (c.nr !== rg.nr || c.nc !== rg.nc) changed = true;
      ranges.push(c);
    });
    if (!ranges.length) return;
    if (rule.cond != null) {
      const key = rule.cond + '|' + JSON.stringify(ranges);
      if (seen[key]) return;
      seen[key] = true;
    }
    out.push({ i: i, ranges: ranges, changed: changed });
  });
  return out;
}

/**
 * Rencana murni dari hasil _tidySnap_ (tanpa layanan Google).
 * @param {Object[]} snaps
 * @return {{sheets: Object[], cellsBefore, cellsAfter, pctBefore, pctAfter, todo, emptyUnknown: string[], limit}}
 */
function _tidyPlan_(snaps) {
  const known = {};
  TIDY_KNOWN_SHEETS.forEach(function (n) { known[n] = true; });
  const sheets = snaps.map(function (s) {
    const keep = _tidyKeep_(s);
    const empty = s.lastRow === 0 && s.lastCol === 0;
    const isKnown = !!known[s.name];
    const p = {
      name: s.name, known: isKnown, hidden: !!s.hidden, empty: empty,
      maxRows: s.maxRows, maxCols: s.maxCols, lastRow: s.lastRow, lastCol: s.lastCol,
      keepRows: keep.rows, keepCols: keep.cols,
      delRows: s.maxRows - keep.rows, delCols: s.maxCols - keep.cols,
      cellsBefore: s.maxRows * s.maxCols, cellsAfter: keep.rows * keep.cols,
      cfRules: s.cf.length, cfReachRow: 0, cfReachCol: 0, cfTrim: 0, cfDup: 0,
      clearCells: s.colBuf && s.colBuf.marks > 0 ? s.colBuf.marks : 0,
      bufScanned: !(s.colBuf && s.colBuf.marks < 0),
      rowNotes: s.rowNotes || 0, dvFar: !!s.dvFar, todo: false, skip: '',
    };
    s.cf.forEach(function (rule) {
      rule.ranges.forEach(function (rg) {
        p.cfReachRow = Math.max(p.cfReachRow, rg.r + rg.nr - 1);
        p.cfReachCol = Math.max(p.cfReachCol, rg.c + rg.nc - 1);
      });
    });
    const cfNew = _tidyCfPlan_(s.cf, keep);
    p.cfTrim = cfNew.filter(function (x) { return x.changed; }).length + (s.cf.length - cfNew.length);
    p.cfDup = s.cf.length - cfNew.length - s.cf.filter(function (rule) {
      return rule.ranges.every(function (rg) { return !_tidyClip_(rg, keep); });
    }).length;
    if (empty && !isKnown) {
      // Sheet kosong yang tidak dikenal kode: hanya dilaporkan, tidak diubah.
      p.skip = 'kosong-tak-dikenal';
      p.delRows = 0; p.delCols = 0; p.cellsAfter = p.cellsBefore; p.cfTrim = 0; p.cfDup = 0; p.clearCells = 0; p.rowNotes = 0;
    }
    p.todo = !p.skip && (p.delRows > 0 || p.delCols > 0 || p.cfTrim > 0 || p.clearCells > 0 || p.rowNotes > 0);
    return p;
  });
  const sum = function (k) { return sheets.reduce(function (n, p) { return n + p[k]; }, 0); };
  const before = sum('cellsBefore'), after = sum('cellsAfter');
  const pct = function (n) { return Math.round(n / TIDY_CELL_LIMIT * 1000) / 10; };
  return {
    sheets: sheets, cellsBefore: before, cellsAfter: after, pctBefore: pct(before), pctAfter: pct(after),
    todo: sheets.filter(function (p) { return p.todo; }).length,
    emptyUnknown: sheets.filter(function (p) { return p.skip === 'kosong-tak-dikenal'; }).map(function (p) { return p.name; }),
    limit: TIDY_CELL_LIMIT, rowBuf: TIDY_ROW_BUF, colBuf: TIDY_COL_BUF,
  };
}

/** Jalankan rencana satu sheet. s = hasil _tidySnap_ (dengan objek sheet dan aturan asli), p = rencananya. */
function _tidyApplySheet_(s, p) {
  const sheet = s.sheet, keep = { rows: p.keepRows, cols: p.keepCols };
  const out = { name: s.name, delRows: 0, delCols: 0, cfRemoved: 0, cfTrimmed: 0, cleared: 0, notes: 0 };
  // 1. Format bersyarat dulu (rentangnya masih menunjuk grid lama).
  if (p.cfTrim > 0) {
    const plan = _tidyCfPlan_(s.cf, keep);
    const rules = plan.map(function (x) {
      const rule = s.rules[x.i];
      if (!x.changed) return rule;
      out.cfTrimmed++;
      return rule.copy().setRanges(x.ranges.map(function (rg) { return sheet.getRange(rg.r, rg.c, rg.nr, rg.nc); })).build();
    });
    out.cfRemoved = s.rules.length - rules.length;
    sheet.setConditionalFormatRules(rules);
  }
  // 2. Bersihkan cadangan (sebelum menghapus, koordinatnya sama).
  if (p.clearCells > 0 && s.colBuf) {
    sheet.getRange(s.colBuf.r, s.colBuf.c, s.colBuf.nr, s.colBuf.nc).clearFormat().clearDataValidations().clearNote();
    out.cleared = p.clearCells;
  }
  if (p.rowNotes > 0) {
    sheet.getRange(s.lastRow + 1, 1, p.keepRows - s.lastRow, s.lastCol).clearNote();
    out.notes = p.rowNotes;
  }
  // 3. Hapus grid kosong di luar data + cadangan. Pengaman terakhir: jangan pernah sampai ke data.
  if (p.delRows > 0) {
    if (p.keepRows < sheet.getLastRow()) throw new Error('Rapikan dibatalkan: data di ' + s.name + ' berubah. Coba lagi.');
    sheet.deleteRows(p.keepRows + 1, p.delRows);
    out.delRows = p.delRows;
  }
  if (p.delCols > 0) {
    if (p.keepCols < sheet.getLastColumn()) throw new Error('Rapikan dibatalkan: data di ' + s.name + ' berubah. Coba lagi.');
    sheet.deleteColumns(p.keepCols + 1, p.delCols);
    out.delCols = p.delCols;
  }
  return out;
}

/** Pastikan grid punya n baris kosong setelah data (untuk tulis banyak baris sekaligus lewat getRange). */
function _ensureRoomRows_(sheet, n) {
  const need = sheet.getLastRow() + n - sheet.getMaxRows();
  if (need > 0) sheet.insertRowsAfter(sheet.getMaxRows(), need);
}

/** Laporan singkat berbahasa Indonesia (Logs editor, dialog). */
function _tidyText_(r) {
  const plan = r.applied ? r.after : r;
  const fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  const lines = [];
  if (r.applied) {
    const b = r.before;
    lines.push('Selesai. Sel: ' + fmt(b.cellsBefore) + ' → ' + fmt(plan.cellsBefore) + ' (' + b.pctBefore + '% → ' + plan.pctBefore + '% dari batas Google).');
    r.done.forEach(function (d) {
      const bits = [];
      if (d.delRows) bits.push(fmt(d.delRows) + ' baris');
      if (d.delCols) bits.push(fmt(d.delCols) + ' kolom');
      if (d.cfRemoved || d.cfTrimmed) bits.push((d.cfRemoved + d.cfTrimmed) + ' format bersyarat');
      if (d.cleared) bits.push(fmt(d.cleared) + ' sel format/validasi');
      if (d.notes) bits.push(d.notes + ' catatan');
      lines.push('• ' + d.name + ': ' + (bits.join(', ') || 'dirapikan'));
    });
    if (!r.done.length) lines.push('Tidak ada yang perlu dirapikan.');
  } else {
    lines.push('Sel: ' + fmt(plan.cellsBefore) + ' (' + plan.pctBefore + '% dari batas Google) → ' + fmt(plan.cellsAfter) + ' (' + plan.pctAfter + '%).');
    plan.sheets.filter(function (p) { return p.todo; }).forEach(function (p) {
      const bits = [];
      if (p.delRows) bits.push('hapus ' + fmt(p.delRows) + ' baris kosong');
      if (p.delCols) bits.push('hapus ' + fmt(p.delCols) + ' kolom kosong');
      if (p.cfTrim) bits.push(p.cfTrim + ' format bersyarat');
      if (p.clearCells) bits.push(fmt(p.clearCells) + ' sel format/validasi');
      if (p.rowNotes) bits.push(p.rowNotes + ' catatan');
      lines.push('• ' + p.name + ' (data ' + fmt(p.lastRow) + ' × ' + p.lastCol + '): ' + bits.join(', '));
    });
    if (!plan.todo) lines.push('Tidak ada yang perlu dirapikan.');
  }
  if (plan.emptyUnknown.length) lines.push('Sheet kosong yang tidak dipakai aplikasi (hapus sendiri bila tidak perlu): ' + plan.emptyUnknown.join(', ') + '.');
  return lines.join('\n');
}
