/**
 * Kartu bagikan (Phase T): angka untuk kartu gambar yang dibuat di browser.
 * Gambar tidak pernah diunggah; di sini hanya ringkasan angka milik klien itu sendiri.
 */

// Enam sumbu radar ala Hevy; kardio tidak dihitung.
const SHARE_PART_GROUP = { 'back': 'back', 'upper legs': 'legs', 'lower legs': 'legs', 'chest': 'chest', 'shoulders': 'shoulders', 'neck': 'shoulders', 'waist': 'core', 'upper arms': 'arms', 'lower arms': 'arms' };

/** Nyala bawaan; SHARE_ENABLED=false mematikannya untuk semua. */
function _shareEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('SHARE_ENABLED') !== 'false';
}

/**
 * Murni: ringkasan bulan ini dan perubahan tubuh.
 * in: { month:'yyyy-MM', target, done, days:[{tanggal, volume}], prs:[tanggal], foodDays, summary:{ berat, pinggang }, coach }
 */
function _shareSummary_(inp) {
  const month = String(inp.month || '');
  const inMonth = function(t) { return String(t).slice(0, 7) === month; };
  const days = (inp.days || []).filter(function(d) { return inMonth(d.tanggal); });
  const delta = function(m) { return m && m.count >= 2 ? { change: m.change, since: m.first.tanggal } : null; };
  const sum = inp.summary || {};
  return {
    month: {
      label: month, sessions: Number(inp.done) || 0, target: Number(inp.target) || 0,
      workoutDays: days.length, volume: Math.round(days.reduce(function(a, d) { return a + (Number(d.volume) || 0); }, 0)),
      prs: (inp.prs || []).filter(inMonth).length, foodDays: Number(inp.foodDays) || 0
    },
    body: { weight: delta(sum.berat), waist: delta(sum.pinggang) },
    coach: String(inp.coach || '')
  };
}

/** Data kartu bagikan satu klien dari bagian yang sudah dihitung (tanpa pembacaan baru kecuali rekor dan catatan makan). */
function _shareFor_(row, workout, progress) {
  const id = String(row[0]).trim();
  const month = _todayWib_().slice(0, 7);
  const ch = progress && !progress.error && progress.challenge ? progress.challenge : _monthlyChallenge_(id);
  const days = ((workout && workout.days) || []).map(function(d) {
    let vol = 0;
    d.items.forEach(function(it) { it.sets.forEach(function(s) { if (!_isWarmup_(s.jenis)) vol += (Number(s.berat) || 0) * (Number(s.rep) || 0); }); });
    return { tanggal: d.tanggal, volume: vol };
  });
  const prs = _workoutEvents_(_workoutRowsOf_(id)).prs.map(function(p) { return p.tanggal; });
  let foodDays = 0;
  const fs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FoodLog');
  if (fs && fs.getLastRow() >= 2) {
    const seen = {};
    fs.getDataRange().getValues().slice(1).forEach(function(r) { if (String(r[1]).trim() === id && String(r[2]).slice(0, 7) === month) seen[String(r[2])] = true; });
    foodDays = Object.keys(seen).length;
  }
  return _shareSummary_({ month: month, target: ch.target, done: ch.done, days: days, prs: prs, foodDays: foodDays, summary: progress && progress.summary, coach: row[11] });
}
