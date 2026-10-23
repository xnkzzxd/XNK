/**
 * Fase Q (Wawasan): tafsir data klien jadi angka dan kalimat. Semua fungsi `_ins*_` murni
 * (tanpa sheet) dan dihitung untuk tiga rentang sekaligus: w4 (4 minggu), m3 (3 bulan), all.
 * Klien dapat nada menyemangati + satu saran; coach (audience 'coach') dapat nada faktual,
 * kategori mentah, dan RPE. Angka sensitif ke klien memakai label lembut.
 */

const INS_RANGES = { w4: 28, m3: 90, all: 100000 };
const INS_SOFT = { kurus: 'di bawah rentang sehat', normal: 'dalam rentang sehat', lebih: 'sedikit di atas rentang sehat', obesitas1: 'di atas rentang sehat', obesitas2: 'di atas rentang sehat', baik: 'dalam rentang sehat', waspada: 'sedikit di atas rentang sehat', tinggi: 'di atas rentang sehat' };
const INS_GROUP_OF = { chest: 'dorong', shoulders: 'dorong', back: 'tarik', 'upper legs': 'kaki', 'lower legs': 'kaki', waist: 'inti', 'upper arms': 'lengan', 'lower arms': 'lengan' };
const INS_GROUP_LABEL = { dorong: 'dorong', tarik: 'tarik', kaki: 'kaki', inti: 'inti', lengan: 'lengan' };

function _insNum_(v) { return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); }
function _insR_(v, d) { const f = Math.pow(10, d == null ? 1 : d); return Math.round(v * f) / f; }
function _insDays_(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function _insFmt_(v) { return String(_insR_(Math.abs(v), 1)).replace('.', ','); }

/** Murni: perubahan satu ukuran dalam rentang. {from,to,delta,perWeek,n} atau null (butuh >= 2 catatan). */
function _insMeasureRange_(entries, key, today, days) {
  const start = days >= INS_RANGES.all ? '0000-00-00' : _addDaysIso_(today, -days);
  const pts = (entries || []).filter(function(e) { return e.tanggal >= start && e.tanggal <= today && _insNum_(e[key]) != null; });
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const span = _insDays_(a.tanggal, b.tanggal);
  const delta = _insR_(Number(b[key]) - Number(a[key]), 1);
  return { from: Number(a[key]), to: Number(b[key]), delta: delta, perWeek: span >= 7 ? _insR_(delta / span * 7, 2) : null, n: pts.length, since: a.tanggal };
}

function _insBodyText_(r, goal, audience) {
  const w = r.berat;
  if (!w) return audience === 'coach' ? 'Belum ada dua catatan berat dalam rentang ini.' : 'Catat berat lagi untuk melihat tren.';
  const dir = w.delta < 0 ? 'turun' : w.delta > 0 ? 'naik' : 'tetap';
  const rate = w.perWeek != null ? ', ' + _insFmt_(w.perWeek) + ' kg/minggu' : '';
  const fit = _insGoalFit_(goal, w.delta);
  if (audience === 'coach') {
    return 'Berat ' + (w.delta === 0 ? 'tetap' : (w.delta < 0 ? '−' : '+') + _insFmt_(w.delta) + ' kg') + rate + (r.pinggang ? '; pinggang ' + (r.pinggang.delta > 0 ? '+' : r.pinggang.delta < 0 ? '−' : '') + _insFmt_(r.pinggang.delta) + ' cm' : '') + (fit ? ' (' + (fit === 'sesuai' ? 'sesuai' : 'belum sesuai') + ' target)' : '') + '.';
  }
  let t = w.delta === 0 ? 'Berat badanmu stabil.' : 'Berat badanmu ' + dir + ' ' + _insFmt_(w.delta) + ' kg' + rate + '.';
  if (fit === 'sesuai') t = 'Mantap! ' + t + ' Sesuai targetmu.';
  else if (fit === 'belum') t += ' Belum sejalan dengan targetmu, tidak apa, coba jaga konsistensi sesi dan catat makan.';
  else if (r.pinggang && r.pinggang.delta < 0) t += ' Pinggangmu juga mengecil ' + _insFmt_(r.pinggang.delta) + ' cm.';
  return t;
}

/** Murni: 'sesuai' | 'belum' | '' menurut tujuan (turun/naik/jaga/recomp) dan perubahan berat. */
function _insGoalFit_(goal, delta) {
  if (goal === 'turun') return delta < -0.2 ? 'sesuai' : 'belum';
  if (goal === 'naik') return delta > 0.2 ? 'sesuai' : 'belum';
  if (goal === 'jaga') return Math.abs(delta) <= 1 ? 'sesuai' : 'belum';
  return '';
}

/**
 * Murni: rapor tubuh. prof = {tinggi, goal}; bodyFat = angka terakhir atau null.
 * { sedikit, ranges:{w4,m3,all:{measures:{key:{...}}, text}}, bmi, whtr, bodyFat }
 */
function _insightBody_(entries, prof, bodyFat, today, audience) {
  prof = prof || {};
  const nBerat = (entries || []).filter(function(e) { return _insNum_(e.berat) != null; }).length;
  const last = function(key) { for (let i = (entries || []).length - 1; i >= 0; i--) if (_insNum_(entries[i][key]) != null) return entries[i]; return null; };
  const lb = last('berat'), lp = last('pinggang');
  const out = { sedikit: nBerat < 2, ranges: {}, bodyFat: bodyFat == null ? null : bodyFat };
  Object.keys(INS_RANGES).forEach(function(k) {
    const m = {};
    PROGRESS_MEASURES.forEach(function(pm) { const r = _insMeasureRange_(entries, pm.key, today, INS_RANGES[k]); if (r) m[pm.key] = r; });
    out.ranges[k] = { measures: m, text: _insBodyText_(m, prof.goal, audience) };
  });
  const cm = _insNum_(prof.tinggi);
  const bmi = lb && cm ? _nutBmi_(lb.berat, cm) : null;
  const whtr = lp && cm ? _nutWhtr_(lp.pinggang, cm) : null;
  const zone = function(x) { return x ? (audience === 'coach' ? { value: x.value, label: INS_SOFT[x.kategori], kategori: x.kategori } : { value: x.value, label: INS_SOFT[x.kategori] }) : null; };
  out.bmi = zone(bmi); out.whtr = zone(whtr);
  out.spark = (entries || []).filter(function(e) { return _insNum_(e.berat) != null; }).slice(-24).map(function(e) { return { t: e.tanggal, v: Number(e.berat) }; });
  return out;
}

/** Murni: kebugaran (tes pertama vs terakhir, %) dan simetri kanan-kiri dari catatan terakhir. */
function _insightFitness_(tests, entries) {
  const list = (tests || []).filter(function(t) { return t.first != null && t.latest != null && t.first !== '' && Number(t.first) !== 0; }).map(function(t) {
    const first = Number(t.first), latest = Number(t.latest);
    const raw = (latest - first) / Math.abs(first) * 100;
    const pct = _insR_(t.better === 'lower' ? -raw : raw, 0);
    return { id: t.id, label: t.label, unit: t.unit, first: first, latest: latest, pct: pct, improved: pct > 0, history: t.history || [] };
  });
  const last = function(key) { for (let i = (entries || []).length - 1; i >= 0; i--) if (_insNum_(entries[i][key]) != null) return Number(entries[i][key]); return null; };
  const pair = function(label, rk, lk) {
    const r = last(rk), l = last(lk);
    if (r == null || l == null) return null;
    const diff = _insR_(r - l, 1), pct = _insR_(Math.abs(diff) / Math.max(r, l) * 100, 1);
    return { label: label, kanan: r, kiri: l, diff: diff, pct: pct, flag: Math.abs(diff) > 1.5 || pct > 5 };
  };
  return { tests: list, symmetry: [pair('Lengan', 'lenganKanan', 'lenganKiri'), pair('Paha', 'pahaKanan', 'pahaKiri')].filter(Boolean) };
}

/**
 * Murni: hubungan per minggu. weekRows = [{start, activity, kcalAvg|null, dBerat|null}].
 * Butuh >= 6 minggu ber-Δberat dan >= 2 minggu di tiap kelompok. Kalimat: "berkaitan dengan", bukan sebab-akibat.
 */
function _insightLinks_(weekRows) {
  const rows = (weekRows || []).filter(function(w) { return w.dBerat != null; });
  const none = { enough: false, items: [] };
  if (rows.length < 6) return none;
  const avg = function(a) { return a.reduce(function(s, x) { return s + x.dBerat; }, 0) / a.length; };
  const items = [];
  const hi = rows.filter(function(w) { return w.activity >= 2; }), lo = rows.filter(function(w) { return w.activity < 2; });
  if (hi.length >= 2 && lo.length >= 2) items.push({ id: 'rutin', rutin: _insR_(avg(hi), 2), jarang: _insR_(avg(lo), 2), nRutin: hi.length, nJarang: lo.length });
  const k = rows.filter(function(w) { return w.kcalAvg != null && w.kcalTarget != null; });
  const under = k.filter(function(w) { return w.kcalAvg <= w.kcalTarget; }), over = k.filter(function(w) { return w.kcalAvg > w.kcalTarget; });
  if (under.length >= 2 && over.length >= 2) items.push({ id: 'kalori', dalam: _insR_(avg(under), 2), lebih: _insR_(avg(over), 2), nDalam: under.length, nLebih: over.length });
  return { enough: items.length > 0, items: items };
}

/** Murni: kelompok otot dari bodyPart. */
function _insGroup_(bodyPart) { return INS_GROUP_OF[String(bodyPart || '').toLowerCase()] || 'lain'; }

/**
 * Murni: tafsir latihan dari hari-hari latihan (bentuk _workoutGroup_, baru dulu).
 * thisWeek vs rata-rata 4 minggu sebelumnya; kekuatan (e1RM awal→kini, ×BB); mandek; keseimbangan otot.
 */
function _insightTraining_(days, sessions, bodyKg, today, audience) {
  days = days || [];
  const wk0 = _isoWeekStart_(today);
  const weekOf = function(t) { return _isoWeekStart_(t); };
  const bucket = {};
  days.forEach(function(d) {
    const w = weekOf(d.tanggal);
    const b = bucket[w] || (bucket[w] = { days: 0, sets: 0, volume: 0, durasi: 0, rpe: [] });
    b.days++;
    d.items.forEach(function(it) {
      it.sets.forEach(function(st) {
        b.durasi += Number(st.durasi) || 0;
        if (_isWarmup_(st.jenis)) return;
        b.sets++; b.volume += (Number(st.berat) || 0) * (Number(st.rep) || 0);
        if (Number(st.rpe) > 0) b.rpe.push(Number(st.rpe));
      });
    });
  });
  const cur = bucket[wk0] || { days: 0, sets: 0, volume: 0, durasi: 0, rpe: [] };
  const prev = [1, 2, 3, 4].map(function(i) { return bucket[_addDaysIso_(wk0, -7 * i)] || { days: 0, sets: 0, volume: 0, durasi: 0 }; });
  const mean = function(k) { return prev.reduce(function(s, b) { return s + b[k]; }, 0) / 4; };
  const cmp = function(k) { const base = mean(k); return { now: Math.round(cur[k]), avg: Math.round(base), pct: base > 0 ? _insR_((cur[k] - base) / base * 100, 0) : null }; };
  const hasHistory = prev.some(function(b) { return b.days > 0; });
  const week = { days: cmp('days'), sets: cmp('sets'), volume: cmp('volume'), durasi: cmp('durasi'), baseline: hasHistory };
  if (audience === 'coach') {
    const all = []; Object.keys(bucket).forEach(function(k) { bucket[k].rpe.forEach(function(v) { all.push(v); }); });
    week.rpe = all.length ? _insR_(all.reduce(function(a, b) { return a + b; }, 0) / all.length, 1) : null;
    const rasa = (sessions || []).filter(function(s) { return Number(s.rasa) > 0; }).slice(0, 10).map(function(s) { return Number(s.rasa); });
    week.rasa = rasa.length ? _insR_(rasa.reduce(function(a, b) { return a + b; }, 0) / rasa.length, 1) : null;
  }
  // Kekuatan per gerakan (kronologis) + mandek.
  const byEx = {};
  days.slice().reverse().forEach(function(d) {
    d.items.forEach(function(it) {
      let e1 = 0;
      it.sets.forEach(function(st) { if (_isWarmup_(st.jenis)) return; const e = _e1rm_(st.berat, st.rep); if (e > e1) e1 = e; });
      if (e1 <= 0) return;
      (byEx[it.key] || (byEx[it.key] = { key: it.key, gerakan: it.gerakan, bodyPart: it.bodyPart, pts: [] })).pts.push({ t: d.tanggal, e: e1 });
    });
  });
  const strength = Object.keys(byEx).map(function(k) { return byEx[k]; }).filter(function(x) { return x.pts.length >= 2; }).map(function(x) {
    const first = x.pts[0].e, lastE = x.pts[x.pts.length - 1].e, best = Math.max.apply(null, x.pts.map(function(p) { return p.e; }));
    const pct = first > 0 ? _insR_((lastE - first) / first * 100, 0) : null;
    // Mandek: >= 3 catatan dalam >= 3 minggu terakhir tanpa e1RM baru di atas yang sebelumnya.
    const recent = x.pts.filter(function(p) { return p.t >= _addDaysIso_(today, -21); });
    const earlierBest = Math.max.apply(null, x.pts.filter(function(p) { return p.t < _addDaysIso_(today, -21); }).map(function(p) { return p.e; }).concat([0]));
    const stalled = recent.length >= 3 && earlierBest > 0 && Math.max.apply(null, recent.map(function(p) { return p.e; })) <= earlierBest;
    return { key: x.key, gerakan: x.gerakan, bodyPart: x.bodyPart, e1rm: lastE, best: best, pct: pct, perBw: bodyKg > 0 ? _insR_(lastE / bodyKg, 2) : null, stalled: stalled, n: x.pts.length, spark: x.pts.slice(-12).map(function(p) { return p.e; }) };
  }).sort(function(a, b) { return b.n - a.n; }).slice(0, 8);
  // Keseimbangan otot (4 minggu terakhir) dan yang terlewat 14 hari.
  const vol = { dorong: 0, tarik: 0, kaki: 0, inti: 0, lengan: 0 }, seen14 = {};
  days.forEach(function(d) {
    d.items.forEach(function(it) {
      const g = _insGroup_(it.bodyPart);
      if (!(g in vol)) return;
      if (d.tanggal >= _addDaysIso_(today, -14)) seen14[g] = true;
      if (d.tanggal < _addDaysIso_(today, -28)) return;
      it.sets.forEach(function(st) { if (!_isWarmup_(st.jenis)) vol[g] += (Number(st.berat) || 0) * (Number(st.rep) || 0); });
    });
  });
  const total = Object.keys(vol).reduce(function(s, k) { return s + vol[k]; }, 0);
  const groups = Object.keys(vol).map(function(k) { return { id: k, label: INS_GROUP_LABEL[k], volume: Math.round(vol[k]), share: total > 0 ? _insR_(vol[k] / total * 100, 0) : 0 }; });
  const missed = total > 0 ? Object.keys(vol).filter(function(k) { return k !== 'lengan' && k !== 'inti' && !seen14[k]; }) : [];
  const pushPull = vol.tarik > 0 ? _insR_(vol.dorong / vol.tarik, 1) : null;
  const out = { week: week, strength: strength, balance: { groups: groups, missed: missed, pushPull: pushPull, enough: total > 0 } };
  out.text = _insTrainText_(week, strength, out.balance, audience);
  return out;
}

function _insTrainText_(week, strength, balance, audience) {
  if (!week.days.now && !week.days.avg) return audience === 'coach' ? 'Belum ada log latihan.' : 'Belum ada latihan tercatat. Mulai satu sesi untuk melihat perkembanganmu.';
  const v = week.volume;
  const parts = [];
  if (v.pct != null) parts.push((audience === 'coach' ? 'Volume minggu ini ' : 'Volume latihanmu minggu ini ') + (v.pct >= 0 ? 'naik ' : 'turun ') + Math.abs(v.pct) + '% dari rata-rata 4 minggu.');
  else parts.push('Minggu ini ' + week.days.now + ' hari latihan, ' + week.sets.now + ' set kerja.');
  const stalled = strength.filter(function(s) { return s.stalled; })[0];
  if (stalled) parts.push(audience === 'coach' ? stalled.gerakan + ' mandek ≥ 3 minggu.' : stalled.gerakan + ' mulai mandek. Coba tambah 1 rep atau 2,5 kg.');
  else if (balance.missed.length && audience !== 'coach') parts.push('Otot ' + balance.missed[0] + ' belum dilatih 2 minggu terakhir.');
  return parts.join(' ');
}

/**
 * Murni: aktivitas 84 hari (12 minggu, mulai Senin) sebagai level 0..4, plus kepatuhan program per minggu.
 * ctx = { sessionDates:[iso], workoutDates:[iso], foodDates:[iso], workoutDays:[{tanggal, items:[{hari}]}], programNames:[hari] }
 */
function _insightActivity_(ctx, today) {
  const start = _addDaysIso_(_isoWeekStart_(today), -77);
  const count = {};
  ['sessionDates', 'workoutDates', 'foodDates'].forEach(function(k) { (ctx[k] || []).forEach(function(d) { count[d] = (count[d] || 0) + 1; }); });
  const levels = [], dates = [];
  for (let i = 0; i < 84; i++) { const d = _addDaysIso_(start, i); dates.push(d); levels.push(d > today ? 0 : Math.min(4, count[d] || 0)); }
  const names = ctx.programNames || [];
  const adherence = [];
  if (names.length) {
    for (let w = 0; w < 12; w++) {
      const ws = _addDaysIso_(start, w * 7), we = _addDaysIso_(ws, 6);
      const done = {};
      (ctx.workoutDays || []).forEach(function(d) { if (d.tanggal >= ws && d.tanggal <= we) d.items.forEach(function(it) { if (it.hari && names.indexOf(it.hari) !== -1) done[it.hari] = true; }); });
      adherence.push({ start: ws, done: Object.keys(done).length, planned: names.length });
    }
  }
  const active = levels.filter(function(l) { return l > 0; }).length;
  return { start: start, levels: levels, active: active, adherence: adherence };
}

/** Murni: ringkasan minggu WIB ini untuk Beranda. */
function _portalWeek_(ctx, today) {
  const ws = _isoWeekStart_(today), we = _addDaysIso_(ws, 6);
  const inWeek = function(d) { return d >= ws && d <= we; };
  const uniq = function(a) { const o = {}; (a || []).filter(inWeek).forEach(function(d) { o[d] = true; }); return Object.keys(o).length; };
  const sess = ctx.sessions || [];
  return {
    start: ws,
    sessionsDone: sess.filter(function(s) { return s.done && inWeek(s.date); }).length,
    sessionsBooked: sess.filter(function(s) { return !s.done && inWeek(s.date) && s.date >= today; }).length,
    workoutDays: uniq(ctx.workoutDates),
    foodDays: ctx.foodDates ? uniq(ctx.foodDates) : null,
    kcal: ctx.kcal || null,
    streak: ctx.streak || 0,
    challenge: ctx.challenge || null
  };
}

/** Kumpulkan masukan dari sheet lalu hitung semua tafsir. audience: 'client' | 'coach'. */
function _insightFor_(row, audience, pre) {
  pre = pre || {};
  const ok = function(x) { return x && !x.error ? x : null; };
  const id = String(row[0]).trim();
  const today = _todayWib_();
  const entries = ok(pre.progress) ? pre.progress.entries : _readProgress_(id);
  const prof = _nutProfileFrom_(row);
  const workout = ok(pre.workout) || _workoutFor_(row);
  const spy = {};
  const assessment = ok(pre.assessment) || _assessmentFor_(row, spy);
  const bodyFat = pre.bodyFat !== undefined ? pre.bodyFat : (spy.bodyFat == null ? null : spy.bodyFat);
  const sessions = _getSchedulesAll_().filter(function(s) { return String(s.memberId).trim() === id; });
  const sessDates = sessions.filter(function(s) { return String(s.status || '').toLowerCase() === 'completed'; }).map(function(s) { return _wibParts_(new Date(s.start)).date; });
  const nutOn = _nutEnabled_() && prof.aktif;
  const foodRows = nutOn ? _foodLogRows_(id) : [];
  const foodDates = foodRows.map(function(r) { return r.tanggal; }).filter(function(d, i, a) { return a.indexOf(d) === i; });
  const kcalByDay = {}; foodRows.forEach(function(r) { kcalByDay[r.tanggal] = (kcalByDay[r.tanggal] || 0) + r.kal; });
  let kcalTarget = null;
  if (nutOn) {
    if (ok(pre.nutrition) && pre.nutrition.enabled) kcalTarget = pre.nutrition.target && pre.nutrition.target.ok ? Number(pre.nutrition.target.kal) || null : null;
    else { try { const c = _nutComputeFor_(row); kcalTarget = c.target && c.target.ok ? Number(c.target.kal) || null : null; } catch (e) { kcalTarget = null; } }
  }
  const lastKg = entries.filter(function(e) { return _insNum_(e.berat) != null; }).slice(-1)[0];
  // Baris mingguan untuk hubungan.
  const weekRows = [];
  for (let i = 11; i >= 0; i--) {
    const ws = _addDaysIso_(_isoWeekStart_(today), -7 * i), we = _addDaysIso_(ws, 6);
    const inW = function(d) { return d >= ws && d <= we; };
    const act = sessDates.filter(inW).length + workout.days.filter(function(d) { return inW(d.tanggal); }).length;
    const ptsW = entries.filter(function(e) { return inW(e.tanggal) && _insNum_(e.berat) != null; });
    const nextW = entries.filter(function(e) { return e.tanggal > we && e.tanggal <= _addDaysIso_(we, 7) && _insNum_(e.berat) != null; });
    const dBerat = ptsW.length && nextW.length ? _insR_(Number(nextW[nextW.length - 1].berat) - Number(ptsW[ptsW.length - 1].berat), 2) : null;
    const ks = Object.keys(kcalByDay).filter(inW);
    weekRows.push({ start: ws, activity: act, dBerat: dBerat, kcalAvg: ks.length >= 3 ? Math.round(ks.reduce(function(s, k) { return s + kcalByDay[k]; }, 0) / ks.length) : null, kcalTarget: kcalTarget });
  }
  const program = ok(pre.program) ? pre.program.days : _programDays_(id).days;
  const out = {
    body: _insightBody_(entries, prof, bodyFat, today, audience),
    fitness: _insightFitness_(assessment.tests, entries),
    links: _insightLinks_(weekRows),
    training: _insightTraining_(workout.days, workout.sessions, lastKg ? Number(lastKg.berat) : 0, today, audience),
    activity: _insightActivity_({ sessionDates: sessDates, workoutDates: workout.days.map(function(d) { return d.tanggal; }), foodDates: foodDates, workoutDays: workout.days, programNames: program.map(function(d) { return d.hari; }) }, today)
  };
  out.week = _portalWeek_({
    sessions: sessions.map(function(s) { return { date: _wibParts_(new Date(s.start)).date, done: String(s.status || '').toLowerCase() === 'completed' }; }),
    workoutDates: workout.days.map(function(d) { return d.tanggal; }),
    foodDates: nutOn ? foodDates : null,
    kcal: nutOn && kcalTarget ? { today: Math.round(kcalByDay[today] || 0), target: kcalTarget } : null,
    streak: _streakInfo_(id).streak,
    challenge: _monthlyChallenge_(id)
  }, today);
  return out;
}
