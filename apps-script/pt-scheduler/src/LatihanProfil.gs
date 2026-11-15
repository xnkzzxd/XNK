// Fase U (T-1604): profil latihan klien di MemberData kolom AG–AQ (nomor kolom tetap, pola sama dengan kolom Gizi X–AF).
// Dipakai generator program otomatis (ProgramGen.gs, Rilis 2). Semua isian divalidasi di sini; kolom ditambah idempoten.

const PG_COLS = { level: 33, hari: 34, auto: 35, blokMulai: 36, blokKe: 37, pantangan: 38, durasi: 39, tujuan: 40, tukar: 41, formOk: 42, fokus: 43 };
const PG_HEADERS = { 33: 'Level Latihan', 34: 'Hari Latihan', 35: 'Program Otomatis', 36: 'Blok Mulai', 37: 'Blok Ke', 38: 'Pantangan Gerakan',
  39: 'Durasi Sesi', 40: 'Tujuan Latihan', 41: 'Tukar Gerakan', 42: 'Form OK', 43: 'Otot Fokus' };
const PG_GOALS = ['kekuatan', 'otot', 'fatloss', 'bugar'];
const PG_DAYS = [2, 3, 4];
const PG_DURATIONS = [30, 45, 60];
const PG_FOCUS_MAX = 2;
// Pengalaman di form daftar (LandingScript.html, reg-experience) → level, dibulatkan ke bawah (konservatif).
const PG_EXPERIENCE_LEVEL = { pemula: 'pemula-banget', menengah: 'pemula', lanjutan: 'menengah' };

/** Tambah header kolom profil latihan di MemberData (hanya sel kosong). Idempoten. */
function _ensureProgramProfileColumns_(sheet) {
  Object.keys(PG_HEADERS).forEach(function(col) {
    const cell = sheet.getRange(1, Number(col));
    if (cell.getValue() === '') { cell.setValue(PG_HEADERS[col]); cell.setFontWeight('bold'); }
  });
}

/** Murni: tujuan latihan dari teks goal lama (MemberData D) bila kolom AN kosong. */
function _pgGoalFromText_(goal, nutGoal) {
  const t = String(goal || '').toLowerCase();
  if (/strength|kekuatan/.test(t)) return 'kekuatan';
  if (/muscle|otot|bulk|hypertrophy/.test(t)) return 'otot';
  if (/weight loss|fat|turun|lemak|diet|body transformation/.test(t) || nutGoal === 'turun') return 'fatloss';
  if (nutGoal === 'naik') return 'otot';
  return 'bugar';
}

/** Murni: baris MemberData → profil latihan (kosong = belum diisi klien). */
function _pgProfileFrom_(row) {
  const c = function(k) { const v = row[PG_COLS[k] - 1]; return v == null ? '' : v; };
  const json = function(v, d) { try { const x = v ? JSON.parse(String(v)) : d; return x && typeof x === 'object' ? x : d; } catch (e) { return d; } };
  const list = function(v) { return String(v || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean); };
  const level = String(c('level'));
  const hari = Number(c('hari')), durasi = Number(c('durasi'));
  const tujuan = String(c('tujuan'));
  return {
    level: GYM_LEVELS.indexOf(level) !== -1 ? level : '',
    hari: PG_DAYS.indexOf(hari) !== -1 ? hari : '',
    durasi: PG_DURATIONS.indexOf(durasi) !== -1 ? durasi : '',
    tujuan: PG_GOALS.indexOf(tujuan) !== -1 ? tujuan : _pgGoalFromText_(row[3], String(row[NUT_COLS.goal - 1] || '')),
    tujuanDiisi: PG_GOALS.indexOf(tujuan) !== -1,
    auto: String(c('auto')) !== 'tidak',
    blokMulai: _isoDateCell_(c('blokMulai')) || '',
    blokKe: Number(c('blokKe')) || 0,
    pantangan: list(c('pantangan')).filter(function(t) { return GYM_AVOID_TAGS.indexOf(t) !== -1; }),
    tukar: json(c('tukar'), {}),
    formOk: json(c('formOk'), {}),
    fokus: list(c('fokus')).filter(function(t) { return EX_TARGETS.indexOf(t) !== -1; }).slice(0, PG_FOCUS_MAX)
  };
}

/** Murni: validasi isian profil dari klien atau coach. Hanya kunci yang dikirim yang diubah. */
function _pgValidateProfile_(p) {
  if (!p || typeof p !== 'object') throw new Error('Data profil latihan tidak valid.');
  const out = {};
  if (p.level !== undefined) { if (GYM_LEVELS.indexOf(p.level) === -1) throw new Error('Pilih level latihan.'); out.level = p.level; }
  if (p.hari !== undefined) { const h = Number(p.hari); if (PG_DAYS.indexOf(h) === -1) throw new Error('Hari latihan per minggu harus 2, 3, atau 4.'); out.hari = h; }
  if (p.durasi !== undefined) { const d = Number(p.durasi); if (PG_DURATIONS.indexOf(d) === -1) throw new Error('Durasi sesi harus 30, 45, atau 60 menit.'); out.durasi = d; }
  if (p.tujuan !== undefined) { if (PG_GOALS.indexOf(p.tujuan) === -1) throw new Error('Pilih tujuan latihan.'); out.tujuan = p.tujuan; }
  if (p.fokus !== undefined) {
    const f = (Array.isArray(p.fokus) ? p.fokus : []).map(String);
    if (f.length > PG_FOCUS_MAX) throw new Error('Otot fokus maksimal ' + PG_FOCUS_MAX + '.');
    f.forEach(function(t) { if (EX_TARGETS.indexOf(t) === -1 || t === 'cardiovascular system') throw new Error('Otot fokus "' + t + '" tidak dikenal.'); });
    out.fokus = f;
  }
  if (p.auto !== undefined) out.auto = !!p.auto;
  if (p.pantangan !== undefined) {
    const t = (Array.isArray(p.pantangan) ? p.pantangan : []).map(String);
    t.forEach(function(x) { if (GYM_AVOID_TAGS.indexOf(x) === -1) throw new Error('Pantangan gerakan "' + x + '" tidak dikenal.'); });
    out.pantangan = t;
  }
  return out;
}

/** Tulis profil latihan yang sudah divalidasi ke baris MemberData (di dalam lock pemanggil). */
function _pgWrite_(m, v) {
  _ensureProgramProfileColumns_(m.sheet);
  const put = function(k, val) { m.sheet.getRange(m.rowNum, PG_COLS[k]).setNumberFormat('@').setValue(val); };
  if (v.level !== undefined) put('level', v.level);
  if (v.hari !== undefined) put('hari', String(v.hari));
  if (v.durasi !== undefined) put('durasi', String(v.durasi));
  if (v.tujuan !== undefined) put('tujuan', v.tujuan);
  if (v.fokus !== undefined) put('fokus', v.fokus.join(','));
  if (v.auto !== undefined) put('auto', v.auto ? '' : 'tidak');
  if (v.pantangan !== undefined) put('pantangan', v.pantangan.join(','));
  if (v.tukar !== undefined) put('tukar', JSON.stringify(v.tukar));
  if (v.formOk !== undefined) put('formOk', JSON.stringify(v.formOk));
  if (v.blokMulai !== undefined) put('blokMulai', v.blokMulai);
  if (v.blokKe !== undefined) put('blokKe', String(v.blokKe));
}

/** Murni: pengalaman dari form daftar → level (kosong bila tidak dikenal). */
function _pgLevelFromExperience_(exp) { return PG_EXPERIENCE_LEVEL[String(exp || '').trim().toLowerCase()] || ''; }
