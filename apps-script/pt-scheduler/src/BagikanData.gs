/**
 * Kartu bagikan (Phase T, T2): angka untuk kartu gambar yang dibuat di browser.
 * Gambar tidak pernah diunggah; di sini hanya ringkasan angka milik klien itu sendiri.
 */

// Enam sumbu radar ala Hevy; kardio tidak dihitung.
const SHARE_PART_GROUP = { 'back': 'back', 'upper legs': 'legs', 'lower legs': 'legs', 'chest': 'chest', 'shoulders': 'shoulders', 'neck': 'shoulders', 'waist': 'core', 'upper arms': 'arms', 'lower arms': 'arms' };
const SHARE_QR_DEFAULT = 'https://xnkbooking.my.id';
const SHARE_ACTIVITY = { weeks: 12, days: 91 };

/** Nyala bawaan; SHARE_ENABLED=false mematikannya untuk semua. */
function _shareEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('SHARE_ENABLED') !== 'false';
}

/** Alamat QR di kartu (Pengaturan → Tampilan). Kosong = alamat bawaan. */
function _shareQrUrl_() {
  return PropertiesService.getScriptProperties().getProperty('SHARE_QR_URL') || SHARE_QR_DEFAULT;
}

/** Murni: alamat QR yang boleh disimpan: https, maks 200 karakter. '' = kembali ke bawaan. */
function _shareQrValidate_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (s.length > 200 || !/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s<>"']*)?$/.test(s)) throw new Error('Alamat QR harus diawali https:// dan tanpa spasi.');
  return s;
}

/**
 * Murni: ringkasan bulan ini (dan bulan lalu untuk perbandingan) dan perubahan tubuh.
 * in: { month:'yyyy-MM', target, done, prevDone, days:[{tanggal, volume}], prs:[tanggal], foodDays, summary:{ berat, pinggang }, coach }
 */
function _shareSummary_(inp) {
  const month = String(inp.month || '');
  const prevMonth = _shareMonthAdd_(month, -1);
  const pick = function(m) {
    const inM = function(t) { return String(t).slice(0, 7) === m; };
    const days = (inp.days || []).filter(function(d) { return inM(d.tanggal); });
    return { workoutDays: days.length, volume: Math.round(days.reduce(function(a, d) { return a + (Number(d.volume) || 0); }, 0)), prs: (inp.prs || []).filter(inM).length };
  };
  const cur = pick(month), prev = pick(prevMonth);
  const delta = function(m) { return m && m.count >= 2 ? { change: m.change, since: m.first.tanggal } : null; };
  const sum = inp.summary || {};
  return {
    month: {
      label: month, sessions: Number(inp.done) || 0, target: Number(inp.target) || 0,
      workoutDays: cur.workoutDays, volume: cur.volume, prs: cur.prs, foodDays: Number(inp.foodDays) || 0
    },
    prevMonth: { label: prevMonth, sessions: Number(inp.prevDone) || 0, workoutDays: prev.workoutDays, volume: prev.volume, prs: prev.prs },
    body: { weight: delta(sum.berat), waist: delta(sum.pinggang) },
    coach: String(inp.coach || '')
  };
}

/** Murni: 'yyyy-MM' ± n bulan. */
function _shareMonthAdd_(month, n) {
  const p = String(month).split('-').map(Number);
  if (!p[0] || !p[1]) return '';
  const d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
}

/**
 * Murni: aktivitas untuk kartu Konsistensi. done = tanggal sesi selesai (WIB), logged = tanggal latihan dicatat.
 * { weeks:[{ start, n, logged }] (12 minggu, lama → baru), days:[{ d, s, w }] (91 hari terakhir yang aktif saja) }
 */
function _shareActivity_(done, logged, today) {
  const thisWeek = _weekStart_(today), since = _addDaysIso_(today, -(SHARE_ACTIVITY.days - 1));
  const weeks = [], byWeek = {};
  for (let i = SHARE_ACTIVITY.weeks - 1; i >= 0; i--) { const w = { start: _addDaysIso_(thisWeek, -7 * i), n: 0, logged: 0 }; weeks.push(w); byWeek[w.start] = w; }
  const days = {};
  const add = function(list, k) {
    const seen = {};
    (list || []).forEach(function(t) {
      t = String(t).slice(0, 10);
      if (t > today) return;
      const w = byWeek[_weekStart_(t)];
      if (w && (k === 's' || !seen[t])) w[k === 's' ? 'n' : 'logged']++;
      seen[t] = true;
      if (t >= since) (days[t] || (days[t] = { d: t, s: 0, w: 0 }))[k] = k === 's' ? days[t].s + 1 : 1;
    });
  };
  add(done, 's');
  add(logged, 'w');
  return { weeks: weeks, days: Object.keys(days).sort().map(function(t) { return days[t]; }) };
}

/** Tanggal sesi selesai (WIB) satu klien, dari jadwal yang sudah dibaca. */
function _shareDoneDates_(schedules, memberId) {
  const id = String(memberId).trim(), out = [];
  (schedules || []).forEach(function(sc) {
    if (String(sc.memberId).trim() !== id || String(sc.status || '').toLowerCase() !== 'completed') return;
    const d = new Date(sc.start);
    if (!isNaN(d.getTime())) out.push(Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd'));
  });
  return out.sort();
}

/** Data kartu bagikan satu klien dari bagian yang sudah dihitung (tanpa pembacaan baru kecuali rekor dan catatan makan). */
function _shareFor_(row, workout, progress) {
  const id = String(row[0]).trim();
  const today = _todayWib_(), month = today.slice(0, 7), prevMonth = _shareMonthAdd_(month, -1);
  const ch = progress && !progress.error && progress.challenge ? progress.challenge : _monthlyChallenge_(id);
  const days = ((workout && !workout.error && workout.days) || []).map(function(d) {
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
  const all = _getSchedulesAll_();
  const out = _shareSummary_({ month: month, target: ch.target, done: ch.done, prevDone: _challengeDone_(all, id, prevMonth), days: days, prs: prs, foodDays: foodDays, summary: progress && progress.summary, coach: row[11] });
  out.activity = _shareActivity_(_shareDoneDates_(all, id), days.map(function(d) { return d.tanggal; }), today);
  out.qrUrl = _shareQrUrl_();
  return out;
}

// ── Periode (minggu / bulan / 3 bulan / tanggal): dihitung di server saat klien memilihnya ─────────

/**
 * Murni: rentang periode. 'hari' | 'minggu' | 'bulan' | '3bulan' | 'tanggal:yyyy-MM-dd'.
 * { key, from, to, prevFrom, prevTo, days }. Rentang sebelumnya sama panjang (minggu lalu penuh, bulan lalu penuh).
 */
function _sharePeriodRange_(period, today) {
  const p = String(period || 'hari');
  let from, to = today, prevFrom, prevTo;
  if (p === 'hari') { from = today; prevFrom = prevTo = _addDaysIso_(today, -1); }
  else if (p === 'minggu') { from = _weekStart_(today); prevFrom = _addDaysIso_(from, -7); prevTo = _addDaysIso_(from, -1); }
  else if (p === 'bulan') { from = today.slice(0, 8) + '01'; prevTo = _addDaysIso_(from, -1); prevFrom = prevTo.slice(0, 8) + '01'; }
  else if (p === '3bulan') { from = _addDaysIso_(today, -89); prevTo = _addDaysIso_(from, -1); prevFrom = _addDaysIso_(from, -90); }
  else {
    const m = /^tanggal:(\d{4}-\d{2}-\d{2})$/.exec(p);
    if (!m || _addDaysIso_(m[1], 0) !== m[1] || m[1] > today || m[1] < _addDaysIso_(today, -730)) throw new Error('Periode tidak dikenal.');
    from = to = m[1]; prevFrom = prevTo = _addDaysIso_(m[1], -1);
  }
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return { key: p, from: from, to: to, prevFrom: prevFrom, prevTo: prevTo, days: span };
}

/** Murni: ringkasan latihan dalam rentang. days = bentuk _workoutGroup_, prs = _workoutEvents_().prs, sessions = WorkoutSessions. */
function _shareWorkoutAgg_(days, prs, sessions, from, to) {
  const inR = function(t) { return t >= from && t <= to; };
  const out = { workoutDays: 0, volume: 0, sets: 0, reps: 0, durasi: 0, prs: 0, parts: {}, exercises: [] };
  const byKey = {}, durByDay = {};
  (sessions || []).forEach(function(s) { if (inR(s.tanggal) && Number(s.durasi) > 0 && !durByDay[s.tanggal]) durByDay[s.tanggal] = Number(s.durasi); });
  const prKeys = {};
  (prs || []).forEach(function(p) { if (inR(p.tanggal)) { out.prs++; prKeys[p.key] = true; } });
  (days || []).forEach(function(d) {
    if (!inR(d.tanggal)) return;
    out.workoutDays++;
    let setDur = 0;
    d.items.forEach(function(it) {
      const k = byKey[it.key] || (byKey[it.key] = { key: it.key, gerakan: it.gerakan, bodyPart: it.bodyPart, sets: 0, reps: 0, volume: 0, best: null, be: -1, pr: !!prKeys[it.key] });
      it.sets.forEach(function(s) {
        setDur += Number(s.durasi) || 0;
        if (_isWarmup_(s.jenis)) return;
        const w = Number(s.berat) || 0, r = Number(s.rep) || 0, v = w * r;
        out.sets++; out.reps += r; out.volume += v;
        k.sets++; k.reps += r; k.volume += v;
        const grp = SHARE_PART_GROUP[it.bodyPart];
        if (grp && v > 0) out.parts[grp] = (out.parts[grp] || 0) + v;
        const e = w > 0 ? _e1rm_(w, r) || w : r;
        if (e > k.be) { k.be = e; k.best = { berat: w, rep: r, durasi: Number(s.durasi) || 0 }; }
      });
    });
    out.durasi += durByDay[d.tanggal] || setDur;
  });
  out.volume = Math.round(out.volume);
  Object.keys(out.parts).forEach(function(g) { out.parts[g] = Math.round(out.parts[g]); });
  out.exercises = Object.keys(byKey).map(function(k) { const x = byKey[k]; delete x.be; x.volume = Math.round(x.volume); return x; })
    .filter(function(x) { return x.sets > 0; })
    .sort(function(a, b) { return b.volume - a.volume || b.sets - a.sets; }).slice(0, 12);
  return out;
}

/** Murni: tiga gerakan yang paling sering dicatat dalam rentang (min. 2 hari) dengan titik estimasi 1RM per hari. */
function _shareLifts_(days, from, to) {
  const byKey = {};
  (days || []).forEach(function(d) {
    if (d.tanggal < from || d.tanggal > to) return;
    d.items.forEach(function(it) {
      let e1 = 0;
      it.sets.forEach(function(s) { if (!_isWarmup_(s.jenis)) e1 = Math.max(e1, _e1rm_(s.berat, s.rep)); });
      if (!(e1 > 0)) return;
      const k = byKey[it.key] || (byKey[it.key] = { gerakan: it.gerakan, pts: {} });
      if (!k.pts[d.tanggal] || e1 > k.pts[d.tanggal]) k.pts[d.tanggal] = e1;
    });
  });
  return Object.keys(byKey).map(function(k) {
    const x = byKey[k];
    return { gerakan: x.gerakan, pts: Object.keys(x.pts).sort().map(function(t) { return { tanggal: t, e1rm: x.pts[t] }; }) };
  }).filter(function(x) { return x.pts.length >= 2; })
    .sort(function(a, b) { return b.pts.length - a.pts.length || (a.gerakan < b.gerakan ? -1 : 1); }).slice(0, 3)
    .map(function(x) { x.pts = x.pts.slice(-20); return x; });
}

/** Murni: makan dalam rentang. rows = _foodLogRows_; target = kkal per hari (0 = belum ada). */
function _shareFoodAgg_(rows, from, to, target) {
  const byDay = {};
  (rows || []).forEach(function(r) {
    if (r.tanggal < from || r.tanggal > to) return;
    const d = byDay[r.tanggal] || (byDay[r.tanggal] = { tanggal: r.tanggal, kal: 0, p: 0, k: 0, l: 0 });
    d.kal += Number(r.kal) || 0; d.p += Number(r.p) || 0; d.k += Number(r.k) || 0; d.l += Number(r.l) || 0;
  });
  const daily = Object.keys(byDay).sort().map(function(t) { const d = byDay[t]; return { tanggal: t, kal: Math.round(d.kal), p: Math.round(d.p), k: Math.round(d.k), l: Math.round(d.l) }; });
  const n = daily.length, avg = function(f) { return n ? Math.round(daily.reduce(function(a, d) { return a + d[f]; }, 0) / n) : 0; };
  const onTarget = target > 0 ? daily.filter(function(d) { return Math.abs(d.kal - target) <= target * 0.1; }).length : 0;
  return { days: n, avgKal: avg('kal'), avgP: avg('p'), avgK: avg('k'), avgL: avg('l'), onTarget: onTarget, target: target || 0, daily: daily.slice(-31) };
}

/** Murni: ukuran tubuh dalam rentang (awal, akhir, perubahan, titik) dan sejak catatan pertama. entries = _readProgress_. */
function _shareBodyAgg_(entries, from, to) {
  const out = {};
  PROGRESS_MEASURES.forEach(function(m) {
    const all = (entries || []).filter(function(e) { return e[m.key] !== '' && e[m.key] != null && e.tanggal <= to; });
    if (!all.length) return;
    let pts = all.filter(function(e) { return e.tanggal >= from; });
    const before = all.filter(function(e) { return e.tanggal < from; }).pop();
    if (before) pts = [before].concat(pts);   // titik awal = catatan terakhir sebelum rentang
    const p = pts.map(function(e) { return { tanggal: e.tanggal, v: Number(e[m.key]) }; });
    const first = all[0], last = all[all.length - 1];
    out[m.key] = {
      unit: m.unit,
      first: p.length ? p[0].v : null, last: p.length ? p[p.length - 1].v : null,
      change: p.length >= 2 ? Math.round((p[p.length - 1].v - p[0].v) * 10) / 10 : null,
      pts: p.slice(-30),
      start: { v: Number(first[m.key]), tanggal: first.tanggal, change: all.length >= 2 ? Math.round((Number(last[m.key]) - Number(first[m.key])) * 10) / 10 : null }
    };
  });
  return out;
}

/** Murni: jumlah sesi selesai dalam rentang dari tanggal-tanggal sesi. */
function _shareCountIn_(dates, from, to) {
  return (dates || []).filter(function(t) { return t >= from && t <= to; }).length;
}

/**
 * Murni: semua angka kartu untuk satu periode + perbandingan.
 * in: { range, days, prs, sessions, food, kcalTarget, entries, done, sessionTarget }
 */
function _sharePeriod_(inp) {
  const r = inp.range;
  const lookback = r.days < 90 ? _addDaysIso_(r.to, -89) : r.from;
  const cur = {
    workout: _shareWorkoutAgg_(inp.days, inp.prs, inp.sessions, r.from, r.to),
    nutrition: _shareFoodAgg_(inp.food, r.from, r.to, inp.kcalTarget),
    sessionsDone: _shareCountIn_(inp.done, r.from, r.to)
  };
  const prevW = _shareWorkoutAgg_(inp.days, inp.prs, inp.sessions, r.prevFrom, r.prevTo);
  const prevN = _shareFoodAgg_(inp.food, r.prevFrom, r.prevTo, inp.kcalTarget);
  return {
    period: { key: r.key, from: r.from, to: r.to, days: r.days },
    workout: cur.workout,
    lifts: _shareLifts_(inp.days, lookback, r.to),
    nutrition: cur.nutrition,
    body: _shareBodyAgg_(inp.entries, r.from, r.to),
    sessionsDone: cur.sessionsDone,
    compare: {
      prev: { from: r.prevFrom, to: r.prevTo, sessionsDone: _shareCountIn_(inp.done, r.prevFrom, r.prevTo),
        workout: { workoutDays: prevW.workoutDays, volume: prevW.volume, sets: prevW.sets, reps: prevW.reps, durasi: prevW.durasi, prs: prevW.prs },
        nutrition: { days: prevN.days, avgKal: prevN.avgKal, avgP: prevN.avgP, onTarget: prevN.onTarget } },
      start: { sessionsDone: (inp.done || []).filter(function(t) { return t <= r.to; }).length },
      target: { sessions: Number(inp.sessionTarget) || 0, kal: Number(inp.kcalTarget) || 0, protein: Number(inp.proteinTarget) || 0 }
    }
  };
}

/** Foto profil/coach sebagai data URL kecil (kanvas tidak boleh menggambar gambar Drive lintas domain). */
function _shareAvatar_(url, fileId) {
  const id = fileId || ((/\/d\/([A-Za-z0-9_-]{10,})/.exec(String(url || '')) || [])[1]) || ((/[?&]id=([A-Za-z0-9_-]{10,})/.exec(String(url || '')) || [])[1]) || '';
  if (!id) return '';
  try {
    const f = DriveApp.getFileById(id);
    let blob = null;
    try { blob = f.getThumbnail(); } catch (e) {}
    if (!blob || !blob.getBytes().length) blob = f.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length > 1500000) return '';
    return 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(bytes);
  } catch (e) { return ''; }
}

/** Angka kartu satu klien untuk satu periode (dipakai versi klien dan versi coach). */
function _shareDataFor_(row, period, opts) {
  const id = String(row[0]).trim(), today = _todayWib_();
  const range = _sharePeriodRange_(period, today);
  const rows = _workoutRowsOf_(id);
  const g = _workoutGroup_(rows);
  let kcal = 0, protein = 0;
  try { const c = _nutEnabled_() ? _nutComputeFor_(row) : null; if (c && c.target && c.target.ok) { kcal = c.target.kal; protein = c.target.protein; } } catch (e) {}
  const out = _sharePeriod_({
    range: range, days: g.days, prs: _workoutEvents_(rows).prs, sessions: _workoutSessionsOf_(id),
    food: _foodLogRows_(id), kcalTarget: kcal, proteinTarget: protein, entries: _readProgress_(id),
    done: _shareDoneDates_(_getSchedulesAll_(), id), sessionTarget: _monthlyChallenge_(id).target
  });
  if (opts && opts.avatars) {
    const coachId = String(row[10] || '').trim();
    const coach = coachId ? _activeCoaches_().filter(function(c) { return String(c.id) === coachId; })[0] : null;
    out.avatars = { me: _shareAvatar_(row[5]), coach: coach ? _shareAvatar_(coach.photo, coach.photoFileId) : '' };
  }
  return out;
}

/** Klien: angka kartu untuk periode pilihan. Klien selalu dari token. */
function getMyShareData(memberToken, period, opts) {
  const row = requireMember_(memberToken).row;
  if (!_shareEnabled_()) throw new Error('Kartu bagikan sedang dimatikan.');
  return _shareDataFor_(row, period, opts);
}

/** Coach: angka kartu klien untuk periode pilihan. */
function getMemberShareData(token, memberId, period, opts) {
  requireAdmin_(token);
  return _shareDataFor_(_memberRowOrThrow_(memberId).row, period, opts);
}
