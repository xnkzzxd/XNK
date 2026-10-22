// ============================================================
// Nutrisi.gs — Gizi klien (Phase P). Aturan: docs/nutrition/Rules.md.
// Fungsi murni (BMI, WHtR, BMR, TDEE, target) + kolom MemberData baru.
// Semua angka adalah estimasi. Data gizi klien bersifat privat: tidak ke Telegram,
// cache admin, atau respons publik.
// ============================================================

// Kolom MemberData baru (kanan dari "Panduan" kolom W). Tanggal lahir = MEMBER_BIRTH_COL.
const NUT_COLS = { tinggi: 24, jk: 25, goal: 26, pantangan: 27, anggaran: 28, aktif: 29 };
const NUT_HEADERS = { 24: 'Tinggi (cm)', 25: 'Jenis Kelamin', 26: 'Goal Gizi', 27: 'Pantangan Makanan', 28: 'Anggaran Makan', 29: 'Gizi Aktif' };
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
  tinggiMin: 100, tinggiMax: 230
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
  let kal = Math.round(tdee * mult);
  const floor = Math.max(NUT.floorKal[inp.sex], bmr);
  if (kal < floor && mult < 1) { kal = Math.round(floor); warnings.push('batasBawah'); }

  // BMI >= 30: protein dihitung dari berat target (BMI 25), bukan berat aktual.
  const refKg = bmi.value >= 30 ? 25 * Math.pow(cm / 100, 2) : kg;
  const protein = Math.round(Math.max(NUT.proteinKg[goal] * refKg, NUT.proteinMinKg * kg));
  const lemak = Math.round(Math.max(NUT.lemakPct * kal / 9, NUT.lemakMinKg * kg));
  const karbo = Math.max(0, Math.round((kal - protein * 4 - lemak * 9) / 4));
  return {
    ok: true,
    bmi: bmi, bmr: bmr, faktor: factor, tdee: tdee, goal: goal,
    kal: kal, protein: protein, lemak: lemak, karbo: karbo,
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
    birthDate: String(row[MEMBER_BIRTH_COL - 1] || '')
  };
}

const NUT_MISSING_LABELS = { jenisKelamin: 'Jenis kelamin', tinggi: 'Tinggi badan', berat: 'Berat badan', tanggalLahir: 'Tanggal lahir', goal: 'Goal gizi' };

/** Admin: profil gizi, input turunan, BMI, WHtR, dan target satu klien. Privat: hanya admin. */
function getClientNutrition(token, memberId) {
  requireAdmin_(token);
  const m = _memberRowOrThrow_(memberId), id = String(m.row[0]).trim();
  const today = _todayWib_();
  const profile = _nutProfileFrom_(m.row);
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
    sessionsPerWeek: spw, bodyFat: bodyFat, risks: risks, today: today
  });
  if (!target.ok) target.missingLabels = target.missing.map(function(k) { return NUT_MISSING_LABELS[k] || k; });
  return {
    profile: profile,
    inputs: { kg: w ? w.v : null, kgDate: w ? w.date : '', staleDays: stale, stale: stale != null && stale > NUT_STALE_DAYS,
      waist: waist ? waist.v : null, bodyFat: bodyFat, sessionsPerWeek: spw, risks: risks },
    bmi: w && profile.tinggi ? _nutBmi_(w.v, profile.tinggi) : null,
    whtr: waist && profile.tinggi ? _nutWhtr_(waist.v, profile.tinggi) : null,
    target: target,
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
