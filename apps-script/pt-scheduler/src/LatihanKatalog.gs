// Fase U (T-1602): katalog alat gym XNK — gerakan yang boleh dipakai generator program otomatis, per level.
// Otot utama/pendukung per gerakan: docs/program/Otot.md (sumber EMG/MRI). Aturan pemakaian: docs/program/Rules.md.
// Sheet `GymExercises` diisi sekali (seed) saat pertama dibaca: 8 gerakan "pemula banget" dari owner (aktif) + kardio
// (aktif) + usulan level pemula/menengah (NONAKTIF, owner mencentang yang alatnya ada di gym).

const GYM_HEADERS = ['ID', 'Nama', 'Exercise ID', 'Level Min', 'Pola', 'Otot Utama', 'Otot Pendukung', 'Jenis', 'Rep Min', 'Rep Max',
  'Hindari Bila', 'Varian Berikut', 'Unilateral', 'Aktif', 'Urutan', 'Diubah Pada'];
const GYM_LEVELS = ['pemula-banget', 'pemula', 'menengah'];
const GYM_PATTERNS = ['lutut', 'pinggul', 'dorong-h', 'dorong-v', 'tarik-h', 'tarik-v', 'isolasi', 'kardio', 'keseimbangan'];
const GYM_AVOID_TAGS = ['lutut', 'punggung-bawah', 'bahu', 'hamil'];
const GYM_MAX = 120;

// [id, nama, exId, level, pola, utama, pendukung, jenis, repMin, repMax, hindari, varianBerikut, unilateral, aktif]
const GYM_SEED_ = [
  ['gym:leg-press-45', 'Leg Press (45°)', '0739', 'pemula-banget', 'lutut', 'quads', 'glutes,adductors', 'beban', 8, 12, 'lutut', '', false, true],
  ['gym:squat-machine', 'Squat (Machine)', '', 'pemula-banget', 'lutut', 'quads', 'glutes,adductors', 'beban', 8, 12, 'lutut,punggung-bawah', '', false, true],
  ['gym:hip-thrust-machine', 'Hip Thrust (Machine)', '', 'pemula-banget', 'pinggul', 'glutes', 'hamstrings', 'beban', 8, 12, 'hamil', '', false, true],
  ['gym:incline-push-up', 'Incline Push Up', '0493', 'pemula-banget', 'dorong-h', 'pectorals', 'delts,triceps,abs', 'badan', 8, 12, 'bahu', 'gym:push-up', false, true],
  ['gym:lat-pulldown', 'Lat Pulldown (Cable)', '2330', 'pemula-banget', 'tarik-v', 'lats', 'upper back,biceps,delts', 'beban', 8, 12, 'bahu', '', false, true],
  ['gym:seated-cable-row', 'Seated Cable Row', '0861', 'pemula-banget', 'tarik-h', 'upper back', 'lats,biceps,delts', 'beban', 8, 12, '', '', false, true],
  ['gym:leg-extension', 'Leg Extension (Machine)', '0585', 'pemula-banget', 'isolasi', 'quads', '', 'beban', 10, 15, 'lutut', '', false, true],
  ['gym:chest-fly-machine', 'Chest Fly (Machine)', '0596', 'pemula-banget', 'isolasi', 'pectorals', 'delts', 'beban', 10, 15, 'bahu', '', false, true],
  ['gym:treadmill', 'Treadmill', '', 'pemula-banget', 'kardio', 'cardiovascular system', '', 'waktu', '', '', '', '', false, true],
  ['gym:stationary-bike', 'Stationary Bike', '', 'pemula-banget', 'kardio', 'cardiovascular system', '', 'waktu', '', '', '', '', false, true],
  // Usulan (nonaktif sampai owner memastikan alatnya ada).
  ['gym:push-up', 'Push Up', '0662', 'pemula', 'dorong-h', 'pectorals', 'delts,triceps,abs', 'badan', 6, 12, 'bahu', '', false, false],
  ['gym:chest-press-machine', 'Chest Press (Machine)', '0577', 'pemula', 'dorong-h', 'pectorals', 'delts,triceps', 'beban', 8, 12, 'bahu', '', false, false],
  ['gym:db-bench-press', 'Bench Press (Dumbbell)', '0289', 'pemula', 'dorong-h', 'pectorals', 'delts,triceps', 'beban', 8, 12, 'bahu', '', false, false],
  ['gym:shoulder-press-machine', 'Shoulder Press (Machine)', '0603', 'pemula', 'dorong-v', 'delts', 'triceps', 'beban', 8, 12, 'bahu', '', false, false],
  ['gym:seated-row-machine', 'Seated Row (Machine)', '1350', 'pemula', 'tarik-h', 'upper back', 'lats,biceps,delts', 'beban', 8, 12, '', '', false, false],
  ['gym:db-row', 'Bent Over Row (Dumbbell)', '0293', 'pemula', 'tarik-h', 'upper back', 'lats,biceps', 'beban', 8, 12, 'punggung-bawah', '', false, false],
  ['gym:db-rdl', 'Romanian Deadlift (Dumbbell)', '1459', 'pemula', 'pinggul', 'hamstrings', 'glutes,spine', 'beban', 8, 12, 'punggung-bawah,hamil', '', false, false],
  ['gym:goblet-squat', 'Goblet Squat (Dumbbell)', '1760', 'pemula', 'lutut', 'quads', 'glutes,adductors', 'beban', 8, 12, 'lutut', '', false, false],
  ['gym:seated-leg-curl', 'Seated Leg Curl (Machine)', '0599', 'pemula', 'isolasi', 'hamstrings', '', 'beban', 10, 15, '', '', false, false],
  ['gym:db-lateral-raise', 'Lateral Raise (Dumbbell)', '0334', 'pemula', 'isolasi', 'delts', '', 'beban', 10, 20, 'bahu', '', false, false],
  ['gym:cable-curl', 'Bicep Curl (Cable)', '0868', 'pemula', 'isolasi', 'biceps', 'forearms', 'beban', 10, 15, '', '', false, false],
  ['gym:triceps-pushdown', 'Triceps Pushdown (Cable)', '0201', 'pemula', 'isolasi', 'triceps', '', 'beban', 10, 15, '', '', false, false],
  ['gym:hip-abduction', 'Hip Abduction (Machine)', '0597', 'pemula', 'isolasi', 'abductors', 'glutes', 'beban', 10, 20, '', '', false, false],
  ['gym:calf-raise-machine', 'Standing Calf Raise (Machine)', '0605', 'pemula', 'isolasi', 'calves', '', 'beban', 10, 20, '', '', false, false],
  ['gym:dead-bug', 'Dead Bug', '0276', 'pemula', 'isolasi', 'abs', '', 'badan', 8, 15, 'hamil', '', false, false],
  ['gym:bb-bench-press', 'Bench Press (Barbell)', '0025', 'menengah', 'dorong-h', 'pectorals', 'delts,triceps', 'beban', 6, 12, 'bahu', '', false, false],
  ['gym:bb-squat', 'Squat (Barbell)', '0043', 'menengah', 'lutut', 'quads', 'glutes,adductors', 'beban', 6, 12, 'lutut,punggung-bawah', '', false, false],
  ['gym:bb-rdl', 'Romanian Deadlift (Barbell)', '0085', 'menengah', 'pinggul', 'hamstrings', 'glutes,spine', 'beban', 6, 12, 'punggung-bawah,hamil', '', false, false],
  ['gym:bb-row', 'Bent Over Row (Barbell)', '0027', 'menengah', 'tarik-h', 'upper back', 'lats,biceps,spine', 'beban', 6, 12, 'punggung-bawah', '', false, false],
  ['gym:bb-ohp', 'Overhead Press (Barbell)', '1457', 'menengah', 'dorong-v', 'delts', 'triceps', 'beban', 6, 12, 'bahu,punggung-bawah', '', false, false],
  ['gym:pull-up', 'Pull Up', '0652', 'menengah', 'tarik-v', 'lats', 'biceps,upper back', 'badan', 5, 12, 'bahu', '', false, false],
  ['gym:sit-to-stand', 'Sit to Stand', '', 'pemula-banget', 'keseimbangan', 'quads', 'glutes', 'badan', 8, 15, '', '', false, false],
];

function _gymRowFromSeed_(x, i, now) {
  return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8], x[9], x[10], x[11], x[12] ? 'ya' : '', x[13] ? 'ya' : 'tidak', i + 1, now];
}

function _gymSheet_() {
  const sh = getOrCreateSheet_('GymExercises', GYM_HEADERS);
  if (sh.getLastRow() < 2) {
    _locked_(function() {
      if (sh.getLastRow() >= 2) return;
      const now = new Date().toISOString();
      const rows = GYM_SEED_.map(function(x, i) { return _gymRowFromSeed_(x, i, now); });
      sh.getRange(2, 1, rows.length, GYM_HEADERS.length).setValues(rows);
    });
  }
  return sh;
}

/** Murni: baris sheet → objek katalog. */
function _gymFromRow_(r) {
  const list = function(v) { return String(v || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean); };
  const num = function(v) { return v === '' || v == null || isNaN(Number(v)) ? '' : Number(v); };
  return { id: String(r[0]), nama: String(r[1]), exId: String(r[2] || ''), level: String(r[3]), pola: String(r[4]), utama: list(r[5]), pendukung: list(r[6]),
    jenis: String(r[7] || 'beban'), repMin: num(r[8]), repMax: num(r[9]), hindari: list(r[10]), varian: String(r[11] || ''),
    unilateral: String(r[12]) === 'ya', aktif: String(r[13]) !== 'tidak', urutan: Number(r[14]) || 0 };
}

/** Semua baris katalog (urut Urutan). */
function _gymCatalog_() {
  if (_readMemo_ && _readMemo_.gymCatalog) return _readMemo_.gymCatalog;
  // Baca tanpa membuat sheet: sebelum owner membuka Latihan & Alat, katalog = isi seed (tanpa menulis apa pun).
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GymExercises');
  const now = '';
  const rows = sh && sh.getLastRow() >= 2 ? sh.getDataRange().getValues().slice(1) : GYM_SEED_.map(function(x, i) { return _gymRowFromSeed_(x, i, now); });
  const out = rows.filter(function(r) { return r[0]; }).map(_gymFromRow_)
    .sort(function(a, b) { return a.urutan - b.urutan; });
  if (_readMemo_) _readMemo_.gymCatalog = out;
  return out;
}

/** Murni: validasi satu gerakan katalog dari form admin; lempar error Indonesia. */
function _gymValidate_(it) {
  if (!it || typeof it !== 'object') throw new Error('Data gerakan tidak valid.');
  const nama = String(it.nama || '').trim();
  if (!nama || nama.length > 80) throw new Error('Nama gerakan wajib diisi (maks 80 huruf).');
  if (GYM_LEVELS.indexOf(it.level) === -1) throw new Error('Level tidak dikenal.');
  if (GYM_PATTERNS.indexOf(it.pola) === -1) throw new Error('Pola gerakan tidak dikenal.');
  if (PROGRAM_KINDS.indexOf(it.jenis || 'beban') === -1) throw new Error('Jenis gerakan tidak dikenal.');
  const muscles = function(v, label, min) {
    const a = (Array.isArray(v) ? v : String(v || '').split(',')).map(function(s) { return String(s).trim(); }).filter(Boolean);
    a.forEach(function(m) { if (EX_TARGETS.indexOf(m) === -1) throw new Error(label + ' "' + m + '" tidak dikenal.'); });
    if (a.length < min) throw new Error(label + ' wajib diisi.');
    if (a.length > 6) throw new Error(label + ' maksimal 6.');
    return a;
  };
  const utama = muscles(it.utama, 'Otot utama', 1), pendukung = muscles(it.pendukung, 'Otot pendukung', 0);
  pendukung.forEach(function(m) { if (utama.indexOf(m) !== -1) throw new Error('Otot "' + m + '" tidak boleh utama dan pendukung sekaligus.'); });
  const tags = (Array.isArray(it.hindari) ? it.hindari : String(it.hindari || '').split(',')).map(function(s) { return String(s).trim(); }).filter(Boolean);
  tags.forEach(function(t) { if (GYM_AVOID_TAGS.indexOf(t) === -1) throw new Error('Tag hindari "' + t + '" tidak dikenal.'); });
  const rep = function(v, label) {
    if (v === '' || v == null) return '';
    const n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > 50) throw new Error(label + ' harus 1 sampai 50.');
    return n;
  };
  const repMin = rep(it.repMin, 'Rep minimal'), repMax = rep(it.repMax, 'Rep maksimal');
  if (repMin !== '' && repMax !== '' && repMax < repMin) throw new Error('Rep maksimal tidak boleh di bawah rep minimal.');
  const exId = String(it.exId || '').trim();
  if (exId && !/^[A-Za-z0-9_-]{1,20}$/.test(exId)) throw new Error('Kode gerakan pustaka tidak valid.');
  return { id: String(it.id || '').trim(), nama: nama, exId: exId, level: it.level, pola: it.pola, utama: utama, pendukung: pendukung,
    jenis: it.jenis || 'beban', repMin: repMin, repMax: repMax, hindari: tags, varian: String(it.varian || '').trim(), unilateral: !!it.unilateral, aktif: it.aktif !== false };
}

/** Admin: katalog alat gym + daftar pilihan untuk form (membuat + mengisi sheet saat pertama dibuka). */
function getGymCatalog(token) {
  requireAdmin_(token);
  _gymSheet_();
  return { items: _gymCatalog_(), levels: GYM_LEVELS.slice(), patterns: GYM_PATTERNS.slice(), targets: EX_TARGETS.slice(), tags: GYM_AVOID_TAGS.slice() };
}

/** Admin: tambah / ubah satu gerakan katalog. ID baru dibuat dari nama (`gym:<slug>`). */
function saveGymExercise(token, item) {
  requireAdmin_(token);
  const it = _gymValidate_(item);
  _locked_(function() {
    const sh = _gymSheet_();
    const rows = sh.getDataRange().getValues();
    let at = -1;
    const ids = {};
    for (let i = 1; i < rows.length; i++) { ids[String(rows[i][0])] = true; if (it.id && String(rows[i][0]) === it.id) at = i + 1; }
    if (it.id && at === -1) throw new Error('Gerakan katalog tidak ditemukan.');
    if (it.varian && !ids[it.varian]) throw new Error('Varian berikut tidak ada di katalog.');
    if (!it.id) {
      if (rows.length - 1 >= GYM_MAX) throw new Error('Katalog maksimal ' + GYM_MAX + ' gerakan.');
      const base = 'gym:' + (it.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gerakan');
      let id = base, k = 2;
      while (ids[id]) id = base + '-' + (k++);
      it.id = id;
    }
    if (it.varian === it.id) throw new Error('Varian berikut tidak boleh gerakan itu sendiri.');
    const urut = at > 0 ? rows[at - 1][14] : rows.length;
    const row = [it.id, it.nama, it.exId, it.level, it.pola, it.utama.join(','), it.pendukung.join(','), it.jenis, it.repMin, it.repMax,
      it.hindari.join(','), it.varian, it.unilateral ? 'ya' : '', it.aktif ? 'ya' : 'tidak', urut, new Date().toISOString()];
    if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]); else _appendRow_(sh, row);
  });
  _bumpMember_('*');
  return getGymCatalog(token);
}

/** Admin: aktif / nonaktif (alat ada di gym atau tidak). */
function setGymExerciseActive(token, id, on) {
  requireAdmin_(token);
  _locked_(function() {
    const sh = _gymSheet_();
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) { sh.getRange(i + 1, 14, 1, 3).setValues([[on ? 'ya' : 'tidak', rows[i][14], new Date().toISOString()]]); return; }
    }
    throw new Error('Gerakan katalog tidak ditemukan.');
  });
  _bumpMember_('*');
  return getGymCatalog(token);
}
