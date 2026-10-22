// ============================================================
// Nutrisi.gs — Gizi klien (Phase P). Aturan: docs/nutrition/Rules.md.
// Fungsi murni (BMI, WHtR, BMR, TDEE, target) + kolom MemberData baru.
// Semua angka adalah estimasi. Data gizi klien bersifat privat: tidak ke Telegram,
// cache admin, atau respons publik.
// ============================================================

// Kolom MemberData baru (kanan dari "Panduan" kolom W). Tanggal lahir = MEMBER_BIRTH_COL.
const NUT_COLS = { tinggi: 24, jk: 25, goal: 26, pantangan: 27, anggaran: 28, aktif: 29, adjust: 30 };
const NUT_HEADERS = { 24: 'Tinggi (cm)', 25: 'Jenis Kelamin', 26: 'Goal Gizi', 27: 'Pantangan Makanan', 28: 'Anggaran Makan', 29: 'Gizi Aktif', 30: 'Penyesuaian Kalori' };
const NUT_GOALS = ['turun', 'naik', 'jaga', 'recomp'];

/** Konstanta aturan (Rules.md). Ubah di sini dan di dokumen sekaligus. */
const NUT = {
  goalKal: { turun: 0.82, naik: 1.12, jaga: 1.0, recomp: 0.95 },
  turunMin: 0.75,                 // defisit maks 25 %
  riskMin: 0.90,                  // defisit maks 10 % bila ada pengaman
  floorKal: { P: 1200, L: 1500 },
  proteinKg: { turun: 2.0, naik: 1.8, jaga: 1.6, recomp: 2.1 },
  proteinMinKg: 0.8,
  lemakPct: 0.25,
  lemakMinKg: 0.6,
  seratPer1000: 14,
  seratMin: 25,
  natriumMax: 2000,
  airMlKg: 33,
  tinggiMin: 100, tinggiMax: 230,
  adjustMax: 300,                 // penyesuaian kalori yang disetujui coach, maks ±300
  adviceStep: 125, adviceWindowDays: 28, adviceMinSpanDays: 14, adviceCooldownDays: 14
};

function _nutRound_(n, dp) {
  const f = Math.pow(10, dp || 0);
  return Math.round(n * f) / f;
}

/** Indeks massa tubuh + kategori Asia-Pasifik. null bila data kurang. */
function _nutBmi_(kg, cm) {
  kg = Number(kg); cm = Number(cm);
  if (!(kg > 0) || !(cm > 0)) return null;
  const v = kg / Math.pow(cm / 100, 2);
  const cat = v < 18.5 ? 'kurus' : v < 23 ? 'normal' : v < 25 ? 'lebih' : v < 30 ? 'obesitas1' : 'obesitas2';
  return { value: _nutRound_(v, 1), kategori: cat };
}

/** Rasio pinggang / tinggi: <0,5 baik, 0,5–0,59 waspada, ≥0,6 tinggi. */
function _nutWhtr_(waistCm, cm) {
  waistCm = Number(waistCm); cm = Number(cm);
  if (!(waistCm > 0) || !(cm > 0)) return null;
  const v = waistCm / cm;
  return { value: _nutRound_(v, 2), kategori: v < 0.5 ? 'baik' : v < 0.6 ? 'waspada' : 'tinggi' };
}

/** Usia penuh dari 'yyyy-MM-dd' (hari ini WIB bila today kosong); null bila tidak valid. */
function _nutAge_(birthDate, today) {
  const b = String(birthDate || '').split('-').map(Number);
  const t = String(today || _todayWib_()).split('-').map(Number);
  if (b.length !== 3 || t.length !== 3 || !b[0] || !t[0]) return null;
  let age = t[0] - b[0];
  if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age--;
  return age >= 0 && age < 120 ? age : null;
}

/** BMR (kkal/hari): Katch-McArdle bila lemak tubuh (%) ada, kalau tidak Mifflin-St Jeor. sex: 'L' | 'P'. */
function _nutBmr_(sex, kg, cm, age, bodyFatPct) {
  kg = Number(kg); cm = Number(cm); age = Number(age);
  if (!(kg > 0) || !(cm > 0) || !(age >= 0) || (sex !== 'L' && sex !== 'P')) return null;
  const bf = Number(bodyFatPct);
  if (bf > 3 && bf < 60) return Math.round(370 + 21.6 * kg * (1 - bf / 100));
  return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'L' ? 5 : -161));
}

/** Faktor aktivitas dari jumlah sesi latihan per minggu (rata-rata 4 minggu). */
function _nutActivity_(sessionsPerWeek) {
  const s = Number(sessionsPerWeek) || 0;
  return s < 2 ? 1.2 : s < 4 ? 1.375 : s < 6 ? 1.55 : 1.725;
}

/**
 * Target harian. in = { sex, kg, cm, birthDate|age, goal, sessionsPerWeek, bodyFat, risks: [...] , today }.
 * Mengembalikan { ok:false, missing:[…] } bila data kurang, selain itu angka + warnings (kode, bukan teks).
 */
function _nutTarget_(inp) {
  inp = inp || {};
  const goal = NUT_GOALS.indexOf(inp.goal) !== -1 ? inp.goal : null;
  const age = inp.age != null ? Number(inp.age) : _nutAge_(inp.birthDate, inp.today);
  const kg = Number(inp.kg), cm = Number(inp.cm);
  const missing = [];
  if (inp.sex !== 'L' && inp.sex !== 'P') missing.push('jenisKelamin');
  if (!(cm >= NUT.tinggiMin && cm <= NUT.tinggiMax)) missing.push('tinggi');
  if (!(kg > 0)) missing.push('berat');
  if (age == null || isNaN(age)) missing.push('tanggalLahir');
  if (!goal) missing.push('goal');
  if (missing.length) return { ok: false, missing: missing };

  const bmi = _nutBmi_(kg, cm);
  const bmr = _nutBmr_(inp.sex, kg, cm, age, inp.bodyFat);
  const factor = _nutActivity_(inp.sessionsPerWeek);
  const tdee = Math.round(bmr * factor);

  const warnings = [];
  (inp.risks || []).forEach(function(r) { if (warnings.indexOf(r) === -1) warnings.push(r); });
  if (age < 18 && warnings.indexOf('usiaMuda') === -1) warnings.push('usiaMuda');
  if (age > 65 && warnings.indexOf('usiaLanjut') === -1) warnings.push('usiaLanjut');
  if (bmi.value < 17.5 && warnings.indexOf('bmiRendah') === -1) warnings.push('bmiRendah');

  let mult = NUT.goalKal[goal];
  if (mult < 1) mult = Math.max(mult, warnings.length ? NUT.riskMin : NUT.turunMin);
  const adj = Math.max(-NUT.adjustMax, Math.min(NUT.adjustMax, Math.round(Number(inp.adjust) || 0)));
  let kal = Math.round(tdee * mult) + adj;
  if (warnings.length && kal < tdee) kal = Math.max(kal, Math.round(tdee * NUT.riskMin));
  const floor = Math.max(NUT.floorKal[inp.sex], bmr);
  if (kal < floor && kal < tdee) { kal = Math.round(floor); warnings.push('batasBawah'); }

  // BMI >= 30: protein dihitung dari berat target (BMI 25), bukan berat aktual.
  const refKg = bmi.value >= 30 ? 25 * Math.pow(cm / 100, 2) : kg;
  const protein = Math.round(Math.max(NUT.proteinKg[goal] * refKg, NUT.proteinMinKg * kg));
  const lemak = Math.round(Math.max(NUT.lemakPct * kal / 9, NUT.lemakMinKg * kg));
  const karbo = Math.max(0, Math.round((kal - protein * 4 - lemak * 9) / 4));
  return {
    ok: true,
    bmi: bmi, bmr: bmr, faktor: factor, tdee: tdee, goal: goal,
    kal: kal, adjust: adj, protein: protein, lemak: lemak, karbo: karbo,
    serat: Math.max(NUT.seratMin, Math.round(NUT.seratPer1000 * kal / 1000)),
    natrium: NUT.natriumMax,
    air: Math.round(NUT.airMlKg * kg),
    warnings: warnings
  };
}

/** Tambah header kolom gizi di MemberData (hanya sel yang masih kosong). Idempotent. */
function _ensureNutritionColumns_(sheet) {
  Object.keys(NUT_HEADERS).forEach(function(col) {
    const cell = sheet.getRange(1, Number(col));
    if (cell.getValue() === '') { cell.setValue(NUT_HEADERS[col]); cell.setFontWeight('bold'); }
  });
}

// ------------------------------------------------------------
// Admin: baca / simpan data gizi satu klien (T-1003)
// ------------------------------------------------------------
/** Pantangan makanan + penanda kondisi khusus yang diisi coach (disimpan sebagai daftar dipisah koma). */
const NUT_TAGS_FOOD = ['telur', 'seafood', 'kacang', 'susu', 'laktosa'];
const NUT_TAGS_RISK = ['hamil', 'gangguan-makan'];
const NUT_BUDGETS = ['hemat', 'standar', 'bebas'];
const NUT_STALE_DAYS = 28;

/** Murni: sesi selesai 28 hari terakhir dibagi 4 minggu. schedules = [{memberId, status, start}], today = 'yyyy-MM-dd'. */
function _nutSessionsPerWeek_(schedules, memberId, today) {
  const id = String(memberId).trim();
  const end = new Date(today + 'T23:59:59+07:00').getTime();
  const from = end - 28 * 86400000;
  let n = 0;
  (schedules || []).forEach(function(sc) {
    if (String(sc.memberId).trim() !== id || String(sc.status || '').toLowerCase() !== 'completed') return;
    const t = new Date(sc.start).getTime();
    if (!isNaN(t) && t > from && t <= end) n++;
  });
  return Math.round(n / 4 * 10) / 10;
}

/** Murni: hari antara dua 'yyyy-MM-dd'. */
function _nutDaysBetween_(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

function _nutSplit_(cell) {
  return String(cell == null ? '' : cell).split(',').map(function(s) { return s.trim(); }).filter(String);
}

/** Murni: penanda risiko dari jawaban skrining (7 jawaban + kondisi lain) dan tag coach. */
function _nutRisks_(healthAnswers, otherCondition, tags) {
  const risks = [];
  const a = (healthAnswers || []).map(function(x) { return String(x || '').trim().toLowerCase().indexOf('ya') === 0; });
  if (a[0] || a[1] || a[2] || a[5]) risks.push('penyakit');
  if (String(otherCondition || '').trim()) risks.push('penyakit');
  if ((tags || []).indexOf('hamil') !== -1) risks.push('hamil');
  if ((tags || []).indexOf('gangguan-makan') !== -1) risks.push('gangguanMakan');
  return risks.filter(function(r, i) { return risks.indexOf(r) === i; });
}

function _nutProfileFrom_(row) {
  const c = function(k) { return row[NUT_COLS[k] - 1]; };
  const tags = _nutSplit_(c('pantangan'));
  return {
    tinggi: c('tinggi') === '' || c('tinggi') == null ? '' : Number(c('tinggi')),
    jk: String(c('jk') || ''),
    goal: String(c('goal') || ''),
    pantangan: tags.filter(function(t) { return NUT_TAGS_FOOD.indexOf(t) !== -1; }),
    kondisi: tags.filter(function(t) { return NUT_TAGS_RISK.indexOf(t) !== -1; }),
    anggaran: NUT_BUDGETS.indexOf(String(c('anggaran'))) !== -1 ? String(c('anggaran')) : 'standar',
    aktif: String(c('aktif')).toLowerCase() !== 'tidak',
    adjust: Number(c('adjust')) || 0,
    birthDate: String(row[MEMBER_BIRTH_COL - 1] || '')
  };
}

const NUT_MISSING_LABELS = { jenisKelamin: 'Jenis kelamin', tinggi: 'Tinggi badan', berat: 'Berat badan', tanggalLahir: 'Tanggal lahir', goal: 'Goal gizi' };

/** Hitung profil, input turunan, BMI, WHtR, dan target satu klien dari baris MemberData. Dipakai admin dan portal. */
function _nutComputeFor_(row) {
  const id = String(row[0]).trim();
  const today = _todayWib_();
  const profile = _nutProfileFrom_(row);
  const entries = _readProgress_(id);
  const lastOf = function(key) {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i][key] !== '' && entries[i][key] != null) return { v: entries[i][key], date: entries[i].tanggal };
    return null;
  };
  const w = lastOf('berat'), waist = lastOf('pinggang');
  const asm = _latestRowFor_('Assessments', id), hs = _latestRowFor_('HealthScreening', id);
  const bodyFat = asm && asm.row[9] !== '' ? Number(asm.row[9]) : null;
  const stale = w ? _nutDaysBetween_(w.date, today) : null;
  const spw = _nutSessionsPerWeek_(_getSchedulesAll_(), id, today);
  const risks = _nutRisks_(hs ? [3, 4, 5, 6, 7, 8, 9].map(function(i) { return hs.row[i]; }) : [], hs ? hs.row[12] : '', profile.kondisi);
  const target = _nutTarget_({
    sex: profile.jk, kg: w ? w.v : 0, cm: profile.tinggi, birthDate: profile.birthDate, goal: profile.goal,
    sessionsPerWeek: spw, bodyFat: bodyFat, risks: risks, today: today, adjust: profile.adjust
  });
  if (!target.ok) target.missingLabels = target.missing.map(function(k) { return NUT_MISSING_LABELS[k] || k; });
  return {
    id: id, today: today, profile: profile, entries: entries, risks: risks,
    inputs: { kg: w ? w.v : null, kgDate: w ? w.date : '', staleDays: stale, stale: stale != null && stale > NUT_STALE_DAYS,
      waist: waist ? waist.v : null, bodyFat: bodyFat, sessionsPerWeek: spw, risks: risks },
    bmi: w && profile.tinggi ? _nutBmi_(w.v, profile.tinggi) : null,
    whtr: waist && profile.tinggi ? _nutWhtr_(waist.v, profile.tinggi) : null,
    target: target
  };
}

/** Admin: profil gizi, input turunan, BMI, WHtR, dan target satu klien. Privat: hanya admin. */
function getClientNutrition(token, memberId) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId);
  const c = _nutComputeFor_(m.row);
  return {
    profile: c.profile, inputs: c.inputs, bmi: c.bmi, whtr: c.whtr, target: c.target,
    advice: _nutAdviceFor_(c.id, c.profile, c.entries, c.today),
    options: { goals: NUT_GOALS, budgets: NUT_BUDGETS, pantangan: NUT_TAGS_FOOD, kondisi: NUT_TAGS_RISK }
  };
}

/** Murni: validasi data browser → nilai siap tulis (lempar error Indonesia). */
function _nutValidateProfile_(data) {
  data = data || {};
  const out = {};
  const t = String(data.tinggi == null ? '' : data.tinggi).replace(',', '.').trim();
  if (t === '') out.tinggi = '';
  else {
    const n = Number(t);
    if (!(n >= NUT.tinggiMin && n <= NUT.tinggiMax)) throw new Error('Tinggi badan harus antara ' + NUT.tinggiMin + ' dan ' + NUT.tinggiMax + ' cm.');
    out.tinggi = Math.round(n * 10) / 10;
  }
  const jk = String(data.jk == null ? '' : data.jk).trim().toUpperCase();
  if (jk !== '' && jk !== 'L' && jk !== 'P') throw new Error('Jenis kelamin harus L atau P.');
  out.jk = jk;
  const goal = String(data.goal == null ? '' : data.goal).trim();
  if (goal !== '' && NUT_GOALS.indexOf(goal) === -1) throw new Error('Goal gizi tidak dikenal.');
  out.goal = goal;
  const tags = [].concat(data.pantangan || [], data.kondisi || []).map(function(x) { return String(x).trim(); }).filter(String);
  tags.forEach(function(x) { if (NUT_TAGS_FOOD.indexOf(x) === -1 && NUT_TAGS_RISK.indexOf(x) === -1) throw new Error('Pantangan tidak dikenal: ' + x.slice(0, 30) + '.'); });
  out.tags = tags.filter(function(x, i) { return tags.indexOf(x) === i; }).join(',');
  const b = String(data.anggaran == null ? 'standar' : data.anggaran).trim() || 'standar';
  if (NUT_BUDGETS.indexOf(b) === -1) throw new Error('Anggaran makan tidak dikenal.');
  out.anggaran = b;
  out.aktif = data.aktif === false || data.aktif === 'tidak' ? 'tidak' : 'ya';
  return out;
}

/** Admin: simpan input gizi klien (tinggi, JK, goal, pantangan, kondisi, anggaran, aktif). */
function saveClientNutrition(token, memberId, data) {
  requireAdmin_(token);
  const v = _nutValidateProfile_(data);
  return _locked_(function() {
    const m = _memberRowOrThrow_(memberId);
    _ensureNutritionColumns_(m.sheet);
    const put = function(k, val) { m.sheet.getRange(m.rowNum, NUT_COLS[k]).setNumberFormat('@').setValue(val); };
    put('tinggi', v.tinggi); put('jk', v.jk); put('goal', v.goal);
    put('pantangan', v.tags); put('anggaran', v.anggaran); put('aktif', v.aktif);
    return { status: 'success' };
  });
}

// ------------------------------------------------------------
// Saran penyesuaian target (T-1004): tren berat → saran ±125 kkal ke coach; coach setuju/tolak.
// ------------------------------------------------------------
const NUT_ADVICE_HEADERS = ['ID', 'Member ID', 'Tanggal', 'Delta Kkal', 'Alasan', 'Status', 'Diputuskan Pada'];

function _nutAdviceSheet_() {
  const sheet = getOrCreateSheet_('NutritionAdvice', NUT_ADVICE_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  sheet.getRange('G:G').setNumberFormat('@');
  return sheet;
}

/**
 * Murni. entries = [{tanggal, berat}] urut tanggal; ctx = { pending: bool, lastDecision: 'yyyy-MM-dd' | '' }.
 * Mengembalikan { delta, alasan } atau null. Aturan: Rules.md baris 7.
 */
function _nutAdvise_(entries, goal, today, ctx) {
  ctx = ctx || {};
  if (ctx.pending || (goal !== 'turun' && goal !== 'naik')) return null;
  if (ctx.lastDecision && _nutDaysBetween_(ctx.lastDecision, today) < NUT.adviceCooldownDays) return null;
  const from = _addDaysIso_(today, -NUT.adviceWindowDays);
  const pts = (entries || []).filter(function(e) {
    return e.berat !== '' && e.berat != null && e.tanggal >= from && e.tanggal <= today && (!ctx.lastDecision || e.tanggal >= ctx.lastDecision);
  });
  if (pts.length < 3) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const span = _nutDaysBetween_(a.tanggal, b.tanggal);
  if (span < NUT.adviceMinSpanDays) return null;
  const weeks = span / 7;
  const slope = (Number(b.berat) - Number(a.berat)) / weeks;            // kg / minggu
  const pct = slope / Number(a.berat) * 100;                            // % berat / minggu
  const wk = Math.round(weeks);
  if (goal === 'turun') {
    if (pct < -1) return { delta: NUT.adviceStep, alasan: 'Berat turun lebih dari 1 % per minggu. Naikkan kalori sedikit agar otot terjaga.' };
    if (slope > -0.1) return { delta: -NUT.adviceStep, alasan: 'Berat belum turun dalam ' + wk + ' minggu terakhir.' };
  } else if (pct < 0.05) {
    return { delta: NUT.adviceStep, alasan: 'Berat belum naik dalam ' + wk + ' minggu terakhir.' };
  }
  return null;
}

function _nutAdviceRows_() {
  return _nutAdviceSheet_().getDataRange().getValues().slice(1).filter(function(r) { return r[0]; }).map(function(r) {
    return { id: String(r[0]), memberId: String(r[1]).trim(), tanggal: String(r[2]), delta: Number(r[3]) || 0, alasan: String(r[4]), status: String(r[5]), diputuskan: String(r[6] || '') };
  });
}

/** Saran milik satu klien: yang menunggu + keputusan terakhir. */
function _nutAdviceFor_(memberId, profile, entries, today) {
  const rows = _nutAdviceRows_().filter(function(r) { return r.memberId === String(memberId).trim(); });
  const pending = rows.filter(function(r) { return r.status === 'menunggu'; })[0] || null;
  const decided = rows.filter(function(r) { return r.status !== 'menunggu'; });
  const last = decided.length ? decided[decided.length - 1] : null;
  return { pending: pending, last: last, canCreate: !!_nutAdvise_(entries, profile.goal, today, { pending: !!pending, lastDecision: last ? last.diputuskan : '' }) };
}

/** Tulis saran baru bila aturan memintanya (idempoten: tidak ada saran ganda). */
function _nutRefreshAdvice_(memberId, profile, entries, today) {
  if (!profile.aktif) return null;
  return _locked_(function() {
    const f = _nutAdviceFor_(memberId, profile, entries, today);
    if (f.pending || !f.canCreate) return null;
    const rows = _nutAdviceRows_().filter(function(r) { return r.memberId === String(memberId).trim() && r.status !== 'menunggu'; });
    const last = rows.length ? rows[rows.length - 1] : null;
    const a = _nutAdvise_(entries, profile.goal, today, { pending: false, lastDecision: last ? last.diputuskan : '' });
    if (!a) return null;
    const id = 'NA-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    _nutAdviceSheet_().appendRow([id, String(memberId).trim(), today, a.delta, a.alasan, 'menunggu', '']);
    return id;
  });
}

/** Admin: setujui atau tolak saran. Setuju menambah penyesuaian kalori klien (maks ±300). */
function decideNutritionAdvice(token, memberId, adviceId, decision) {
  requireAdmin_(token);
  decision = String(decision || '');
  if (decision !== 'setuju' && decision !== 'tolak') throw new Error('Keputusan harus setuju atau tolak.');
  return _locked_(function() {
    const sheet = _nutAdviceSheet_();
    const data = sheet.getDataRange().getValues();
    let rowNum = 0, delta = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(adviceId) && String(data[i][1]).trim() === String(memberId).trim()) {
        if (String(data[i][5]) !== 'menunggu') throw new Error('Saran ini sudah diputuskan.');
        rowNum = i + 1; delta = Number(data[i][3]) || 0; break;
      }
    }
    if (!rowNum) throw new Error('Saran tidak ditemukan.');
    if (decision === 'setuju') {
      const m = _memberRowOrThrow_(memberId);
      _ensureNutritionColumns_(m.sheet);
      const cur = Number(m.row[NUT_COLS.adjust - 1]) || 0;
      const next = Math.max(-NUT.adjustMax, Math.min(NUT.adjustMax, cur + delta));
      m.sheet.getRange(m.rowNum, NUT_COLS.adjust).setNumberFormat('@').setValue(next);
    }
    sheet.getRange(rowNum, 6).setValue(decision);
    sheet.getRange(rowNum, 7).setValue(_todayWib_());
    CacheService.getScriptCache().remove('nut:scan');
    return { status: 'success' };
  });
}

/** Untuk dashboard coach: perbarui saran semua klien (maks sekali per 10 menit) lalu daftar yang menunggu. Nama depan saja. */
function _nutHubList_() {
  const cache = CacheService.getScriptCache();
  const today = _todayWib_();
  if (!cache.get('nut:scan')) {
    try {
      const w = {};
      _progressSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
        const v = r[3];
        if (!r[0] || v === '' || v == null) return;
        const id = String(r[1]).trim();
        (w[id] = w[id] || []).push({ tanggal: String(r[2]), berat: Number(v) });
      });
      _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(row) {
        if (!row[0]) return;
        const profile = _nutProfileFrom_(row), id = String(row[0]).trim();
        if (!profile.aktif || (profile.goal !== 'turun' && profile.goal !== 'naik') || !w[id]) return;
        w[id].sort(function(a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); });
        _nutRefreshAdvice_(id, profile, w[id], today);
      });
      cache.put('nut:scan', '1', 600);
    } catch (err) { Logger.log('Saran gizi dilewati: ' + err); }
  }
  const names = {};
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(r) { if (r[0]) names[String(r[0]).trim()] = String(r[1] || '').trim().split(/\s+/)[0]; });
  return _nutAdviceRows_().filter(function(r) { return r.status === 'menunggu'; }).map(function(r) {
    return { id: r.id, memberId: r.memberId, name: names[r.memberId] || '', delta: r.delta, alasan: r.alasan };
  });
}

// ------------------------------------------------------------
// Menu sehari, tukar item, daftar belanja (T-1011). Fungsi murni; data makanan = NUT_FOODS (NutrisiData.gs).
// Aturan: Rules.md baris 8, 9, 11.
// ------------------------------------------------------------
const NUT_MENU = {
  shares: { biasa: [['sarapan', 'Sarapan', 0.30], ['siang', 'Makan siang', 0.40], ['malam', 'Makan malam', 0.30]],
            ramadan: [['buka', 'Buka puasa', 0.45], ['sahur', 'Sahur', 0.35], ['camilan', 'Camilan malam', 0.20]] },
  portionMin: 0.5, portionMax: 4, portionNatural: 3, portionFix: 6, swapMax: 8, swapCount: 3
};

function _nutHash_(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Murni: id yang lolos pantangan + anggaran. opts = { pantangan: ['telur','seafood','kacang','susu','laktosa'], anggaran: 'hemat'|'standar'|'bebas' }. */
function _nutAllowed_(ids, opts, noFried) {
  opts = opts || {};
  const ban = opts.pantangan || [];
  const maxH = opts.anggaran === 'hemat' ? 1 : opts.anggaran === 'bebas' ? 3 : 2;
  const base = ids.filter(function(id) {
    const f = NUT_FOODS[id];
    if (!f) return false;
    if (f.a.some(function(a) { return ban.indexOf(a) !== -1; })) return false;
    if (ban.indexOf('laktosa') !== -1 && f.lak) return false;
    if (noFried && /goreng/i.test(f.n)) return false;
    return true;
  });
  const cheap = base.filter(function(id) { return NUT_FOODS[id].h <= maxH; });
  return cheap.length ? cheap : base;      // anggaran terlalu ketat: longgarkan dulu daripada tanpa pilihan
}

function _nutPortion_(id, gram) {
  const f = NUT_FOODS[id], por = f.por[0];
  const n = Math.round(gram / por[1] * 2) / 2;
  return { porsi: n, porsiNama: por[0], porsiGram: por[1] };
}

function _nutItem_(id, slot, gram) {
  const f = NUT_FOODS[id], x = gram / 100, r1 = function(v) { return Math.round(v * 10) / 10; };
  return Object.assign({ id: id, n: f.n, slot: slot, gram: Math.round(gram), kal: Math.round(f.kal * x), p: r1(f.p * x), l: r1(f.l * x), k: r1(f.k * x), e: f.e }, _nutPortion_(id, gram));
}

/** Murni: dua bahan (karbo c, protein p) agar total kalori dan protein sebuah makan tepat. Mengembalikan gram atau null. */
function _nutSolvePair_(cId, pId, kcal, prot) {
  const c = NUT_FOODS[cId], p = NUT_FOODS[pId];
  const a = c.kal / 100, b = p.kal / 100, d = c.p / 100, e = p.p / 100;
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-6) return null;
  const gC = (kcal * e - b * prot) / det, gP = (a * prot - d * kcal) / det;
  const inRange = function(id, g, max) { const base = NUT_FOODS[id].por[0][1]; return g >= base * NUT_MENU.portionMin && g <= base * max; };
  return { gC: gC, gP: gP, ok: inRange(cId, gC, NUT_MENU.portionMax) && inRange(pId, gP, NUT_MENU.portionMax),
           natural: inRange(cId, gC, NUT_MENU.portionNatural) && inRange(pId, gP, NUT_MENU.portionNatural) };
}

function _nutShares_(opts) {
  if (opts.ramadan) return NUT_MENU.shares.ramadan.map(function(s) { return s.slice(); });
  const sh = NUT_MENU.shares.biasa.map(function(s) { return s.slice(); });
  const h = opts.sessionHour;
  if (h != null && h !== '') {
    const w = Number(h) < 10 ? [0.35, 0.35, 0.30] : Number(h) < 15 ? [0.25, 0.45, 0.30] : [0.25, 0.35, 0.40];
    sh.forEach(function(s, i) { s[2] = w[i]; });
  }
  return sh;
}

/**
 * Menu satu hari. target = { kal, protein } (hasil _nutTarget_); opts = { pantangan, anggaran, seed, ramadan, sessionHour, dayFactor }.
 * Mengembalikan { meals: [{ key, label, items, totals }], totals } dengan kalori ±5 % dan protein ≥ 95 % target (bila ada bahan yang layak).
 */
function _nutMenu_(target, opts) {
  opts = opts || {};
  const kalDay = target.kal * (opts.dayFactor || 1), protDay = target.protein;
  const shares = _nutShares_(opts);
  const meals = [];
  let friedUsed = false;
  shares.forEach(function(sh, mi) {
    const key = sh[0], first = key === 'sarapan' || key === 'camilan';
    const kcal = kalDay * sh[2], prot = protDay * sh[2];
    const withVeg = key !== 'camilan';
    const withFruit = key !== 'malam' && key !== 'sahur';
    // sayur / buah: tetap satu porsi, ikut dihitung sebagai kalori tetap
    const pick = function(list, salt) { const a = _nutAllowed_(list, opts); return a.length ? a[_nutHash_(opts.seed + key + salt) % a.length] : null; };
    const vegId = withVeg ? pick(NUT_SLOTS.sayur, 'v') : null, fruitId = withFruit ? pick(NUT_SLOTS.buah, 'f') : null;
    const fixed = [];
    if (vegId) fixed.push(_nutItem_(vegId, 'sayur', NUT_FOODS[vegId].por[0][1]));
    if (fruitId) fixed.push(_nutItem_(fruitId, 'buah', NUT_FOODS[fruitId].por[0][1]));
    const fixK = fixed.reduce(function(s, i) { return s + NUT_FOODS[i.id].kal * i.gram / 100; }, 0);
    const fixP = fixed.reduce(function(s, i) { return s + NUT_FOODS[i.id].p * i.gram / 100; }, 0);
    const cands = _nutAllowed_(NUT_SLOTS.karbo[first ? 'sarapan' : 'utama'], opts);
    const pList = _nutAllowed_(NUT_SLOTS.protein[first ? 'sarapan' : 'utama'], opts, friedUsed);
    const feasible = [], natural = [];
    let best = null;
    cands.forEach(function(cId) {
      pList.forEach(function(pId) {
        const s = _nutSolvePair_(cId, pId, kcal - fixK, prot - fixP);
        if (!s) return;
        if (s.ok) { const pair = { c: cId, p: pId, gC: s.gC, gP: s.gP }; feasible.push(pair); if (s.natural) natural.push(pair); }
        else {
          const bC = NUT_FOODS[cId].por[0][1], bP = NUT_FOODS[pId].por[0][1];
          const gC = Math.max(bC * NUT_MENU.portionMin, Math.min(bC * NUT_MENU.portionMax, s.gC)), gP = Math.max(bP * NUT_MENU.portionMin, Math.min(bP * NUT_MENU.portionMax, s.gP));
          const err = Math.abs(gC - s.gC) / bC + Math.abs(gP - s.gP) / bP;
          if (!best || err < best.err) best = { c: cId, p: pId, gC: gC, gP: gP, err: err };
        }
      });
    });
    const pool = natural.length ? natural : feasible;
    const chosen = pool.length ? pool[_nutHash_(opts.seed + key + 'm') % pool.length] : best;
    if (!chosen) { meals.push({ key: key, label: sh[1], items: fixed, totals: _nutSum_(fixed) }); return; }
    const items = [_nutItem_(chosen.c, 'karbo', chosen.gC), _nutItem_(chosen.p, 'protein', chosen.gP)].concat(fixed);
    if (/goreng/i.test(NUT_FOODS[chosen.p].n)) friedUsed = true;
    meals.push({ key: key, label: sh[1], items: items, totals: _nutSum_(items) });
  });
  _nutFitDay_(meals, kalDay, protDay);
  return { meals: meals, totals: _nutSum_([].concat.apply([], meals.map(function(m) { return m.items; }))) };
}

/** Koreksi hari penuh: kalau satu makan tidak bisa tepat (batas porsi), karbo dan protein di makan lain menyesuaikan. */
function _nutFitDay_(meals, kalDay, protDay) {
  const all = function() { return [].concat.apply([], meals.map(function(m) { return m.items; })); };
  const rescale = function(slot, delta, per) {          // delta dalam kkal (slot karbo) atau gram protein (slot protein)
    const its = all().filter(function(i) { return i.slot === slot; });
    const base = its.reduce(function(a, i) { return a + (per === 'kal' ? NUT_FOODS[i.id].kal : NUT_FOODS[i.id].p) * i.gram / 100; }, 0);
    if (base <= 0) return;
    its.forEach(function(i) {
      const f = NUT_FOODS[i.id], unit = (per === 'kal' ? f.kal : f.p) / 100;
      if (unit <= 0) return;
      const part = unit * i.gram / base;
      const g = Math.max(f.por[0][1] * NUT_MENU.portionMin, Math.min(f.por[0][1] * NUT_MENU.portionFix, i.gram + delta * part / unit));
      const m = meals.filter(function(x) { return x.items.indexOf(i) !== -1; })[0];
      m.items[m.items.indexOf(i)] = _nutItem_(i.id, slot, g);
    });
  };
  for (let n = 0; n < 4; n++) {
    let tot = _nutSum_(all());
    if (tot.p < protDay * 0.97) rescale('protein', protDay * 0.98 - tot.p, 'p');
    tot = _nutSum_(all());
    if (Math.abs(tot.kal - kalDay) > kalDay * 0.01) rescale('karbo', kalDay - tot.kal, 'kal');
  }
  meals.forEach(function(m) { m.totals = _nutSum_(m.items); });
}

function _nutSum_(items) {
  const r1 = function(v) { return Math.round(v * 10) / 10; };
  return items.reduce(function(t, i) { return { kal: t.kal + i.kal, p: r1(t.p + i.p), l: r1(t.l + i.l), k: r1(t.k + i.k) }; }, { kal: 0, p: 0, l: 0, k: 0 });
}

/**
 * Tiga pengganti untuk satu item (slot yang sama, gizi utama sama). item = { id, slot, gram }; meal = 'sarapan'|…; offset = "Acak lagi".
 * Karbo dicocokkan di kalori, protein di protein, sayur/buah di kalori; pengganti yang selisihnya > 25 % dilewati.
 */
function _nutSwap_(item, mealKey, opts, offset) {
  opts = opts || {};
  const first = mealKey === 'sarapan' || mealKey === 'camilan';
  const list = item.slot === 'karbo' ? NUT_SLOTS.karbo[first ? 'sarapan' : 'utama'] : item.slot === 'protein' ? NUT_SLOTS.protein[first ? 'sarapan' : 'utama']
    : item.slot === 'sayur' ? NUT_SLOTS.sayur : NUT_SLOTS.buah;
  const old = NUT_FOODS[item.id], key = item.slot === 'protein' ? 'p' : 'kal';
  const target = old[key] * item.gram / 100;
  const out = _nutAllowed_(list, opts).filter(function(id) { return id !== item.id && NUT_FOODS[id][key] > 0; }).map(function(id) {
    const g = target / NUT_FOODS[id][key] * 100, base = NUT_FOODS[id].por[0][1];
    return { id: id, gram: g, ok: g >= base * NUT_MENU.portionMin && g <= base * NUT_MENU.swapMax, drift: Math.abs((NUT_FOODS[id][item.slot === 'protein' ? 'kal' : 'p'] * g / 100) - (old[item.slot === 'protein' ? 'kal' : 'p'] * item.gram / 100)) };
  }).filter(function(c) { return c.ok; });
  out.sort(function(a, b) { return a.drift - b.drift || (a.id < b.id ? -1 : 1); });
  const n = out.length, start = n ? ((offset || 0) * NUT_MENU.swapCount) % n : 0;
  const pick = [];
  for (let i = 0; i < Math.min(NUT_MENU.swapCount, n); i++) pick.push(out[(start + i) % n]);
  return pick.map(function(c) { return _nutItem_(c.id, item.slot, c.gram); });
}

/** Daftar belanja dari beberapa menu harian: jumlah gram per bahan, dikelompokkan, dalam porsi rumah tangga (dibulatkan ke atas). */
function _nutShopping_(menus) {
  const sum = {};
  (menus || []).forEach(function(menu) {
    menu.meals.forEach(function(m) { m.items.forEach(function(i) { sum[i.id] = (sum[i.id] || 0) + i.gram; }); });
  });
  const groups = {};
  Object.keys(sum).forEach(function(id) {
    const f = NUT_FOODS[id], por = f.por[0], gram = Math.ceil(sum[id] / 5) * 5;
    (groups[f.g] = groups[f.g] || []).push({ id: id, n: f.n, gram: gram, jumlah: Math.ceil(sum[id] / por[1]), satuan: por[0], e: f.e });
  });
  return Object.keys(groups).sort().map(function(g) {
    return { kelompok: g, items: groups[g].sort(function(a, b) { return a.n < b.n ? -1 : a.n > b.n ? 1 : 0; }) };
  });
}


// ------------------------------------------------------------
// Portal klien (T-1012): data gizi milik sendiri. Anggota selalu dari token, tidak pernah dari argumen.
// ------------------------------------------------------------
function _nutEnabled_() { return PropertiesService.getScriptProperties().getProperty('NUTRITION_ENABLED') !== 'false'; }

/** Jam (WIB) sesi latihan hari ini milik klien, atau null. */
function _nutSessionHour_(memberId, today) {
  const id = String(memberId).trim();
  let hour = null;
  _getSchedulesAll_().forEach(function(sc) {
    const st = String(sc.status || '').toLowerCase();
    if (String(sc.memberId).trim() !== id || st === 'cancelled' || st === 'available') return;
    const d = new Date(sc.start);
    if (isNaN(d.getTime()) || Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd') !== today) return;
    if (hour == null) hour = Number(Utilities.formatDate(d, 'Asia/Jakarta', 'H'));
  });
  return hour;
}

function _nutMenuOpts_(c, dayOffset) {
  const iso = dayOffset ? _addDaysIso_(c.today, dayOffset) : c.today;
  return { pantangan: c.profile.pantangan, anggaran: c.profile.anggaran, seed: c.id + '|' + iso, ramadan: _rmdIsRamadan_(iso),
    sessionHour: dayOffset ? null : _nutSessionHour_(c.id, c.today) };
}

/** Bentuk jawaban untuk klien: tanpa tag kondisi khusus, tanpa saran coach. */
function _nutritionFor_(row) {
  if (!_nutEnabled_()) return { enabled: false };
  const c = _nutComputeFor_(row);
  if (!c.profile.aktif) return { enabled: false };
  const p = c.profile;
  const out = {
    enabled: true, today: c.today,
    profile: { tinggi: p.tinggi, jk: p.jk, goal: p.goal, pantangan: p.pantangan, anggaran: p.anggaran, birthDate: p.birthDate },
    inputs: { kg: c.inputs.kg, kgDate: c.inputs.kgDate, stale: c.inputs.stale, waist: c.inputs.waist, sessionsPerWeek: c.inputs.sessionsPerWeek },
    bmi: c.bmi, whtr: c.whtr, target: _nutClientWarnings_(c.target), menu: null, log: _foodLogDay_(c.id, c.today),
    options: { goals: NUT_GOALS, budgets: NUT_BUDGETS, pantangan: NUT_TAGS_FOOD }
  };
  if (c.target.ok) out.menu = _nutMenu_(c.target, _nutMenuOpts_(c, 0));
  return out;
}

/** Kode kondisi khusus (milik coach/skrining) tampil ke klien sebagai satu peringatan umum. */
function _nutClientWarnings_(target) {
  if (!target.warnings) return target;
  const t = JSON.parse(JSON.stringify(target));
  t.warnings = t.warnings.map(function(w) { return (w === 'penyakit' || w === 'hamil' || w === 'gangguanMakan') ? 'kondisi' : w; })
    .filter(function(w, i, a) { return a.indexOf(w) === i; });
  return t;
}

function getMyNutrition(memberToken) {
  return _nutritionFor_(requireMember_(memberToken).row);
}

/** Klien mengisi tinggi, jenis kelamin, goal, pantangan, anggaran (dan tanggal lahir bila masih kosong). Kondisi khusus tetap milik coach. */
function saveMyNutritionProfile(memberToken, data) {
  const found = requireMember_(memberToken);
  if (!_nutEnabled_()) throw new Error('Fitur gizi sedang dimatikan.');
  data = data || {};
  const cur = _nutProfileFrom_(found.row);
  const v = _nutValidateProfile_({ tinggi: data.tinggi, jk: data.jk, goal: data.goal, pantangan: data.pantangan, kondisi: cur.kondisi, anggaran: data.anggaran, aktif: cur.aktif });
  let birth = String(data.birthDate == null ? '' : data.birthDate).trim();
  if (birth && (!_validDate_(birth) || birth > _todayWib_())) throw new Error('Tanggal lahir tidak valid.');
  return _locked_(function() {
    const m = _memberRowOrThrow_(found.row[0]);
    _ensureNutritionColumns_(m.sheet);
    const put = function(k, val) { m.sheet.getRange(m.rowNum, NUT_COLS[k]).setNumberFormat('@').setValue(val); };
    put('tinggi', v.tinggi); put('jk', v.jk); put('goal', v.goal); put('pantangan', v.tags); put('anggaran', v.anggaran);
    if (birth && !String(m.row[MEMBER_BIRTH_COL - 1] || '').trim()) {
      _ensureCareColumns_(m.sheet);
      m.sheet.getRange(m.rowNum, MEMBER_BIRTH_COL).setNumberFormat('@').setValue(birth);
    }
    const fresh = _memberRowOrThrow_(found.row[0]);
    return _nutritionFor_(fresh.row);
  });
}

/** Daftar belanja 7 hari ke depan (dihitung hanya saat diminta). */
function getMyShopping(memberToken) {
  const row = requireMember_(memberToken).row;
  if (!_nutEnabled_()) return { enabled: false, groups: [] };
  const c = _nutComputeFor_(row);
  if (!c.profile.aktif || !c.target.ok) return { enabled: false, groups: [] };
  const menus = [];
  for (let d = 0; d < 7; d++) menus.push(_nutMenu_(c.target, _nutMenuOpts_(c, d)));
  return { enabled: true, groups: _nutShopping_(menus) };
}

/** Tiga pengganti untuk satu item menu hari ini. item = { id, slot, gram }. */
function swapMyMenuItem(memberToken, item, mealKey, offset) {
  const row = requireMember_(memberToken).row;
  if (!_nutEnabled_()) throw new Error('Fitur gizi sedang dimatikan.');
  item = item || {};
  if (!NUT_FOODS[item.id]) throw new Error('Makanan tidak dikenal.');
  if (['karbo', 'protein', 'sayur', 'buah'].indexOf(item.slot) === -1) throw new Error('Bagian menu tidak dikenal.');
  const gram = Number(item.gram);
  if (!(gram > 0 && gram < 2000)) throw new Error('Porsi tidak valid.');
  const p = _nutProfileFrom_(row);
  return _nutSwap_({ id: item.id, slot: item.slot, gram: gram }, String(mealKey || ''), { pantangan: p.pantangan, anggaran: p.anggaran }, Math.max(0, Math.min(50, Math.floor(Number(offset) || 0))));
}


// ------------------------------------------------------------
// Catatan makan klien (T-1020): satu baris per makanan, angka disalin (snapshot) saat dicatat.
// ------------------------------------------------------------
const FOODLOG_HEADERS = ['ID', 'Member ID', 'Tanggal', 'Waktu', 'Food ID', 'Nama', 'Gram', 'Porsi', 'Kal', 'Protein', 'Lemak', 'Karbo', 'Sumber', 'Dibuat Pada'];
const NUT_MEALS = ['sarapan', 'siang', 'malam', 'camilan'];
const FOODLOG_LIMITS = { perDay: 60, backDays: 7, gramMax: 2000, throttleSeconds: 2, nameMax: 60, kalMax: 3000, macroMax: 500, favorites: 8, recent: 8 };

function _foodLogSheet_() {
  const sheet = getOrCreateSheet_('FoodLog', FOODLOG_HEADERS);
  sheet.getRange('C:C').setNumberFormat('@');
  sheet.getRange('E:E').setNumberFormat('@');
  return sheet;
}

function _nutR1_(v) { return Math.round(v * 10) / 10; }

/** Murni: validasi satu catatan dari browser → baris siap simpan (tanpa ID/tanggal). Lempar error Indonesia. */
function _foodLogEntry_(e) {
  e = e || {};
  const waktu = String(e.waktu || '');
  if (NUT_MEALS.indexOf(waktu) === -1) throw new Error('Pilih waktu makan.');
  if (e.id && !e.custom) {
    const f = NUT_FOODS[String(e.id)];
    if (!f) throw new Error('Makanan tidak dikenal.');
    let gram = Number(e.gram);
    if (!(gram > 0) && Number(e.porsi) > 0) gram = Number(e.porsi) * f.por[0][1];
    if (!(gram > 0 && gram <= FOODLOG_LIMITS.gramMax)) throw new Error('Porsi harus antara 1 dan ' + FOODLOG_LIMITS.gramMax + ' gram.');
    gram = Math.round(gram * 10) / 10;
    const x = gram / 100, por = gram / f.por[0][1];
    return { waktu: waktu, foodId: String(e.id), nama: f.n, gram: gram, porsi: _nutR1_(por) + ' ' + f.por[0][0].replace(/^1 /, ''),
      kal: Math.round(f.kal * x), p: _nutR1_(f.p * x), l: _nutR1_(f.l * x), k: _nutR1_(f.k * x), sumber: f.e ? 'perkiraan' : 'tkpi' };
  }
  const c = e.custom || {};
  const nama = String(c.nama == null ? '' : c.nama).trim();
  if (!nama) throw new Error('Isi nama makanan.');
  if (nama.length > FOODLOG_LIMITS.nameMax) throw new Error('Nama makanan maksimal ' + FOODLOG_LIMITS.nameMax + ' karakter.');
  const num = function(v, max, label) {
    const t = String(v == null || v === '' ? 0 : v).replace(',', '.');
    const n = Number(t);
    if (isNaN(n) || n < 0 || n > max) throw new Error(label + ' harus antara 0 dan ' + max + '.');
    return n;
  };
  const kal = num(c.kal, FOODLOG_LIMITS.kalMax, 'Kalori');
  const p = num(c.p, FOODLOG_LIMITS.macroMax, 'Protein'), l = num(c.l, FOODLOG_LIMITS.macroMax, 'Lemak'), k = num(c.k, FOODLOG_LIMITS.macroMax, 'Karbo');
  const n = Math.max(0.1, Math.min(20, Number(String(e.jumlah == null ? 1 : e.jumlah).replace(',', '.')) || 1));
  return { waktu: waktu, foodId: '', nama: nama, gram: 0, porsi: _nutR1_(n) + ' porsi', kal: Math.round(kal * n), p: _nutR1_(p * n), l: _nutR1_(l * n), k: _nutR1_(k * n), sumber: 'sendiri' };
}

function _foodLogRows_(memberId) {
  const id = String(memberId).trim();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FoodLog');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1).filter(function(r) { return r[0] && String(r[1]).trim() === id; }).map(function(r) {
    return { id: String(r[0]), tanggal: String(r[2]), waktu: String(r[3]), foodId: String(r[4] || ''), nama: String(r[5]), gram: Number(r[6]) || 0, porsi: String(r[7]),
      kal: Number(r[8]) || 0, p: Number(r[9]) || 0, l: Number(r[10]) || 0, k: Number(r[11]) || 0, sumber: String(r[12]) };
  });
}

function _foodLogTotals_(items) {
  return items.reduce(function(t, i) { return { kal: t.kal + i.kal, p: _nutR1_(t.p + i.p), l: _nutR1_(t.l + i.l), k: _nutR1_(t.k + i.k) }; }, { kal: 0, p: 0, l: 0, k: 0 });
}

/** Murni: catatan hari tertentu + yang sering dan terakhir dimakan (30 hari), dari semua baris klien. */
function _foodLogView_(rows, day, today) {
  const items = rows.filter(function(r) { return r.tanggal === day; });
  const since = _addDaysIso_(today, -30);
  const count = {}, last = {}, sample = {};
  rows.filter(function(r) { return r.tanggal >= since && r.tanggal < day + 'z'; }).forEach(function(r) {
    const key = r.foodId || ('~' + r.nama.toLowerCase());
    count[key] = (count[key] || 0) + 1;
    if (!last[key] || r.tanggal >= last[key]) { last[key] = r.tanggal; sample[key] = r; }
  });
  const pack = function(r) { return { foodId: r.foodId, nama: r.nama, gram: r.gram, porsi: r.porsi, kal: r.kal, p: r.p, l: r.l, k: r.k, sumber: r.sumber }; };
  const keys = Object.keys(count);
  const favorites = keys.filter(function(k) { return count[k] >= 2; }).sort(function(a, b) { return count[b] - count[a] || (a < b ? -1 : 1); }).slice(0, FOODLOG_LIMITS.favorites).map(function(k) { return pack(sample[k]); });
  const recent = keys.sort(function(a, b) { return last[a] < last[b] ? 1 : last[a] > last[b] ? -1 : (a < b ? -1 : 1); }).slice(0, FOODLOG_LIMITS.recent).map(function(k) { return pack(sample[k]); });
  return { tanggal: day, items: items, totals: _foodLogTotals_(items), favorites: favorites, recent: recent };
}

function _foodLogDay_(memberId, day) {
  const today = _todayWib_();
  return _foodLogView_(_foodLogRows_(memberId), day || today, today);
}

function _foodLogAppend_(sheet, memberId, day, entry) {
  const id = 'FL-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  sheet.appendRow([id, String(memberId).trim(), day, entry.waktu, entry.foodId, entry.nama, entry.gram, entry.porsi, entry.kal, entry.p, entry.l, entry.k, entry.sumber, new Date().toISOString()]);
  return id;
}

function _foodLogDayArg_(tanggal) {
  const today = _todayWib_();
  const day = tanggal == null || tanggal === '' ? today : String(tanggal);
  if (!_validDate_(day) || day > today || _nutDaysBetween_(day, today) > FOODLOG_LIMITS.backDays) throw new Error('Tanggal catatan tidak valid.');
  return day;
}

/** Klien mencatat makanan (dari daftar atau buatan sendiri). Anggota dari token. */
function logMyFood(memberToken, entry) {
  const found = requireMember_(memberToken);
  if (!_nutEnabled_()) throw new Error('Fitur gizi sedang dimatikan.');
  const memberId = String(found.row[0]).trim();
  const day = _foodLogDayArg_(entry && entry.tanggal);
  const e = _foodLogEntry_(entry);
  // Tanpa jeda per catatan: klien sering mencatat beberapa makanan berturut-turut. Pengaman = batas harian.
  return _locked_(function() {
    const sheet = _foodLogSheet_();
    if (_foodLogRows_(memberId).filter(function(r) { return r.tanggal === day; }).length >= FOODLOG_LIMITS.perDay) throw new Error('Catatan hari ini sudah penuh.');
    _foodLogAppend_(sheet, memberId, day, e);
    return _foodLogDay_(memberId, day);
  });
}

/** Hapus satu catatan milik sendiri. Catatan klien lain dijawab "tidak ditemukan". */
function deleteMyFood(memberToken, logId) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  return _locked_(function() {
    const sheet = _foodLogSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(logId) && String(data[i][1]).trim() === memberId) {
        const day = String(data[i][2]);
        sheet.deleteRow(i + 1);
        return _foodLogDay_(memberId, day);
      }
    }
    throw new Error('Catatan tidak ditemukan.');
  });
}

/** Catatan satu hari (default hari ini), favorit, dan terakhir dimakan. */
function getMyFoodLog(memberToken, tanggal) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  if (!_nutEnabled_()) return { enabled: false };
  return Object.assign({ enabled: true }, _foodLogDay_(memberId, _foodLogDayArg_(tanggal)));
}

/** Salin catatan kemarin (semua, atau satu waktu makan) ke hari ini. Hanya yang belum ada hari ini. */
function copyMyFoodYesterday(memberToken, waktu) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  if (!_nutEnabled_()) throw new Error('Fitur gizi sedang dimatikan.');
  if (waktu && NUT_MEALS.indexOf(String(waktu)) === -1) throw new Error('Waktu makan tidak dikenal.');
  const today = _todayWib_(), yesterday = _addDaysIso_(today, -1);
  if (!_throttle_('foodcopy_' + memberId, FOODLOG_LIMITS.throttleSeconds)) throw new Error('Terlalu cepat. Coba lagi sebentar.');
  return _locked_(function() {
    const rows = _foodLogRows_(memberId);
    const have = rows.filter(function(r) { return r.tanggal === today; });
    const keyOf = function(r) { return [r.waktu, r.foodId, r.nama, r.gram, r.porsi].join('|'); };
    const taken = {};
    have.forEach(function(r) { taken[keyOf(r)] = (taken[keyOf(r)] || 0) + 1; });
    const src = rows.filter(function(r) { return r.tanggal === yesterday && (!waktu || r.waktu === waktu); }).filter(function(r) {
      if (taken[keyOf(r)] > 0) { taken[keyOf(r)]--; return false; }       // sudah ada hari ini: jangan dobel
      return true;
    });
    if (!src.length) {
      if (rows.some(function(r) { return r.tanggal === yesterday && (!waktu || r.waktu === waktu); })) return _foodLogDay_(memberId, today);
      throw new Error('Kemarin belum ada catatan.');
    }
    if (have.length + src.length > FOODLOG_LIMITS.perDay) throw new Error('Catatan hari ini akan melebihi batas.');
    const sheet = _foodLogSheet_();
    src.forEach(function(r) { _foodLogAppend_(sheet, memberId, today, { waktu: r.waktu, foodId: r.foodId, nama: r.nama, gram: r.gram, porsi: r.porsi, kal: r.kal, p: r.p, l: r.l, k: r.k, sumber: r.sumber }); });
    return _foodLogDay_(memberId, today);
  });
}

/** Admin: catatan makan satu klien, 7 hari terakhir (per hari: total dan item). Privat. */
function getClientFoodLog(token, memberId) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const today = _todayWib_(), since = _addDaysIso_(today, -6);
  const rows = _foodLogRows_(id).filter(function(r) { return r.tanggal >= since; });
  const days = [];
  for (let d = 0; d < 7; d++) {
    const day = _addDaysIso_(today, -d);
    const items = rows.filter(function(r) { return r.tanggal === day; });
    days.push({ tanggal: day, items: items, totals: _foodLogTotals_(items) });
  }
  return { days: days };
}


// ------------------------------------------------------------
// Pengingat makan (T-1030): satu baris "Target hari ini N kkal." Hanya kalori; tidak ada berat, BMI, protein, atau kondisi.
// ------------------------------------------------------------
function _nutReminderLine_(kal) {
  const n = Math.round(Number(kal));
  if (!(n > 0)) return '';
  return '\n\nTarget hari ini ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' kkal.';
}

/** Kalori target semua klien yang Gizi-nya aktif dan datanya lengkap: { memberId: kkal }. Membaca tiap sheet satu kali. */
function _nutBulkCalories_() {
  const out = {};
  if (!_nutEnabled_()) return out;
  const today = _todayWib_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rowsOf = function(name) { const sh = ss.getSheetByName(name); return sh && sh.getLastRow() >= 2 ? sh.getDataRange().getValues().slice(1) : []; };
  const weights = {};
  rowsOf('Progress').forEach(function(r) {
    const id = String(r[1]).trim(), kg = Number(r[3]), d = String(r[2]);
    if (!r[0] || !(kg > 0)) return;
    if (!weights[id] || d >= weights[id].d) weights[id] = { d: d, kg: kg };
  });
  const latest = function(name) { const m = {}; rowsOf(name).forEach(function(r) { if (r[0]) m[String(r[1]).trim()] = r; }); return m; };
  const asm = latest('Assessments'), hs = latest('HealthScreening');
  const schedules = _getSchedulesAll_();
  _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(row) {
    if (!row[0]) return;
    const id = String(row[0]).trim(), profile = _nutProfileFrom_(row);
    if (!profile.aktif || !profile.goal || !weights[id]) return;
    const h = hs[id], a = asm[id];
    const t = _nutTarget_({
      sex: profile.jk, kg: weights[id].kg, cm: profile.tinggi, birthDate: profile.birthDate, goal: profile.goal,
      sessionsPerWeek: _nutSessionsPerWeek_(schedules, id, today), bodyFat: a && a[9] !== '' ? Number(a[9]) : null,
      risks: _nutRisks_(h ? [3, 4, 5, 6, 7, 8, 9].map(function(i) { return h[i]; }) : [], h ? h[12] : '', profile.kondisi), today: today, adjust: profile.adjust
    });
    if (t.ok) out[id] = t.kal;
  });
  return out;
}
