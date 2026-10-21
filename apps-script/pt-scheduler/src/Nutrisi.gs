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
