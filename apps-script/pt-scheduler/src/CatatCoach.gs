// =============================================================================
// CatatCoach.gs — Fase AD3 (T-2420…T-2428): alat catat untuk coach di panel.
// Setelan alat & cue per klien per gerakan (sheet ExerciseNotes), hapus catatan latihan, riwayat per gerakan (365 hari),
// coach mencatat / menghapus makanan klien, tanggapan harian coach atas catatan makan (sheet FoodFeedback),
// dan ringkasan makan 31 hari. Logger klien dan catatan makan klien tidak diubah; klien hanya MEMBACA setelan/cue
// (di logger, lewat _workoutFor_.notes) dan tanggapan harian (di Makan, lewat _nutritionFor_.feedback).
// docs/coachkit/Design.md §AD3.
// =============================================================================

const EXNOTE_HEADERS = ['ID', 'Member ID', 'Exercise Key', 'Setelan', 'Cue', 'Diubah Pada', 'Oleh'];
const FOODFB_HEADERS = ['ID', 'Member ID', 'Tanggal', 'Tanda', 'Catatan', 'Oleh', 'Diubah Pada'];
const FOODFB_MARKS = ['', 'pas', 'kurang', 'lebih'];
const COACHLOG = { setelanMax: 80, cueMax: 120, keyMax: 120, fbNoteMax: 160, fbDaysClient: 14, foodDaysMax: 31, foodBackDays: 30, histDays: 365, histMax: 60 };

// ── Setelan alat & cue (W3) ───────────────────────────────────────────────────

function _exNoteSheet_() { return getOrCreateSheet_('ExerciseNotes', EXNOTE_HEADERS); }
/** { exerciseKey: { setelan, cue } } milik satu klien. */
function _exNotesFor_(memberId) {
  const id = String(memberId).trim(), out = {};
  _sheetRowsMemo_('ExerciseNotes').forEach(function(r) {
    if (!r[0] || String(r[1]).trim() !== id) return;
    const k = String(r[2] || '');
    if (k) out[k] = { setelan: String(r[3] == null ? '' : r[3]), cue: String(r[4] == null ? '' : r[4]) };
  });
  return out;
}

/** Admin: setelan alat dan cue untuk satu gerakan klien. Keduanya kosong = hapus. Klien melihatnya (baca saja) di logger. */
function saveExerciseNote(token, memberId, exKey, data) {
  requireAdmin_(token);
  data = data || {};
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const key = String(exKey == null ? '' : exKey).trim();
  if (!key || key.length > COACHLOG.keyMax) throw new Error('Gerakan tidak dikenal.');
  const setelan = _careStr_(data.setelan, COACHLOG.setelanMax, 'Setelan alat'), cue = _careStr_(data.cue, COACHLOG.cueMax, 'Cue');
  _locked_(function() {
    const sheet = _exNoteSheet_(), rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][1]).trim() !== id || String(rows[i][2]) !== key) continue;
      if (!setelan && !cue) { sheet.deleteRow(i + 1); return; }
      sheet.getRange(i + 1, 4, 1, 4).setValues([[setelan, cue, new Date().toISOString(), 'admin']]);
      return;
    }
    if (!setelan && !cue) return;
    _appendRow_(sheet, ['EXN-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), id, key, setelan, cue, new Date().toISOString(), 'admin']);
  });
  _bumpMember_(id);
  return { status: 'success', notes: _exNotesFor_(id) };
}

// ── Hapus catatan latihan (W4) ────────────────────────────────────────────────

/** Admin: hapus gerakan tertentu (keys) atau seluruh hari (keys kosong) dari catatan latihan klien, siapa pun yang mencatat. */
function deleteWorkoutEntries(token, memberId, date, keys) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const day = String(date || '').trim();
  if (!_validDate_(day)) throw new Error('Tanggal tidak valid.');
  const want = {};
  (Array.isArray(keys) ? keys : []).forEach(function(k) { if (k) want[String(k)] = true; });
  const whole = !Object.keys(want).length;
  const removed = _locked_(function() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkoutLog');
    let n = 0;
    if (sheet && sheet.getLastRow() >= 2) {
      const rows = sheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        const r = rows[i];
        if (!r[0] || String(r[1]).trim() !== id || _isoDateCell_(r[2]) !== day) continue;
        if (!whole && !want[_exKeyOf_(r[6], r[7])] && !want[_workoutKey_(r[6], r[7])]) continue;
        sheet.deleteRow(i + 1);
        n++;
      }
    }
    if (whole) {
      const ses = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkoutSessions');
      if (ses && ses.getLastRow() >= 2) {
        const sr = ses.getDataRange().getValues();
        for (let i = sr.length - 1; i >= 1; i--) if (String(sr[i][1]).trim() === id && _isoDateCell_(sr[i][2]) === day) ses.deleteRow(i + 1);
      }
    }
    return n;
  });
  if (!removed) throw new Error('Catatan latihan tidak ditemukan.');
  _bumpMember_(id);
  const out = _workoutFor_(m.row);
  out.removed = removed;
  return out;
}

// ── Riwayat satu gerakan (W5) ─────────────────────────────────────────────────

/** Admin, baca saja: semua sesi satu gerakan dalam 365 hari (terbaru dulu, maks 60). */
function getWorkoutExerciseHistory(token, memberId, exKey) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim(), key = String(exKey == null ? '' : exKey).trim();
  const since = _addDaysIso_(_todayWib_(), -COACHLOG.histDays), by = {};
  _workoutRowsOf_(id).forEach(function(r) {
    const t = _isoDateCell_(r[2]);
    if (t < since || (_exKeyOf_(r[6], r[7]) !== key && _workoutKey_(r[6], r[7]) !== key)) return;
    const d = by[t] || (by[t] = { tanggal: t, oleh: String(r[17] || ''), sets: [] });
    d.sets.push({ set: Number(r[10]) || d.sets.length + 1, berat: r[11] === '' ? '' : Number(r[11]), rep: r[12] === '' ? '' : Number(r[12]),
      durasi: r[13] === '' ? '' : Number(r[13]), jarak: r[14] === '' ? '' : Number(r[14]), jenis: String(r[19] || ''), e1rm: _isWarmup_(r[19]) ? 0 : _e1rm_(r[11], r[12]) });
  });
  const days = Object.keys(by).sort().reverse().slice(0, COACHLOG.histMax).map(function(t) {
    const d = by[t];
    d.sets.sort(function(a, b) { return a.set - b.set; });
    d.top = d.sets.reduce(function(x, s) { return Math.max(x, s.e1rm || 0); }, 0);
    return d;
  });
  return { key: key, days: days };
}

// ── Catatan makan oleh coach (F1) ─────────────────────────────────────────────

/** Admin: catat makanan untuk klien (mis. dari foto di WhatsApp). CID diawali 'coach-' = tanda "dicatat coach". */
function logClientFood(token, memberId, entry) {
  requireAdmin_(token);
  if (!_nutEnabled_()) throw new Error('Fitur gizi sedang dimatikan.');
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  entry = entry || {};
  const raw = String(entry.cid == null ? '' : entry.cid).trim();
  if (raw && !/^[A-Za-z0-9_-]{1,32}$/.test(raw)) throw new Error('Kode catatan tidak valid.');
  const cid = 'coach-' + (raw || Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  const day = _foodLogDayArg_(entry.tanggal, COACHLOG.foodBackDays);
  const e = _foodLogEntry_(entry);
  e.cid = cid;
  _locked_(function() {
    const sheet = _foodLogSheet_();
    _ensureFoodLogCid_(sheet);
    const rows = _foodLogRows_(id);
    if (rows.some(function(r) { return r.cid === cid; })) return;   // kiriman ulang
    if (rows.filter(function(r) { return r.tanggal === day; }).length >= FOODLOG_LIMITS.perDay) throw new Error('Catatan hari itu sudah penuh.');
    _foodLogAppend_(sheet, id, day, e);
  });
  _bumpMember_(id);
  return getClientFoodLog(token, id, entry.days);
}

/** Admin: hapus satu catatan makan klien (siapa pun yang mencatat). */
function deleteClientFood(token, memberId, logId, days) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  _locked_(function() {
    const sheet = _foodLogSheet_(), data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(logId) && String(data[i][1]).trim() === id) { sheet.deleteRow(i + 1); return; }
    }
    throw new Error('Catatan tidak ditemukan.');
  });
  _bumpMember_(id);
  return getClientFoodLog(token, id, days);
}

// ── Tanggapan harian coach atas catatan makan (F2) ────────────────────────────

function _foodFbSheet_() { const s = getOrCreateSheet_('FoodFeedback', FOODFB_HEADERS); s.getRange('C:C').setNumberFormat('@'); return s; }
/** { 'YYYY-MM-DD': { tanda, catatan } } untuk `days` hari terakhir. */
function _foodFeedbackFor_(memberId, days) {
  const id = String(memberId).trim(), since = _addDaysIso_(_todayWib_(), -(days || COACHLOG.foodDaysMax)), out = {};
  _sheetRowsMemo_('FoodFeedback').forEach(function(r) {
    if (!r[0] || String(r[1]).trim() !== id) return;
    const t = _isoDateCell_(r[2]);
    if (t >= since) out[t] = { tanda: String(r[3] || ''), catatan: String(r[4] == null ? '' : r[4]) };
  });
  return out;
}
/** Admin: tanda (pas / kurang / lebih) dan catatan singkat untuk satu hari makan klien. Keduanya kosong = hapus. Klien melihatnya. */
function saveFoodFeedback(token, memberId, date, data) {
  requireAdmin_(token);
  data = data || {};
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim(), today = _todayWib_();
  const day = String(date || '').trim();
  if (!_validDate_(day) || day > today || day < _addDaysIso_(today, -COACHLOG.foodDaysMax)) throw new Error('Tanggal tidak valid.');
  const tanda = String(data.tanda || '').trim();
  if (FOODFB_MARKS.indexOf(tanda) === -1) throw new Error('Pilih pas, kurang, atau lebih.');
  const catatan = _careStr_(data.catatan, COACHLOG.fbNoteMax, 'Catatan');
  _locked_(function() {
    const sheet = _foodFbSheet_(), rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][1]).trim() !== id || _isoDateCell_(rows[i][2]) !== day) continue;
      if (!tanda && !catatan) { sheet.deleteRow(i + 1); return; }
      sheet.getRange(i + 1, 4, 1, 4).setValues([[tanda, catatan, 'admin', new Date().toISOString()]]);
      return;
    }
    if (!tanda && !catatan) return;
    _appendRow_(sheet, ['FFB-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000), id, day, tanda, catatan, 'admin', new Date().toISOString()]);
  });
  _bumpMember_(id);
  return { status: 'success', feedback: _foodFeedbackFor_(id, COACHLOG.foodDaysMax) };
}

// ── Ringkasan makan 31 hari (F3) ──────────────────────────────────────────────

/** Murni: rata-rata per minggu (Senin) dari hari yang dicatat, dan makanan yang paling sering dicatat. */
function _foodMonthStats_(days) {
  const weeks = {}, count = {}, name = {};
  (days || []).forEach(function(d) {
    if (!d.items || !d.items.length) return;
    const w = _weekStart_(d.tanggal), x = weeks[w] || (weeks[w] = { minggu: w, hari: 0, kal: 0, p: 0 });
    x.hari++; x.kal += d.totals.kal; x.p += d.totals.p;
    d.items.forEach(function(i) { const k = i.foodId || ('~' + String(i.nama).toLowerCase()); count[k] = (count[k] || 0) + 1; name[k] = i.nama; });
  });
  const minggu = Object.keys(weeks).sort().reverse().map(function(w) {
    const x = weeks[w];
    return { minggu: w, hari: x.hari, kal: Math.round(x.kal / x.hari), p: Math.round(x.p / x.hari) };
  });
  const top = Object.keys(count).sort(function(a, b) { return count[b] - count[a] || (name[a] < name[b] ? -1 : 1); }).slice(0, 5)
    .map(function(k) { return { nama: name[k], kali: count[k] }; });
  const logged = (days || []).filter(function(d) { return d.items && d.items.length; }).length;
  return { minggu: minggu, top: top, logged: logged, total: (days || []).length };
}
