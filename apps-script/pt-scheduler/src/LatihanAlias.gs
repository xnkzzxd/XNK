// Fase U (T-1603): otot untuk gerakan yang diketik manual di log latihan, dan nama manual yang sama dengan pustaka.
// Semua terjadi SAAT BACA: baris WorkoutLog / ProgramItems tidak pernah ditulis ulang.
// Urutan: (1) nama persis sama dengan gerakan pustaka (setelah _exNorm_) → digabung ke Exercise ID itu (riwayat, PR,
// saran beban jadi satu); (2) alias yang disimpan coach (sheet ExerciseAlias); (3) tebakan otot dari kata kunci
// (_exGuessMuscles_) — tebakan hanya mengisi bagian tubuh/otot yang kosong, tidak pernah menggabung riwayat.
// Data pustaka: EX_LIB_ di LatihanData.gs (dibangkitkan tools/exercise-names.js).

const EX_TARGETS = ['abs', 'quads', 'lats', 'calves', 'pectorals', 'glutes', 'hamstrings', 'adductors', 'abductors', 'triceps', 'biceps',
  'delts', 'forearms', 'traps', 'upper back', 'spine', 'serratus anterior', 'levator scapulae', 'cardiovascular system'];
const EX_TARGET_PART = { abs: 'waist', quads: 'upper legs', lats: 'back', calves: 'lower legs', pectorals: 'chest', glutes: 'upper legs',
  hamstrings: 'upper legs', adductors: 'upper legs', abductors: 'upper legs', triceps: 'upper arms', biceps: 'upper arms', delts: 'shoulders',
  forearms: 'lower arms', traps: 'back', 'upper back': 'back', spine: 'back', 'serratus anterior': 'chest', 'levator scapulae': 'neck',
  'cardiovascular system': 'cardio' };
const EX_ALIAS_HEADERS = ['Kunci', 'Nama', 'Exercise ID', 'Body Part', 'Target', 'Diubah Pada'];
const EX_ALIAS_MAX = 300;

// Ejaan yang disamakan sebelum dibandingkan (kata per kata).
const EX_NORM_WORDS = { kabel: 'cable', mesin: 'machine', lever: 'machine', leverage: 'machine', sled: 'machine', db: 'dumbbell', dumbel: 'dumbbell',
  bb: 'barbell', barbel: 'barbell', pushup: 'push up', pushups: 'push up', pullup: 'pull up', pullups: 'pull up', situp: 'sit up', situps: 'sit up',
  chinup: 'chin up', pulldowns: 'pulldown', rows: 'row', curls: 'curl', raises: 'raise', presses: 'press', extensions: 'extension', squats: 'squat',
  lunges: 'lunge', crunches: 'crunch', flyes: 'fly', flys: 'fly', flies: 'fly', thrusts: 'thrust', ups: 'up', deadlifts: 'deadlift', dips: 'dip' };

/** Murni: kunci pembanding nama gerakan (huruf kecil, tanpa tanda baca, sinonim alat, urutan kata tidak berpengaruh). */
function _exNorm_(name) {
  let s = String(name == null ? '' : name).toLowerCase().replace(/в°/g, '°');
  s = s.replace(/\bpull\s+down\b/g, 'pulldown').replace(/\bpush-?\s*ups?\b/g, 'push up').replace(/\bpull-?\s*ups?\b/g, 'pull up')
    .replace(/\bsit-?\s*ups?\b/g, 'sit up').replace(/\bchin-?\s*ups?\b/g, 'chin up').replace(/\bt-?\s*bar\b/g, 'tbar');
  s = s.replace(/[^a-z0-9°]+/g, ' ').trim();
  if (!s) return '';
  const words = {};
  s.split(' ').forEach(function(w) { String(EX_NORM_WORDS[w] || w).split(' ').forEach(function(x) { if (x) words[x] = true; }); });
  return Object.keys(words).sort().join(' ');
}

let _exLibIndex_ = null;
/** Indeks pustaka: kunci _exNorm_ (nama tampilan dan mentah) → id; kunci yang dipakai dua gerakan berbeda dibuang (ambigu). */
function _exLibIdx_() {
  if (_exLibIndex_) return _exLibIndex_;
  const byKey = {}, meta = {};
  (typeof EX_LIB_ === 'undefined' ? [] : EX_LIB_).forEach(function(x) {
    meta[x[0]] = { n: x[1], b: x[3], t: x[4] };
    [x[1], x[2]].forEach(function(nm) {
      const k = _exNorm_(nm);
      if (!k) return;
      if (byKey[k] === undefined) byKey[k] = x[0]; else if (byKey[k] !== x[0]) byKey[k] = null;
    });
  });
  _exLibIndex_ = { byKey: byKey, meta: meta };
  return _exLibIndex_;
}

// Tebakan otot dari kata kunci, urut dari yang paling spesifik. Diuji di tests/exercise-alias.test.js.
const EX_GUESS_RULES = [
  [/\b(treadmill|run|running|jog|jogging|lari|bike|cycling|sepeda|elliptical|stepper|stairmaster|walk|walking|jalan|rowing machine|ergometer|skierg|jump rope|skipping)\b/, 'cardiovascular system'],
  [/\b(calf|calves|betis)\b/, 'calves'],
  [/\b(hip thrust|glute bridge|bridge|glute|glutes|bokong|donkey kick|frog pump)\b/, 'glutes'],
  [/\babduct/, 'abductors'],
  [/\badduct/, 'adductors'],
  [/\b(leg curl|hamstring|hamstrings|rdl|romanian|stiff leg|good morning|nordic)\b/, 'hamstrings'],
  [/\b(squat|leg press|lunge|split squat|step up|leg extension|sissy|hack|wall sit|paha)\b/, 'quads'],
  [/\b(deadlift)\b/, 'glutes'],
  [/\b(back extension|hyperextension|superman)\b/, 'spine'],
  [/\b(rear delt|reverse fly|face pull)\b/, 'delts'],
  [/\b(shrug)\b/, 'traps'],
  [/\b(pulldown|pull down|pull up|chin up|lat|lats|straight arm|pullover)\b/, 'lats'],
  [/\b(row|rowing|dayung|punggung)\b/, 'upper back'],
  [/\b(tricep|triceps|pushdown|push down|skull|kickback|french press|close grip bench)\b/, 'triceps'],
  [/\b(curl|bicep|biceps|preacher|hammer)\b/, 'biceps'],
  [/\b(shoulder press|overhead press|military|lateral raise|side raise|front raise|arnold|upright row|bahu|delt|delts)\b/, 'delts'],
  [/\b(bench|chest|dada|push up|fly|pec|dip|dips|crossover)\b/, 'pectorals'],
  [/\b(crunch|sit up|plank|abs|perut|leg raise|knee raise|twist|dead bug|hollow|ab wheel|rollout|mountain climber|v up|bicycle)\b/, 'abs'],
  [/\b(wrist|forearm|grip|farmer)\b/, 'forearms'],
];

/** Murni: tebak otot target dan bagian tubuh dari nama gerakan bebas; null bila tidak ada kata kunci yang cocok. */
function _exGuessMuscles_(name) {
  const s = ' ' + String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  for (let i = 0; i < EX_GUESS_RULES.length; i++) {
    if (EX_GUESS_RULES[i][0].test(s)) { const t = EX_GUESS_RULES[i][1]; return { target: t, bodyPart: EX_TARGET_PART[t] }; }
  }
  return null;
}

let _exAliasMemo_ = null;
/** Alias coach: kunci _exNorm_ → { exId, bodyPart, target, nama }. */
function _exAliasMap_() {
  if (_exAliasMemo_) return _exAliasMemo_;
  const out = {};
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ExerciseAlias');
    if (sh && sh.getLastRow() >= 2) {
      sh.getDataRange().getValues().slice(1).forEach(function(r) {
        const k = String(r[0] || '').trim();
        if (k) out[k] = { nama: String(r[1] || ''), exId: String(r[2] || ''), bodyPart: String(r[3] || ''), target: String(r[4] || '') };
      });
    }
  } catch (e) {}
  _exAliasMemo_ = out;
  return out;
}

/** Hasil gabungan untuk satu gerakan: { exId, bodyPart, target, src: ''|'pustaka'|'alias'|'tebakan' }. Hanya mengisi yang kosong. */
function _exResolve_(exId, gerakan, bodyPart, target) {
  const idx = _exLibIdx_();
  let id = String(exId == null ? '' : exId).trim(), bp = String(bodyPart || ''), tg = String(target || ''), src = '';
  if (!id) {
    const k = _exNorm_(gerakan);
    const lib = k ? idx.byKey[k] : null;
    const al = k && !lib ? _exAliasMap_()[k] : null;
    if (lib) { id = lib; src = 'pustaka'; }
    else if (al) {
      if (al.exId && idx.meta[al.exId]) id = al.exId;
      if (!bp) bp = al.bodyPart;
      if (!tg) tg = al.target;
      src = 'alias';
    }
  }
  const m = id ? idx.meta[id] : null;
  if (m) { if (!bp) bp = m.b; if (!tg) tg = m.t; }
  if (!bp || !tg) {
    const g = _exGuessMuscles_(gerakan);
    if (g) { if (!bp) bp = g.bodyPart; if (!tg && (!m || !m.t)) tg = g.target; if (!src) src = 'tebakan'; }
  }
  return { exId: id, bodyPart: bp, target: tg, src: src };
}

/** Kunci riwayat setelah penggabungan (dipakai di baca dan di tulis-ulang satu hari). */
function _exKeyOf_(exId, gerakan) { return _workoutKey_(_exResolve_(exId, gerakan, '', '').exId, gerakan); }

/** Salinan baris WorkoutLog dengan Exercise ID / Body Part / Target terisi (G, I, J). Baris sheet tidak diubah. */
function _exResolveRow_(r) {
  if (String(r[6] || '').trim() && String(r[8] || '') && String(r[9] || '')) return r;
  const res = _exResolve_(r[6], r[7], r[8], r[9]);
  const c = r.slice();
  c[6] = res.exId; c[8] = res.bodyPart; c[9] = res.target;
  return c;
}

function _exAliasSheet_() { return getOrCreateSheet_('ExerciseAlias', EX_ALIAS_HEADERS); }

/**
 * Admin: semua nama gerakan manual (tanpa Exercise ID) di WorkoutLog, dengan hasil gabung/tebakan saat ini.
 * { items:[{ kunci, nama, sets, klien, terakhir, exId, bodyPart, target, src }], targets }. Tanpa data klien selain jumlah.
 */
function getManualExercises(token) {
  requireAdmin_(token);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkoutLog');
  const by = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
      if (!r[0] || String(r[6] || '').trim() || !String(r[7] || '').trim()) return;
      const k = _exNorm_(r[7]);
      if (!k) return;
      const tgl = _isoDateCell_(r[2]);
      const it = by[k] || (by[k] = { kunci: k, nama: String(r[7]).trim(), sets: 0, members: {}, terakhir: '' });
      it.sets++;
      it.members[String(r[1]).trim()] = true;
      if (tgl >= it.terakhir) { it.terakhir = tgl; it.nama = String(r[7]).trim(); }
    });
  }
  const items = Object.keys(by).map(function(k) {
    const it = by[k], res = _exResolve_('', it.nama, '', '');
    return { kunci: k, nama: it.nama, sets: it.sets, klien: Object.keys(it.members).length, terakhir: it.terakhir,
      exId: res.exId, bodyPart: res.bodyPart, target: res.target, src: res.src };
  }).sort(function(a, b) { return b.sets - a.sets || (a.nama < b.nama ? -1 : 1); });
  return { items: items, targets: EX_TARGETS.slice() };
}

/**
 * Admin: simpan alias gerakan manual. list = [{ nama, exId?, target?, hapus? }] (maks 50 per panggilan).
 * exId = gerakan pustaka yang sama (riwayat digabung); tanpa exId cukup otot target. Bagian tubuh dihitung dari target/pustaka.
 */
function saveExerciseAlias(token, list) {
  requireAdmin_(token);
  if (!Array.isArray(list) || !list.length || list.length > 50) throw new Error('Daftar gerakan tidak valid.');
  const idx = _exLibIdx_();
  const clean = list.map(function(x) {
    const nama = String(x && x.nama || '').trim().slice(0, 80), kunci = _exNorm_(nama);
    if (!kunci) throw new Error('Nama gerakan wajib diisi.');
    if (x.hapus) return { kunci: kunci, hapus: true };
    const exId = String(x.exId || '').trim();
    if (exId && !idx.meta[exId]) throw new Error('Gerakan pustaka "' + exId + '" tidak ditemukan.');
    const target = String(x.target || '').trim();
    if (target && EX_TARGETS.indexOf(target) === -1) throw new Error('Otot "' + target + '" tidak dikenal.');
    if (!exId && !target) throw new Error('Pilih gerakan pustaka atau otot untuk "' + nama + '".');
    const m = exId ? idx.meta[exId] : null;
    const t = target || (m ? m.t : '');
    return { kunci: kunci, nama: nama, exId: exId, target: t, bodyPart: EX_TARGET_PART[t] || (m ? m.b : '') };
  });
  _locked_(function() {
    const sh = _exAliasSheet_();
    const rows = sh.getDataRange().getValues();
    const at = {};
    for (let i = 1; i < rows.length; i++) at[String(rows[i][0])] = i + 1;
    const now = new Date().toISOString();
    const dels = [];
    let count = rows.length - 1;
    clean.forEach(function(c) {
      if (c.hapus) { if (at[c.kunci]) dels.push(at[c.kunci]); return; }
      const row = [c.kunci, c.nama, c.exId, c.bodyPart, c.target, now];
      if (at[c.kunci]) sh.getRange(at[c.kunci], 1, 1, row.length).setValues([row]);
      else {
        if (++count > EX_ALIAS_MAX) throw new Error('Maksimal ' + EX_ALIAS_MAX + ' alias gerakan.');
        _appendRow_(sh, row);
        at[c.kunci] = sh.getLastRow();
      }
    });
    dels.sort(function(a, b) { return b - a; }).forEach(function(r) { sh.deleteRow(r); });
  });
  _exAliasMemo_ = null;
  _bumpMember_('*');
  return getManualExercises(token);
}
