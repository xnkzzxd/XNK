// Fase X (T-1902): kartu atlet klien (nama panggilan, motto, pilihan tampilan) di MemberData kolom AR–AU
// (nomor kolom tetap, pola sama dengan LatihanProfil.gs), dan penghubung sheet → fungsi murni di Level.gs.
// Data ini milik klien sendiri: tidak masuk Telegram, jawaban publik, atau xnk_admin_cache.

const PF_COLS = { panggilan: 44, motto: 45, kartu: 46, notif: 47 };
const PF_HEADERS = { 44: 'Nama Panggilan', 45: 'Motto', 46: 'Kartu Profil', 47: 'Notif Dilihat' };
const PF_ACCENTS = ['hitam', 'biru', 'hijau', 'toska', 'ungu', 'pink', 'oranye'];
const PF_STYLES = ['polos', 'aksen', 'garis'];
const PF_STATS = ['sesi', 'minggu', 'berat', 'latihan', 'kuat', 'pr', 'makan', 'level'];
const PF_STATS_DEFAULT = ['sesi', 'minggu', 'berat'];
const PF_LIMITS = { panggilan: 20, motto: 60, statMin: 3, statMax: 4, badgeMax: 3 };

/** Tambah header kolom kartu profil di MemberData (hanya sel kosong). Idempoten. */
function _ensureProfileColumns_(sheet) {
  Object.keys(PF_HEADERS).forEach(function(col) {
    const cell = sheet.getRange(1, Number(col));
    if (cell.getValue() === '') { cell.setValue(PF_HEADERS[col]); cell.setFontWeight('bold'); }
  });
}

/** Murni: teks bebas dari klien → aman untuk sel (tanpa karakter kontrol, tidak diawali = + - @). */
function _pfText_(v, max, label) {
  const t = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > max) throw new Error(label + ' maksimal ' + max + ' karakter.');
  if (/^[=+\-@]/.test(t)) throw new Error(label + ' tidak boleh diawali tanda = + - atau @.');
  return t;
}

/** Murni: baris MemberData → pilihan kartu (nilai tak dikenal jatuh ke bawaan). */
function _pfFrom_(row) {
  const c = function(k) { const v = row[PF_COLS[k] - 1]; return v == null ? '' : String(v); };
  let j = {};
  try { const x = c('kartu') ? JSON.parse(c('kartu')) : {}; if (x && typeof x === 'object' && !Array.isArray(x)) j = x; } catch (e) { j = {}; }
  const list = function(v, allow, max) { return (Array.isArray(v) ? v : []).map(String).filter(function(x, i, a) { return (!allow || allow.indexOf(x) !== -1) && a.indexOf(x) === i; }).slice(0, max); };
  const stat = list(j.s, PF_STATS, PF_LIMITS.statMax);
  return {
    panggilan: c('panggilan').trim(), motto: c('motto').trim(),
    aksen: PF_ACCENTS.indexOf(j.a) !== -1 ? j.a : PF_ACCENTS[0],
    gaya: PF_STYLES.indexOf(j.g) !== -1 ? j.g : PF_STYLES[0],
    stat: stat.length >= PF_LIMITS.statMin ? stat : PF_STATS_DEFAULT.slice(),
    badge: list(j.b, null, PF_LIMITS.badgeMax),
    foto: j.f === true,
    notifSeen: c('notif').trim()
  };
}

/** Murni: validasi isian dari klien. Hanya kunci yang dikirim yang diubah. earned = id badge yang sudah diraih. */
function _pfValidate_(data, earned) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Data profil tidak valid.');
  const out = {};
  if (data.panggilan !== undefined) out.panggilan = _pfText_(data.panggilan, PF_LIMITS.panggilan, 'Nama panggilan');
  if (data.motto !== undefined) out.motto = _pfText_(data.motto, PF_LIMITS.motto, 'Motto');
  if (data.aksen !== undefined) { if (PF_ACCENTS.indexOf(data.aksen) === -1) throw new Error('Warna aksen tidak dikenal.'); out.aksen = data.aksen; }
  if (data.gaya !== undefined) { if (PF_STYLES.indexOf(data.gaya) === -1) throw new Error('Gaya kartu tidak dikenal.'); out.gaya = data.gaya; }
  if (data.stat !== undefined) {
    const s = (Array.isArray(data.stat) ? data.stat : []).map(String).filter(function(x, i, a) { return a.indexOf(x) === i; });
    if (s.some(function(x) { return PF_STATS.indexOf(x) === -1; })) throw new Error('Statistik tidak dikenal.');
    if (s.length < PF_LIMITS.statMin || s.length > PF_LIMITS.statMax) throw new Error('Pilih ' + PF_LIMITS.statMin + ' atau ' + PF_LIMITS.statMax + ' statistik.');
    out.stat = s;
  }
  if (data.badge !== undefined) {
    const b = (Array.isArray(data.badge) ? data.badge : []).map(String).filter(function(x, i, a) { return a.indexOf(x) === i; });
    if (b.length > PF_LIMITS.badgeMax) throw new Error('Badge unggulan maksimal ' + PF_LIMITS.badgeMax + '.');
    if (b.some(function(x) { return (earned || []).indexOf(x) === -1; })) throw new Error('Badge itu belum diraih.');
    out.badge = b;
  }
  if (data.foto !== undefined) out.foto = data.foto === true;
  return out;
}

/** Tulis pilihan kartu yang sudah divalidasi ke baris MemberData (di dalam lock pemanggil). cur = _pfFrom_ baris itu. */
function _pfWrite_(m, cur, v) {
  _ensureProfileColumns_(m.sheet);
  const put = function(k, val) { m.sheet.getRange(m.rowNum, PF_COLS[k]).setNumberFormat('@').setValue(val); };
  if (v.panggilan !== undefined) put('panggilan', v.panggilan);
  if (v.motto !== undefined) put('motto', v.motto);
  const n = Object.assign({ aksen: cur.aksen, gaya: cur.gaya, stat: cur.stat, badge: cur.badge, foto: cur.foto }, v);
  put('kartu', JSON.stringify({ a: n.aksen, g: n.gaya, s: n.stat, b: n.badge, f: n.foto === true }));
}

/** Nama yang tampil di kartu: nama panggilan, kalau kosong nama depan. */
function _pfDisplayName_(row, pf) { return pf.panggilan || String(row[1] || '').trim().split(/\s+/)[0] || ''; }

/**
 * Semua part baru portal Fase X dari part getPortalMore yang sudah dihitung (pre: progress, workout, nutrition, tasks,
 * renewal, bills, healthForm, content). Dipanggil di dalam _withSchedulesMemo_. Hasil: { profile, level, moments, journey, notif, todo }.
 */
function _portalXFor_(row, pre) {
  pre = pre || {};
  const ok = function(x) { return x && !x.error ? x : null; };
  const id = String(row[0]).trim(), today = _todayWib_(), nowMs = Date.now();
  const pf = _pfFrom_(row);
  const progress = ok(pre.progress), workout = ok(pre.workout), nutrition = ok(pre.nutrition);
  const all = _getSchedulesAll_();
  const mine = all.filter(function(s) { return String(s.memberId).trim() === id; });
  const done = mine.filter(function(s) { return String(s.status || '').toLowerCase() === 'completed'; });
  const doneDates = done.map(function(s) { return _wibDate_(s.completedAt || s.start); }).filter(Boolean).sort();
  const ev = _workoutEvents_(_workoutRowsOf_(id));
  const nutOn = !!(nutrition && nutrition.enabled);
  const foodDays = _nutEnabled_() && _nutProfileFrom_(row).aktif ? _foodLogRows_(id).map(function(r) { return r.tanggal; }).filter(function(d, i, a) { return d && a.indexOf(d) === i; }).length : 0;
  const summary = progress ? (progress.summary || {}) : {};
  const earned = progress ? progress.badges.filter(function(b) { return b.earned; }) : [];

  const level = _levelCalc_({ sesi: done.length, latihan: ev.days, makan: foodDays, ukur: progress ? progress.entries.length : 0, minggu: progress ? progress.bestStreak : 0 });

  let strength = null;
  ((workout && workout.stats && workout.stats.exercises) || []).forEach(function(e) {
    const p = e.points || [];
    if (p.length < 2) return;
    const gain = p[p.length - 1].e1rm - p[0].e1rm;
    if (!strength || gain > strength.last - strength.first) strength = { gerakan: e.gerakan, first: p[0].e1rm, last: p[p.length - 1].e1rm };
  });
  let bestLift = null;
  ((workout && workout.stats && workout.stats.exercises) || []).forEach(function(e) {
    const p = e.points || [];
    if (p.length && (!bestLift || p[p.length - 1].e1rm > bestLift.v)) bestLift = { gerakan: e.gerakan, v: p[p.length - 1].e1rm };
  });

  const moments = _momentsCalc_({ prs: ev.prs, sessionDates: doneDates, weight: summary.berat, waist: summary.pinggang });
  const since = doneDates[0] || (summary.berat && summary.berat.first.tanggal) || '';
  const journey = _journeyCalc_({ today: today, since: since, weight: summary.berat, waist: summary.pinggang, strength: strength, streak: progress ? progress.streak : 0, completed: done.length });

  const w = summary.berat;
  const statVal = {
    sesi: { l: 'Sesi', v: String(done.length) },
    minggu: { l: 'Minggu beruntun', v: String(progress ? progress.streak : 0) },
    berat: { l: 'kg', v: w && w.first.tanggal !== w.last.tanggal ? (w.change > 0 ? '+' : (w.change < 0 ? '−' : '')) + _lvNum_(Math.abs(w.change), 1) : '–' },
    latihan: { l: 'Latihan', v: String(ev.days) },
    kuat: { l: bestLift ? bestLift.gerakan : 'Angkatan terbaik', v: bestLift ? _lvNum_(bestLift.v, 0) + ' kg' : '–' },
    pr: { l: 'Rekor', v: String(ev.prs.length) },
    makan: { l: 'Hari makan', v: String(foodDays) },
    level: { l: 'Level', v: String(level.level) }
  };
  const profile = {
    nama: _pfDisplayName_(row, pf), panggilan: pf.panggilan, motto: pf.motto, aksen: pf.aksen, gaya: pf.gaya, foto: pf.foto,
    stat: pf.stat, badge: pf.badge.filter(function(b) { return earned.some(function(e) { return e.id === b; }); }),
    statOptions: PF_STATS.map(function(k) { return { k: k, l: statVal[k].l, v: statVal[k].v }; }),
    options: { aksen: PF_ACCENTS, gaya: PF_STYLES, limits: PF_LIMITS }
  };

  const tasksRaw = ok(pre.tasks) || [];
  const isoDue = function(d) { const x = _parseTanggalDMY_(d); return x ? Utilities.formatDate(x, REMINDER_TZ, 'yyyy-MM-dd') : ''; };
  const bills = ok(pre.bills) || [];
  const billsRemaining = bills.reduce(function(s, b) { return s + (Number(b.remaining) > 0 ? Number(b.remaining) : 0); }, 0);
  const renewal = pre.renewal && !pre.renewal.error ? pre.renewal : null;
  const hasUpcoming = mine.some(function(s) { const st = String(s.status || '').toLowerCase(); return st !== 'completed' && st !== 'cancelled' && new Date(s.end || s.start).getTime() > nowMs; });
  const fb = _feedbackEnabled_();
  const log = nutOn && nutrition.log ? nutrition.log : null;
  const eatenBy = {};
  ((log && log.items) || []).forEach(function(i) { eatenBy[i.waktu] = true; });
  const missing = nutOn && nutrition.menu ? nutrition.menu.meals.filter(function(m) { return !eatenBy[m.key]; }).map(function(m) { return m.label; }) : [];
  const todo = _todoCalc_({
    today: today,
    nextRoutine: workout ? workout.next : '',
    workedToday: !!(workout && (workout.days || []).some(function(d) { return d.tanggal === today; })),
    nutrition: nutOn ? { on: true, ok: !!(nutrition.target && nutrition.target.ok), eaten: log && log.totals ? log.totals.kal : 0, target: nutrition.target ? nutrition.target.kal : 0, missing: missing } : null,
    tasks: tasksRaw.map(function(t) { return { id: t.id, title: t.title, dueDate: isoDue(t.dueDate), status: t.status, overdue: !!t.overdue, completedAt: t.completedAt }; }),
    hasUpcoming: hasUpcoming, quotaLeft: _memberQuotaLeft_(row, all), total: parseInt(row[8], 10) || 0,
    renewalOpen: !!(renewal && renewal.status === 'menunggu'),
    pendingRating: fb ? _pendingRating_(id, all) : null,
    evalEligible: fb ? _packageEvalEligible_(row, all) : false,
    billsRemaining: billsRemaining
  });

  const hf = ok(pre.healthForm);
  const notif = _notifCalc_({
    today: today, seenAt: pf.notifSeen,
    content: (ok(pre.content) || []).map(function(c) { return { id: c.id, judul: c.judul, tipe: c.tipe, dibuat: c.dibuat }; }),
    lastWeighDate: w ? w.last.tanggal : '',
    nutrition: nutOn ? { on: true, ok: !!(nutrition.target && nutrition.target.ok) } : null,
    healthDone: hf ? !!hf.done : null,
    renewal: renewal, billsRemaining: billsRemaining, moments: moments
  });
  return { profile: profile, level: level, moments: moments, journey: journey, notif: notif, todo: todo };
}

/** Klien: simpan kartu atlet (nama panggilan, motto, aksen, gaya, statistik, badge unggulan). Member dari token. */
function saveMyProfileCard(memberToken, data) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  const earned = _streakInfo_(id).badges.filter(function(b) { return b.earned; }).map(function(b) { return b.id; });
  const v = _pfValidate_(data, earned);
  if (!_throttle_('pf_' + id, 2)) throw new Error('Tunggu sebentar sebelum menyimpan lagi.');
  _locked_(function() { const m = _memberRowOrThrow_(id); _pfWrite_(m, _pfFrom_(m.row), v); });
  const pf = _pfFrom_(_memberRowOrThrow_(id).row);
  return _bumpAfter_(id, { panggilan: pf.panggilan, motto: pf.motto, aksen: pf.aksen, gaya: pf.gaya, stat: pf.stat, badge: pf.badge, foto: pf.foto });
}

/** Klien: lonceng sudah dibuka. Hanya menyimpan waktu; isi lonceng dihitung ulang saat data berikutnya dimuat. */
function markNotifSeen(memberToken) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  const at = new Date().toISOString();
  _locked_(function() {
    const m = _memberRowOrThrow_(id);
    _ensureProfileColumns_(m.sheet);
    m.sheet.getRange(m.rowNum, PF_COLS.notif).setNumberFormat('@').setValue(at);
  });
  return _bumpAfter_(id, { seenAt: at });
}
