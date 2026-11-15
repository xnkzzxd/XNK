// Fase U (T-1605): generator program latihan otomatis — fungsi MURNI (tanpa SpreadsheetApp), data masuk lewat argumen.
// Setiap angka di PGEN punya baris di docs/program/Rules.md (nomor aturan di komentar). Ubah keduanya bersamaan.
// Prioritas #1 (keputusan owner): volume set per otot per minggu (aturan 5) dan progressive overload dengan form dulu (aturan 9a).

const PGEN_VERSION = 'auto:1';
const PGEN = {
  // Aturan 5: set fractional per otot per minggu (set langsung = 1, otot pendukung = 0,5).
  volume: { 'pemula-banget': [6, 8], pemula: [8, 12], menengah: [12, 20] },
  helperWeight: 0.5,
  maxSetsPerExercise: 5,
  maxDirectSetsPerMusclePerSession: 10,
  maxExercisesPerSession: 6,
  // Aturan 6 + keputusan owner (pemula banget compound 8–12, isolasi 10–15). Kekuatan 4–6 mulai level pemula [H].
  reps: { compound: { 'pemula-banget': [8, 12], pemula: [6, 12], menengah: [6, 12] }, isolasi: [10, 15], kekuatan: [4, 6], ringan: [12, 15] },
  rir: { 'pemula-banget': '2–3', pemula: '1–3', menengah: '0–2', ringan: '4+' },
  // Aturan 7: minimal 90 dtk; compound 2–3 menit; kekuatan 3 menit [J][K].
  rest: { compound: 120, kekuatan: 180, isolasi: 90 },
  // Aturan 14: estimasi durasi (tempo bebas [V], 3 dtk/rep); batas aman 75 menit.
  secPerRep: 3, maxSessionMin: 75,
  // Aturan 18: kardio pemula banget mulai pendek, naik per blok [E][I].
  cardioMin: { start: 10, step: 5, max: 30 },
  // Aturan 9: blok 4 minggu; volume naik 1 set per blok sampai batas atas level.
  blockDays: 28, blockStepSets: 1,
  // Aturan 22: kembali setelah absen [S][T].
  absenceDays: 14, absenceResetDays: 56,
  // Aturan 9a: kenaikan beban (+2,5 kg tubuh atas, +5 kg tubuh bawah) [A].
  loadStep: { upper: 2.5, lower: 5 },
  stallSessions: 3,
  // Aturan 19: populasi khusus.
  ageMin: 18, ageMax: 65,
};
const PGEN_COMPOUND = ['lutut', 'pinggul', 'dorong-h', 'dorong-v', 'tarik-h', 'tarik-v'];
const PGEN_LOWER = ['quads', 'glutes', 'hamstrings', 'adductors', 'abductors', 'calves'];
const PGEN_LEVEL_RANK = { 'pemula-banget': 0, pemula: 1, menengah: 2 };

/**
 * Aturan 1 / 19: pengaman. health = { answers:[7 × 'ya'|'tidak'], injuries, medication, other } atau null (belum isi).
 * → { light, reasons:[kode], hamil, lansia, remaja }. light = mode ringan (tetap dibuat, keputusan owner).
 */
function _pgenSafety_(health, age, tags) {
  const reasons = [];
  if (!health) reasons.push('form-belum');
  else {
    if ((health.answers || []).some(function(a) { return String(a).toLowerCase() === 'ya'; })) reasons.push('parq');
    if (String(health.injuries || '').trim()) reasons.push('cedera');
    if (String(health.medication || '').trim()) reasons.push('obat');
    if (String(health.other || '').trim()) reasons.push('kondisi');
  }
  const t = tags || [];
  const hamil = t.indexOf('hamil') !== -1;
  if (hamil) reasons.push('hamil');
  const a = Number(age);
  const remaja = a > 0 && a < PGEN.ageMin, lansia = a > PGEN.ageMax;
  if (remaja) reasons.push('remaja');
  if (lansia) reasons.push('lansia');
  return { light: reasons.length > 0, reasons: reasons, hamil: hamil, lansia: lansia, remaja: remaja };
}

/** Murni: gerakan katalog yang boleh untuk profil ini (aturan 10, 21). */
function _pgenEligible_(catalog, level, avoid) {
  const rank = PGEN_LEVEL_RANK[level] || 0;
  return (catalog || []).filter(function(x) {
    return x.aktif && (PGEN_LEVEL_RANK[x.level] || 0) <= rank && !(x.hindari || []).some(function(t) { return avoid.indexOf(t) !== -1; });
  });
}

/** Aturan 3, 4, 8: kerangka hari → daftar pola per hari (compound dulu). */
function _pgenSplit_(level, days) {
  const n = [2, 3, 4].indexOf(Number(days)) === -1 ? 2 : Number(days);
  if (n === 4 && level === 'menengah') {
    return [
      { hari: 'Upper A', pola: ['dorong-h', 'tarik-v', 'dorong-v', 'tarik-h'] },
      { hari: 'Lower A', pola: ['lutut', 'pinggul'] },
      { hari: 'Upper B', pola: ['tarik-h', 'dorong-h', 'tarik-v', 'dorong-v'] },
      { hari: 'Lower B', pola: ['pinggul', 'lutut'] },
    ];
  }
  const names = ['Full Body A', 'Full Body B', 'Full Body C', 'Full Body D'];
  const pushPull = [['dorong-h', 'tarik-v'], ['dorong-h', 'tarik-h'], ['dorong-v', 'tarik-v'], ['dorong-h', 'tarik-h']];
  const out = [];
  for (let i = 0; i < n; i++) out.push({ hari: names[i], pola: ['lutut', 'pinggul', pushPull[i][0], pushPull[i][1]] });
  return out;
}

/** Aturan 10, 16, 9b: pilih gerakan per pola; rotasi sistematis antar hari; pilihan tukar klien menang. */
function _pgenPick_(split, eligible, tukar) {
  const by = {};
  eligible.forEach(function(x) { (by[x.pola] = by[x.pola] || []).push(x); });
  const fallback = { 'dorong-v': 'dorong-h', 'tarik-h': 'tarik-v', 'tarik-v': 'tarik-h', 'dorong-h': 'dorong-v' };
  const used = {}, gaps = [];
  const days = split.map(function(d, di) {
    const items = [];
    d.pola.forEach(function(p) {
      let pol = p, list = by[p] || [];
      if (!list.length && fallback[p] && (by[fallback[p]] || []).length) { pol = fallback[p]; list = by[pol]; }
      if (!list.length) { if (gaps.indexOf(p) === -1) gaps.push(p); return; }
      const pref = tukar && tukar[pol] ? list.find(function(x) { return x.id === tukar[pol]; }) : null;
      const k = used[pol] || 0;
      const pick = pref || list[k % list.length];
      used[pol] = k + 1;
      if (!items.some(function(it) { return it.ex.id === pick.id; })) items.push({ ex: pick, pola: pol, iso: false, sets: 1 });
    });
    return { hari: d.hari, items: items };
  });
  return { days: days, gaps: gaps, byPola: by };
}

/** Aturan 5: volume fractional per otot per minggu dari hari program (tiap hari dilatih sekali seminggu). */
function _pgenVolume_(days) {
  const v = {};
  (days || []).forEach(function(d) {
    d.items.forEach(function(it) {
      if (!it.ex || it.ex.pola === 'kardio') return;
      const s = Number(it.sets) || 0;
      it.ex.utama.forEach(function(m) { v[m] = (v[m] || 0) + s; });
      it.ex.pendukung.forEach(function(m) { v[m] = (v[m] || 0) + s * PGEN.helperWeight; });
    });
  });
  return v;
}

/** Murni: volume fractional dari set kerja yang tercatat (aturan 5 "set yang benar-benar dicatat", termasuk sesi PT). muscleOf = fungsi atau peta kunci/nama → {utama, pendukung}. */
function _pgenRecordedVolume_(entries, muscleOf) {
  const v = {};
  const look = typeof muscleOf === 'function' ? muscleOf : function(e) { return (muscleOf || {})[e.key || e.gerakan]; };
  (entries || []).forEach(function(e) {
    const mm = look(e);
    if (!mm) return;
    const s = (e.sets || []).filter(function(x) { return x.jenis !== 'w'; }).length;
    mm.utama.forEach(function(m) { v[m] = (v[m] || 0) + s; });
    (mm.pendukung || []).forEach(function(m) { v[m] = (v[m] || 0) + s * PGEN.helperWeight; });
  });
  return v;
}

/** Aturan 5, 6, 7, 9, 13: target volume per otot untuk profil ini. */
function _pgenTargets_(level, block, focus, light, primaryMuscles) {
  const r = PGEN.volume[light ? 'pemula-banget' : level] || PGEN.volume['pemula-banget'];
  const out = {};
  primaryMuscles.forEach(function(m) {
    const base = light ? r[0] : Math.min(r[1], r[0] + Math.max(0, (Number(block) || 1) - 1) * PGEN.blockStepSets);
    out[m] = !light && focus.indexOf(m) !== -1 ? r[1] : base;
  });
  focus.forEach(function(m) { if (!light && out[m] === undefined) out[m] = r[1]; });
  return { targets: out, upper: light ? r[0] : r[1] };
}

/** Aturan 6, 7, 15: dosis per gerakan. */
function _pgenDose_(ex, level, goal, light, iso) {
  let reps;
  if (light) reps = PGEN.reps.ringan;
  else if (iso || ex.pola === 'isolasi') reps = [ex.repMin || PGEN.reps.isolasi[0], ex.repMax || PGEN.reps.isolasi[1]];
  else if (goal === 'kekuatan' && level !== 'pemula-banget') reps = PGEN.reps.kekuatan;
  else reps = PGEN.reps.compound[level] || PGEN.reps.compound['pemula-banget'];
  const strong = reps === PGEN.reps.kekuatan;
  const rest = iso || ex.pola === 'isolasi' ? PGEN.rest.isolasi : (strong ? PGEN.rest.kekuatan : PGEN.rest.compound);
  const rir = light ? PGEN.rir.ringan : PGEN.rir[level] || PGEN.rir['pemula-banget'];
  return { repMin: reps[0], repMax: reps[1], rest: rest, rir: rir };
}

/** Aturan 14: perkiraan menit satu hari. */
function _pgenMinutes_(day, level, goal, light) {
  let sec = 0;
  day.items.forEach(function(it) {
    if (it.ex.pola === 'kardio') { sec += (it.cardioMin || 0) * 60; return; }
    const d = _pgenDose_(it.ex, level, goal, light, it.iso);
    sec += it.sets * (((d.repMin + d.repMax) / 2) * PGEN.secPerRep + d.rest);
  });
  return Math.round(sec / 60);
}

/**
 * Generator utama. input = { profile:{level,hari,durasi,tujuan,fokus,pantangan,tukar,blokKe}, catalog, safety, absenceDays }
 * → { days (bentuk _parseProgramDays_), volume, targets, gaps, minutes, why:[kalimat + sumber], light, version }.
 */
function _pgenProgram_(input) {
  const p = input.profile || {}, safety = input.safety || { light: false, reasons: [] };
  const light = !!safety.light;
  const level = light ? 'pemula-banget' : (GYM_LEVELS.indexOf(p.level) !== -1 ? p.level : 'pemula-banget');
  const goal = PG_GOALS.indexOf(p.tujuan) !== -1 ? p.tujuan : 'bugar';
  const focus = (p.fokus || []).slice(0, PG_FOCUS_MAX);
  const avoid = (p.pantangan || []).concat(safety.hamil ? ['hamil'] : []);
  const absent = Number(input.absenceDays) || 0;
  const block = absent >= PGEN.absenceResetDays ? 1 : Math.max(1, Number(p.blokKe) || 1);
  const eligible = _pgenEligible_(input.catalog, level, avoid);
  const picked = _pgenPick_(_pgenSplit_(level, p.hari || 2), eligible.filter(function(x) { return PGEN_COMPOUND.indexOf(x.pola) !== -1; }), p.tukar || {});
  const days = picked.days;
  const why = [];
  // Otot yang punya gerakan UTAMA di katalog level ini (compound atau isolasi) = otot bertarget (aturan 5).
  const primary = {};
  eligible.forEach(function(x) { if (x.pola !== 'kardio' && x.pola !== 'keseimbangan') x.utama.forEach(function(m) { primary[m] = true; }); });
  const lowVol = absent >= PGEN.absenceDays || light;
  const tg = _pgenTargets_(level, lowVol ? 1 : block, focus, light, Object.keys(primary));
  const targets = tg.targets;
  const isoBy = {};
  eligible.filter(function(x) { return x.pola === 'isolasi'; }).forEach(function(x) { x.utama.forEach(function(m) { (isoBy[m] = isoBy[m] || []).push(x); }); });
  const directInDay = function(d, m) { return d.items.reduce(function(a, it) { return a + (it.ex.utama.indexOf(m) !== -1 ? it.sets : 0); }, 0); };
  const fitsUpper = function(ex, add) {
    const v = _pgenVolume_(days);
    return ex.utama.every(function(m) { return (v[m] || 0) + add <= Math.max(tg.upper, targets[m] || 0); });
  };
  // Aturan 5 + 4: naikkan set compound dulu, lalu tambah satu isolasi per sesi bila otot masih kurang.
  for (let guard = 0; guard < 200; guard++) {
    const v = _pgenVolume_(days);
    const need = Object.keys(targets).map(function(m) { return [m, targets[m] - (v[m] || 0)]; }).filter(function(x) { return x[1] > 0.01; })
      .sort(function(a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    if (!need.length) break;
    let moved = false;
    for (let ni = 0; ni < need.length && !moved; ni++) {
      const m = need[ni][0];
      const cand = [];
      days.forEach(function(d) { d.items.forEach(function(it) {
        if (it.ex.utama.indexOf(m) !== -1 && it.sets < PGEN.maxSetsPerExercise && directInDay(d, m) < PGEN.maxDirectSetsPerMusclePerSession && fitsUpper(it.ex, 1)) cand.push(it);
      }); });
      cand.sort(function(a, b) { return a.sets - b.sets; });
      if (cand.length) { cand[0].sets++; moved = true; break; }
      // Isolasi: maks 1 per sesi; di pemula banget hanya bila compound tidak bisa menambah (aturan 4) atau otot fokus.
      const iso = (isoBy[m] || []).find(function(x) { return !days.some(function(d) { return d.items.some(function(it) { return it.ex.id === x.id; }); }); }) || (isoBy[m] || [])[0];
      if (iso) {
        const dayFree = days.filter(function(d) { return d.items.filter(function(it) { return it.iso; }).length < (focus.indexOf(m) !== -1 ? 2 : 1) && d.items.length < PGEN.maxExercisesPerSession && !d.items.some(function(it) { return it.ex.id === iso.id; }); })
          .sort(function(a, b) { return directInDay(a, m) - directInDay(b, m); })[0];
        if (dayFree) { dayFree.items.push({ ex: iso, pola: 'isolasi', iso: true, sets: 1 }); moved = true; }
      }
    }
    if (!moved) break;
  }
  // Aturan 18: kardio untuk fat loss / kebugaran (atau opsional singkat).
  const cardio = eligible.filter(function(x) { return x.pola === 'kardio'; });
  if (cardio.length && (goal === 'fatloss' || goal === 'bugar')) {
    const min = Math.min(PGEN.cardioMin.max, PGEN.cardioMin.start + (block - 1) * PGEN.cardioMin.step);
    days.forEach(function(d, i) { d.items.push({ ex: cardio[i % cardio.length], pola: 'kardio', iso: false, sets: 1, cardioMin: min }); });
    why.push('Cardio ' + min + ' min after lifting, building toward 150–300 min a week (WHO 2020).');
  }
  // Aturan 19: lansia dapat gerakan keseimbangan bila ada di katalog.
  if (safety.lansia) {
    const bal = eligible.filter(function(x) { return x.pola === 'keseimbangan'; });
    if (bal.length) days.forEach(function(d) { if (d.items.length < PGEN.maxExercisesPerSession) d.items.push({ ex: bal[0], pola: 'keseimbangan', iso: true, sets: 2 }); });
  }
  const volume = _pgenVolume_(days);
  const minutes = days.map(function(d) { return _pgenMinutes_(d, level, goal, light); });
  const wantMin = Number(p.durasi) || 45;
  const maxMin = Math.max.apply(null, minutes.concat([0]));
  if (maxMin > wantMin) why.push('Needs about ' + maxMin + ' min to reach the minimum weekly sets per muscle (volume first, Pelland 2026).');
  if (light) why.push('Light mode: easier load (leave 4+ reps), lowest volume. Talk to your coach or doctor first (ACSM screening, Riebe 2015).');
  if (absent >= PGEN.absenceDays) why.push('Back after a break: lowest volume this session, no automatic load increase (Ogasawara 2013; Halonen 2024).');
  why.push('Weekly sets per muscle: ' + Object.keys(targets).sort().map(function(m) { return m + ' ' + (Math.round((volume[m] || 0) * 10) / 10) + '/' + targets[m]; }).join(', ') + ' (fractional count, Pelland 2026).');
  const out = days.map(function(d) {
    return { hari: d.hari, items: d.items.slice(0, PGEN.maxExercisesPerSession + 1).map(function(it) {
      if (it.ex.pola === 'kardio') return { gerakan: it.ex.nama, exId: it.ex.exId || '', set: 1, jenis: 'waktu', repMin: it.cardioMin * 60, catatan: 'Moderate pace: you can still talk.' };
      const dz = _pgenDose_(it.ex, level, goal, light, it.iso);
      const kind = it.ex.jenis === 'badan' ? 'badan' : 'beban';
      return { gerakan: it.ex.nama, exId: it.ex.exId || '', set: it.sets, jenis: kind, repMin: dz.repMin, repMax: dz.repMax, rest: dz.rest,
        catatan: 'Leave ' + dz.rir + ' reps in reserve.' + (it.ex.unilateral ? ' Sets count per side.' : '') };
    }) };
  }).filter(function(d) { return d.items.length; });
  return { days: out, volume: volume, targets: targets, gaps: picked.gaps, minutes: minutes, why: why, light: light, level: level, block: block, version: PGEN_VERSION };
}

/**
 * Aturan 9a: langkah progresi satu gerakan. last = set kerja sesi terakhir [{berat, rep, jenis}], item = {repMin, repMax, jenis},
 * gate = { coachOk, lastForm }, canAddSet = volume otot masih di bawah batas atas, lower = otot tubuh bawah, absent = absen ≥ 14 hari.
 * → { step: 'mulai'|'rep'|'set'|'beban'|'tahan', kg?, why }.
 */
function _pgenOverload_(last, item, gate, canAddSet, lower, absent, setsNow) {
  const work = (last || []).filter(function(s) { return s.jenis !== 'w' && Number(s.rep) > 0; });
  if (!work.length) return { step: 'mulai', why: 'Pick a load you could lift about 3 more times.' };
  if (absent) return { step: 'tahan', why: 'First session back: keep the load, judge it by reps in reserve.' };
  const top = Number(item.repMax || item.repMin) || 0;
  if (!work.every(function(s) { return Number(s.rep) >= top; })) return { step: 'rep', why: 'Add reps until every set reaches ' + top + '.' };
  if (canAddSet && (Number(setsNow) || work.length) < PGEN.maxSetsPerExercise) return { step: 'set', why: 'Every set reached ' + top + ': add one set (weekly volume first).' };
  if (item.jenis === 'badan') return { step: 'tahan', why: 'Reps and sets are full: move to the harder variant.' };
  if (!gate || !gate.coachOk) return { step: 'tahan', why: 'Load goes up after your coach marks your form OK.' };
  if (gate.lastForm === 'ragu') return { step: 'tahan', why: 'You were unsure about your form: keep the load and ask your coach.' };
  const heaviest = Math.max.apply(null, work.map(function(s) { return Number(s.berat) || 0; }));
  const kg = Math.min(500, heaviest + (lower ? PGEN.loadStep.lower : PGEN.loadStep.upper));
  return { step: 'beban', kg: kg, why: 'Reps and sets are full and form is OK: +' + (kg - heaviest) + ' kg, back to ' + (item.repMin || top) + ' reps.' };
}

/** Aturan 9b: stagnan (tidak naik rep/beban 3 sesi berturut). points = [{e1rm, reps}] lama → baru. */
function _pgenStall_(points, canAddSet, swappedThisBlock, lastForm) {
  const p = (points || []).slice(-(PGEN.stallSessions + 1));
  if (p.length < PGEN.stallSessions + 1) return 'ok';
  const first = p[0], improved = p.slice(1).some(function(x) { return x.e1rm > first.e1rm || x.reps > first.reps; });
  if (improved) return 'ok';
  if (lastForm === 'ragu') return 'coach';
  if (canAddSet) return 'add-set';
  if (!swappedThisBlock) return 'swap';
  return 'coach';
}

/**
 * Aturan 9, 22: tinjauan blok. weeks = volume tercatat per minggu blok ini [{muscle: sets}], targets dari _pgenProgram_.
 * → 'keep' | 'next-block' | 'repeat' | 'level-up' | 'restart'.
 */
function _pgenReview_(daysSinceBlockStart, daysSinceLastLog, weeks, targets, upper, loadUpWithFormOk, light, level) {
  if (daysSinceLastLog >= PGEN.absenceResetDays) return 'restart';
  if (daysSinceBlockStart < PGEN.blockDays) return 'keep';
  const ms = Object.keys(targets || {});
  const avg = function(m) { return (weeks || []).reduce(function(a, w) { return a + (Number(w[m]) || 0); }, 0) / Math.max(1, (weeks || []).length); };
  const reached = ms.length > 0 && ms.every(function(m) { return avg(m) >= (targets[m] || 0) - 0.01; });
  if (!reached) return 'repeat';
  const atTop = ms.every(function(m) { return avg(m) >= upper - 0.01; });
  if (atTop && loadUpWithFormOk && !light && level !== 'menengah') return 'level-up';
  return 'next-block';
}
