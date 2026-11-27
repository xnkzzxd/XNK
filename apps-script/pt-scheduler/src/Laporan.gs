// =============================================================================
// Laporan.gs — Fase AD4 (T-2440): data laporan PDF yang dibuat HANYA saat klien atau coach menekan tombol.
// Server menghitung angka dan kalimat tafsir (nada klien, tanpa RPE, catatan privat, catatan cuti, nomor HP, atau foto);
// browser menggambar halaman A4 dan menyusun PDF di perangkat (parts/app/23-laporan.part). Tidak ada yang disimpan
// atau diunggah. docs/coachkit/Design.md §AD4.
// =============================================================================

const REPORT = { maxDays: 400, defaultDays: 28, notesMax: 6, liftsMax: 6, liftsChart: 3, weightPts: 40,
  // AD5 (T-2450): skor dan status per pilar. docs/coachkit/Design.md §AD5.
  baik: 75, cukup: 50, sesiTarget: 2, kalBand: 0.1, protOk: 0.9, maxWins: 3, maxFokus: 2 };

/** Murni: rentang laporan {from, to} → divalidasi; bawaan 28 hari terakhir. Lempar error Indonesia. */
function _reportRange_(req, today) {
  req = req || {};
  const to = String(req.to || today).trim();
  const from = String(req.from || _addDaysIso_(to, -(REPORT.defaultDays - 1))).trim();
  if (!_validDate_(from) || !_validDate_(to)) throw new Error('Tanggal laporan tidak valid.');
  if (to > today) throw new Error('Tanggal akhir tidak boleh di masa depan.');
  if (from > to) throw new Error('Tanggal awal harus sebelum tanggal akhir.');
  const len = _daysBetweenIso_(from, to) + 1;
  if (len > REPORT.maxDays) throw new Error('Rentang laporan paling panjang ' + REPORT.maxDays + ' hari.');
  return { from: from, to: to, days: len, prevFrom: _addDaysIso_(from, -len), prevTo: _addDaysIso_(from, -1) };
}

const _rpR1_ = function(n) { return Math.round(n * 10) / 10; };
const _rpIn_ = function(t, a, b) { return t >= a && t <= b; };
function _rpNum_(n, dp) { return String(_rpR1_(n)).replace('.', ','); }
function _rpSigned_(n, unit) { const v = _rpR1_(n); return (v > 0 ? '+' : v < 0 ? '\u2212' : '\u00b1') + String(Math.abs(v)).replace('.', ',') + (unit ? ' ' + unit : ''); }

/**
 * Murni: semua angka dan kalimat laporan dari data mentah satu klien.
 * src = { name, coach, today, range, sessions:[{tanggal, done, id}], holds:[{jenis, mulai, sampai}], workoutRows (baris WorkoutLog yang sudah
 * di-resolve), prsAll:[{tanggal, gerakan}], progress:[entri _readProgress_], measures:[PROGRESS_MEASURES], food:[{tanggal, kal, p}],
 * target:{kal, protein}|null, tests:{id:[{tanggal, nilai}]}, testDefs:[FITNESS_TESTS], notes:{scheduleId:{dilatih, fokus}}, streak, bestStreak }
 */
function _reportCalc_(src) {
  const R = src.range, inP = function(t) { return _rpIn_(t, R.from, R.to); }, inPrev = function(t) { return _rpIn_(t, R.prevFrom, R.prevTo); };
  // Kehadiran
  const done = (src.sessions || []).filter(function(s) { return s.done; });
  const sesi = done.filter(function(s) { return inP(s.tanggal); }).length, sesiPrev = done.filter(function(s) { return inPrev(s.tanggal); }).length;
  const weeks = {};
  for (let d = R.from; d <= R.to; d = _addDaysIso_(d, 1)) weeks[_weekStart_(d)] = 0;
  done.forEach(function(s) { if (inP(s.tanggal)) weeks[_weekStart_(s.tanggal)] = (weeks[_weekStart_(s.tanggal)] || 0) + 1; });
  const holds = (src.holds || []).filter(function(h) { return h.mulai <= R.to && (!h.sampai || h.sampai >= R.from); })
    .map(function(h) { return { jenis: h.jenis, mulai: h.mulai < R.from ? R.from : h.mulai, sampai: !h.sampai || h.sampai > R.to ? R.to : h.sampai }; });
  const heldDay = {};
  holds.forEach(function(h) { for (let d = h.mulai; d <= h.sampai; d = _addDaysIso_(d, 1)) heldDay[d] = true; });
  const calendar = {};
  done.forEach(function(s) { if (inP(s.tanggal)) calendar[s.tanggal] = 'sesi'; });

  // Latihan
  const rows = (src.workoutRows || []), rowsIn = rows.filter(function(r) { return inP(_isoDateCell_(r[2])); });
  const selfWeeks = {};
  rowsIn.forEach(function(r) { selfWeeks[_weekStart_(_isoDateCell_(r[2]))] = true; });
  // Minggu aktif = ada sesi dengan coach ATAU latihan yang dicatat; minggu yang sebagian besar cuti tidak dihitung.
  const weekList = Object.keys(weeks).sort().map(function(w) {
    let held = 0; for (let i = 0; i < 7; i++) if (heldDay[_addDaysIso_(w, i)]) held++;
    return { minggu: w, sesi: weeks[w], latihan: !!selfWeeks[w], cuti: held >= 4 };
  });
  const activeWeeks = weekList.filter(function(w) { return !w.cuti; }), weeksWithSession = activeWeeks.filter(function(w) { return w.sesi > 0 || w.latihan; }).length;
  const rowsPrev = rows.filter(function(r) { return inPrev(_isoDateCell_(r[2])); });
  const g = _workoutGroup_(rowsIn), gPrev = _workoutGroup_(rowsPrev);
  const prsByDate = {};
  (src.prsAll || []).forEach(function(p) { if (inP(p.tanggal)) prsByDate[p.tanggal] = (prsByDate[p.tanggal] || 0) + 1; });
  const stats = _workoutStats_(g.days, R.to, prsByDate);
  const vol = function(days) { let v = 0, sets = 0; days.forEach(function(d) { d.items.forEach(function(it) { it.sets.forEach(function(s) { if (_isWarmup_(s.jenis)) return; sets++; v += (Number(s.berat) || 0) * (Number(s.rep) || 0); }); }); }); return { v: Math.round(v), sets: sets }; };
  const vNow = vol(g.days), vPrev = vol(gPrev.days);
  g.days.forEach(function(d) { if (!calendar[d.tanggal]) calendar[d.tanggal] = 'latihan'; });
  const liftsAll = stats.exercises.filter(function(e) { return e.points.length >= 1 && e.points.some(function(p) { return p.e1rm > 0; }); }).slice(0, REPORT.liftsMax).map(function(e) {
    const pts = e.points.filter(function(p) { return p.e1rm > 0; }), a = pts[0], b = pts[pts.length - 1];
    const best = e.pr || {};
    return { gerakan: e.gerakan, key: e.key, bodyPart: e.bodyPart || '', kali: pts.length, awal: a.e1rm, akhir: b.e1rm, ubah: _rpR1_(b.e1rm - a.e1rm), pct: a.e1rm ? Math.round((b.e1rm - a.e1rm) / a.e1rm * 100) : 0,
      terbaik: best.berat ? { berat: best.berat, rep: best.rep, tanggal: best.tanggal } : null, titik: pts.map(function(p) { return { tanggal: p.tanggal, v: p.e1rm }; }) };
  });
  const lifts = liftsAll.slice(0, REPORT.liftsChart);
  const prs = (src.prsAll || []).filter(function(p) { return inP(p.tanggal); });
  const parts = stats.topParts.slice(0, 6);

  // Tubuh
  const prog = (src.progress || []);
  const body = (src.measures || []).map(function(m) {
    const pts = prog.filter(function(e) { return e[m.key] !== '' && e[m.key] != null; });
    const before = pts.filter(function(e) { return e.tanggal < R.from; }), within = pts.filter(function(e) { return inP(e.tanggal); });
    if (!within.length) return null;
    const start = before.length ? before[before.length - 1] : within[0], end = within[within.length - 1];
    return { key: m.key, label: m.short || m.label, unit: m.unit, awal: start[m.key], akhir: end[m.key], ubah: _rpR1_(end[m.key] - start[m.key]), awalTgl: start.tanggal, akhirTgl: end.tanggal };
  }).filter(Boolean);
  const berat = prog.filter(function(e) { return e.berat !== '' && e.berat != null && inP(e.tanggal); }).slice(-REPORT.weightPts).map(function(e) { return { tanggal: e.tanggal, v: e.berat }; });

  // Makan
  let makan = null;
  if (src.food) {
    const byDay = {};
    src.food.forEach(function(f) { if (!inP(f.tanggal)) return; const x = byDay[f.tanggal] || (byDay[f.tanggal] = { kal: 0, p: 0 }); x.kal += f.kal; x.p += f.p; });
    const ds = Object.keys(byDay), n = ds.length;
    const avgK = n ? Math.round(ds.reduce(function(a, k) { return a + byDay[k].kal; }, 0) / n) : 0;
    const avgP = n ? Math.round(ds.reduce(function(a, k) { return a + byDay[k].p; }, 0) / n) : 0;
    const t = src.target || null;
    const protOk = t && t.protein ? ds.filter(function(k) { return byDay[k].p >= t.protein * 0.9; }).length : null;
    makan = { hari: n, dari: R.days, kal: avgK, protein: avgP, targetKal: t ? t.kal : null, targetProtein: t ? t.protein : null, proteinCukup: protOk };
    ds.forEach(function(k) { if (!calendar[k]) calendar[k] = 'makan'; });
  }

  // Tes kebugaran: nilai terakhir di periode dibanding nilai sebelumnya (sebelum periode, atau awal periode)
  const tes = (src.testDefs || []).map(function(t) {
    const list = ((src.tests || {})[t.id] || []).filter(function(x) { return x.tanggal <= R.to; });
    const within = list.filter(function(x) { return inP(x.tanggal); });
    if (!within.length) return null;
    const before = list.filter(function(x) { return x.tanggal < R.from; });
    const a = before.length ? before[before.length - 1] : (within.length > 1 ? within[0] : null), b = within[within.length - 1];
    const ubah = a ? _rpR1_(b.nilai - a.nilai) : null;
    return { label: t.label, unit: t.unit, akhir: b.nilai, awal: a ? a.nilai : null, ubah: ubah, membaik: ubah === null ? null : (t.better === 'lower' ? ubah < 0 : ubah > 0) };
  }).filter(Boolean);

  // Catatan sesi yang memang dibagikan ke klien (dilatih / fokus); bukan RPE atau catatan privat.
  const notes = (src.sessions || []).filter(function(s) { return s.done && inP(s.tanggal) && src.notes && src.notes[s.id]; })
    .sort(function(a, b) { return a.tanggal < b.tanggal ? 1 : -1; }).slice(0, REPORT.notesMax)
    .map(function(s) { return { tanggal: s.tanggal, dilatih: src.notes[s.id].dilatih || '', fokus: src.notes[s.id].fokus || '' }; });

  // Angka utama
  const headline = [{ key: 'sesi', label: 'Sesi selesai', value: sesi, delta: sesi - sesiPrev, prev: sesiPrev }];
  headline.push({ key: 'latihan', label: 'Hari latihan', value: g.days.length, delta: g.days.length - gPrev.days.length, prev: gPrev.days.length });
  if (vNow.v) headline.push({ key: 'volume', label: 'Volume', value: vNow.v, unit: 'kg', delta: vNow.v - vPrev.v, prev: vPrev.v });
  body.filter(function(b) { return b.key === 'berat' || b.key === 'pinggang'; }).forEach(function(b) { headline.push({ key: b.key, label: b.label, value: b.akhir, unit: b.unit, delta: b.ubah, change: true }); });
  if (makan && makan.hari) headline.push({ key: 'makan', label: 'Hari catat makan', value: makan.hari, of: R.days });

  // Kalimat tafsir (nada klien: netral, sopan, tanpa menilai)
  const ringkas = [], lanjut = [];
  if (sesi || sesiPrev) ringkas.push(sesi + ' sesi selesai' + (sesiPrev ? (sesi > sesiPrev ? ', ' + (sesi - sesiPrev) + ' lebih banyak dari periode sebelumnya.' : sesi < sesiPrev ? ', ' + (sesiPrev - sesi) + ' lebih sedikit dari periode sebelumnya.' : ', sama dengan periode sebelumnya.') : '.'));
  if (activeWeeks.length) ringkas.push('Aktif berlatih di ' + weeksWithSession + ' dari ' + activeWeeks.length + ' minggu' + (holds.length ? ' (minggu cuti tidak dihitung)' : '') + '.');
  if (lifts.length) {
    const up = lifts.filter(function(l) { return l.ubah > 0; });
    if (up.length) ringkas.push('Kekuatan naik di ' + up.map(function(l) { return l.gerakan + ' (' + _rpSigned_(l.pct, '%') .replace(' %', '%') + ')'; }).join(', ') + '.');
    else ringkas.push('Kekuatan stabil di gerakan utama.');
  }
  if (prs.length) ringkas.push(prs.length + ' rekor pribadi baru.');
  const bw = body.find(function(b) { return b.key === 'berat'; }), wa = body.find(function(b) { return b.key === 'pinggang'; });
  if (bw && bw.awalTgl !== bw.akhirTgl) ringkas.push('Berat ' + (bw.ubah === 0 ? 'tetap' : (bw.ubah < 0 ? 'turun ' : 'naik ') + _rpNum_(Math.abs(bw.ubah)) + ' kg') + (wa && wa.awalTgl !== wa.akhirTgl && wa.ubah !== 0 ? ', lingkar pinggang ' + (wa.ubah < 0 ? 'turun ' : 'naik ') + _rpNum_(Math.abs(wa.ubah)) + ' cm' : '') + '.');
  if (makan && makan.hari) ringkas.push('Makan tercatat ' + makan.hari + ' dari ' + R.days + ' hari, rata-rata ' + makan.kal.toLocaleString('id-ID') + ' kkal' + (makan.targetKal ? ' (target ' + Math.round(makan.targetKal).toLocaleString('id-ID') + ')' : '') + '.');
  if (holds.length) ringkas.push('Ada masa ' + holds.map(function(h) { return (h.jenis === 'sakit' ? 'sakit' : h.jenis === 'berhenti' ? 'nonaktif' : 'cuti') + ' ' + _holdDay_(h.mulai) + (h.sampai !== h.mulai ? '\u2013' + _holdDay_(h.sampai) : ''); }).join(', ') + '; streak tidak putus karenanya.');
  if (!ringkas.length) ringkas.push('Belum ada catatan di periode ini. Laporan berikutnya akan terisi setelah sesi dan catatan pertama.');
  const lastFokus = notes.find(function(n) { return n.fokus; });
  if (lastFokus) lanjut.push('Fokus dari coach: ' + lastFokus.fokus);
  if (activeWeeks.length >= 2 && weeksWithSession / activeWeeks.length < 0.75) lanjut.push('Jaga ritme: usahakan minimal satu sesi setiap minggu.');
  if (lifts.length && !lifts.some(function(l) { return l.ubah > 0; })) lanjut.push('Saatnya menambah beban sedikit di gerakan utama, bersama coach.');
  if (makan && makan.hari < R.days * 0.5) lanjut.push('Catat makan minimal empat hari per minggu supaya target bisa disesuaikan.');
  if (makan && makan.proteinCukup !== null && makan.hari && makan.proteinCukup < makan.hari * 0.6) lanjut.push('Protein masih sering di bawah target; tambahkan lauk berprotein di tiap makan.');
  if (!body.length) lanjut.push('Catat berat dan lingkar pinggang minimal dua minggu sekali.');
  if (!lanjut.length) lanjut.push('Pertahankan ritme ini dan lanjutkan program bersama coach.');

  const an = _reportAnalysis_({ R: R, sesi: sesi, sesiPrev: sesiPrev, weekList: weekList, activeWeeks: activeWeeks, weeksWithSession: weeksWithSession, done: done,
    days: g.days, daysPrev: gPrev.days, vNow: vNow, vPrev: vPrev, lifts: liftsAll, prs: prs, body: body, makan: makan, food: src.food, target: src.target,
    tes: tes, notes: notes, streak: src.streak || 0, bestStreak: src.bestStreak || 0, goal: src.goal || '' });

  return {
    jk: src.jk === 'P' ? 'f' : 'm', skor: an.skor, menang: an.menang, fokus: an.fokus, analisis: an.detail,
    name: src.name, coach: src.coach, periode: { from: R.from, to: R.to, days: R.days, prevFrom: R.prevFrom, prevTo: R.prevTo }, dibuat: src.today,
    headline: headline, kehadiran: { sesi: sesi, sesiPrev: sesiPrev, minggu: weekList, streak: src.streak || 0, bestStreak: src.bestStreak || 0, calendar: calendar }, cuti: holds,
    latihan: { hari: g.days.length, set: vNow.sets, volume: vNow.v, volumePrev: vPrev.v, angkatan: lifts, angkatanSemua: liftsAll, rekor: prs.map(function(p) { return { tanggal: p.tanggal, gerakan: p.gerakan }; }).slice(0, 8), otot: parts, mingguan: stats.weeks },
    tubuh: { ukuran: body, berat: berat }, makan: makan, tes: tes, catatan: notes, teks: { ringkas: ringkas, lanjut: lanjut }
  };
}

const RP_PART_GROUP_ = { 'chest': 'dorong', 'shoulders': 'dorong', 'upper arms': 'lengan', 'lower arms': 'lengan', 'back': 'tarik', 'upper legs': 'kaki', 'lower legs': 'kaki', 'waist': 'inti', 'cardio': 'kardio' };
const RP_GROUP_LABEL_ = { dorong: 'Dada & bahu', tarik: 'Punggung', kaki: 'Kaki', lengan: 'Lengan', inti: 'Perut & inti', kardio: 'Kardio', lain: 'Lainnya' };
function _rpStatus_(n) { return n == null ? null : n >= REPORT.baik ? 'baik' : n >= REPORT.cukup ? 'cukup' : 'perlu'; }
function _rpClamp_(n) { return Math.max(0, Math.min(100, Math.round(n))); }
function _rpMedian_(a) { if (!a.length) return 0; const s = a.slice().sort(function(x, y) { return x - y; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function _rpWeekday_(iso) { const p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }

/**
 * Murni (AD5, T-2450): skor empat pilar, tiga hal terbaik, satu–dua fokus, dan analisis rinci per bagian
 * (tiap bagian punya `tafsir` = "Artinya: …" dalam nada klien). Data yang kurang = pilar null (tidak dinilai).
 */
function _reportAnalysis_(a) {
  const R = a.R, pil = [];
  // ── Konsistensi
  let kons = null;
  if (a.activeWeeks.length) {
    const ratio = a.weeksWithSession / a.activeWeeks.length;
    const perWeek = a.activeWeeks.reduce(function(t, w) { return t + w.sesi; }, 0) / a.activeWeeks.length;
    kons = _rpClamp_(ratio * 70 + Math.min(1, perWeek / REPORT.sesiTarget) * 30);
    if (!a.sesi && !a.days.length) kons = a.sesiPrev || a.daysPrev.length ? 0 : null;
  }
  // jeda terpanjang (hari tanpa sesi atau latihan, tidak termasuk masa cuti di kalender)
  const act = {};
  a.done.forEach(function(s) { if (_rpIn_(s.tanggal, R.from, R.to)) act[s.tanggal] = true; });
  a.days.forEach(function(d) { act[d.tanggal] = true; });
  const actDays = Object.keys(act).sort();
  let jeda = 0;
  for (let i = 1; i < actDays.length; i++) jeda = Math.max(jeda, _daysBetweenIso_(actDays[i - 1], actDays[i]) - 1);
  const perMinggu = a.activeWeeks.length ? _rpR1_(a.activeWeeks.reduce(function(t, w) { return t + w.sesi; }, 0) / a.activeWeeks.length) : 0;
  pil.push({ key: 'konsistensi', label: 'Konsistensi', skor: kons, status: _rpStatus_(kons),
    kalimat: kons == null ? '' : 'Aktif ' + a.weeksWithSession + ' dari ' + a.activeWeeks.length + ' minggu, rata-rata ' + _rpNum_(perMinggu) + ' sesi per minggu.' });

  // ── Kekuatan
  let kek = null;
  const pcts = a.lifts.filter(function(l) { return l.kali >= 2; }).map(function(l) { return l.pct; });
  if (pcts.length) kek = _rpClamp_(50 + _rpMedian_(pcts) * 5 + Math.min(20, a.prs.length * 5));
  const naik = a.lifts.filter(function(l) { return l.kali >= 2 && l.pct > 0; }).length;
  pil.push({ key: 'kekuatan', label: 'Kekuatan', skor: kek, status: _rpStatus_(kek),
    kalimat: kek == null ? '' : naik + ' dari ' + pcts.length + ' gerakan utama makin kuat' + (a.prs.length ? ', ' + a.prs.length + ' rekor baru.' : '.') });

  // ── Tubuh (arah perubahan dibanding tujuan klien)
  const bw = a.body.find(function(b) { return b.key === 'berat'; }), wa = a.body.find(function(b) { return b.key === 'pinggang'; });
  const goal = a.goal, moved = function(b) { return b && b.awalTgl !== b.akhirTgl; };
  let tub = null, arahTeks = '';
  if (moved(bw) || moved(wa)) {
    const wantW = goal === 'turun' ? -1 : goal === 'naik' ? 1 : 0;
    let sc = 60;
    if (moved(bw)) {
      const pctW = bw.awal ? (bw.ubah / bw.awal) * 100 : 0;
      if (wantW) sc += Math.max(-40, Math.min(35, wantW * pctW * 12));
      else sc += Math.abs(pctW) <= 2 ? 20 : -10;
    }
    if (moved(wa)) sc += wa.ubah < 0 ? 15 : wa.ubah > 0 && goal !== 'naik' ? -10 : 0;
    tub = _rpClamp_(sc);
    arahTeks = goal === 'turun' ? 'Tujuan: menurunkan berat.' : goal === 'naik' ? 'Tujuan: menaikkan berat.' : goal === 'recomp' ? 'Tujuan: membentuk tubuh.' : goal === 'jaga' ? 'Tujuan: menjaga berat.' : '';
  }
  pil.push({ key: 'tubuh', label: 'Tubuh', skor: tub, status: _rpStatus_(tub),
    kalimat: tub == null ? '' : [moved(bw) ? 'Berat ' + (bw.ubah === 0 ? 'tetap' : _rpSigned_(bw.ubah, 'kg')) : '', moved(wa) ? 'pinggang ' + (wa.ubah === 0 ? 'tetap' : _rpSigned_(wa.ubah, 'cm')) : ''].filter(Boolean).join(', ') + '. ' + arahTeks });

  // ── Makan
  let mak = null, makanD = null;
  if (a.makan && a.makan.hari) {
    const byDay = {};
    (a.food || []).forEach(function(f) { if (!_rpIn_(f.tanggal, R.from, R.to)) return; const x = byDay[f.tanggal] || (byDay[f.tanggal] = { kal: 0, p: 0 }); x.kal += f.kal; x.p += f.p; });
    const ds = Object.keys(byDay).sort(), t = a.target;
    const pas = t && t.kal ? ds.filter(function(k) { return Math.abs(byDay[k].kal - t.kal) <= t.kal * REPORT.kalBand; }).length : null;
    const avg = function(list) { return list.length ? Math.round(list.reduce(function(s, k) { return s + byDay[k].kal; }, 0) / list.length) : null; };
    const wk = ds.filter(function(k) { const d = _rpWeekday_(k); return d >= 1 && d <= 5; }), we = ds.filter(function(k) { const d = _rpWeekday_(k); return d === 0 || d === 6; });
    const logR = Math.min(1, a.makan.hari / (R.days * 0.8));
    const pasR = pas == null ? logR : pas / ds.length, protR = a.makan.proteinCukup == null ? pasR : a.makan.proteinCukup / ds.length;
    mak = _rpClamp_(logR * 40 + pasR * 35 + protR * 25);
    makanD = { hariKal: ds.map(function(k) { return { tanggal: k, v: Math.round(byDay[k].kal), p: Math.round(byDay[k].p) }; }), pasTarget: pas, rataKerja: avg(wk), rataAkhirPekan: avg(we),
      tafsir: 'Artinya: ' + (pas != null ? pas + ' dari ' + ds.length + ' hari tercatat sudah dekat target kalori (\u00b110 %). ' : '') +
        (a.makan.hari < R.days * 0.5 ? 'Makin sering dicatat, makin tepat coach menyesuaikan target.' : 'Catatan makan sudah cukup rutin untuk dibaca polanya.') +
        (avg(we) && avg(wk) && avg(we) > avg(wk) * 1.15 ? ' Akhir pekan cenderung lebih banyak dari hari kerja.' : '') };
  }
  pil.push({ key: 'makan', label: 'Makan', skor: mak, status: _rpStatus_(mak),
    kalimat: mak == null ? '' : 'Tercatat ' + a.makan.hari + ' dari ' + R.days + ' hari' + (makanD && makanD.pasTarget != null ? ', ' + makanD.pasTarget + ' hari pas target.' : '.') });

  const nilai = pil.filter(function(p) { return p.skor != null; });
  const total = nilai.length ? _rpClamp_(nilai.reduce(function(t, p) { return t + p.skor; }, 0) / nilai.length) : null;
  const vonis = total == null ? 'Belum cukup data untuk dinilai. Laporan berikutnya akan lebih lengkap.'
    : total >= REPORT.baik ? 'Periode yang sangat baik. Pertahankan ritmenya.'
    : total >= REPORT.cukup ? 'Sudah di jalur yang benar, masih ada ruang untuk naik.'
    : 'Periode ini masih bisa ditingkatkan, dan langkah kecil sudah cukup untuk mulai.';

  // ── Tiga hal terbaik
  const wins = [];
  a.lifts.filter(function(l) { return l.kali >= 2 && l.pct > 0; }).sort(function(x, y) { return y.pct - x.pct; }).slice(0, 2)
    .forEach(function(l) { wins.push({ w: 50 + l.pct, judul: l.gerakan, angka: '+' + l.pct + '%', kalimat: 'Naik dari ' + _rpNum_(l.awal) + ' ke ' + _rpNum_(l.akhir) + ' kg.' }); });
  if (a.prs.length) wins.push({ w: 40 + a.prs.length * 5, judul: 'Rekor pribadi', angka: String(a.prs.length), kalimat: 'Rekor baru di periode ini.' });
  if (a.sesi > a.sesiPrev && a.sesiPrev) wins.push({ w: 45, judul: 'Lebih rajin', angka: '+' + (a.sesi - a.sesiPrev), kalimat: 'Sesi lebih banyak dari periode sebelumnya.' });
  if (a.streak >= 2) wins.push({ w: 30 + a.streak, judul: 'Streak', angka: a.streak + ' mgg', kalimat: 'Minggu berturut-turut tetap berlatih.' });
  if (moved(wa) && wa.ubah < 0) wins.push({ w: 55, judul: 'Lingkar pinggang', angka: _rpSigned_(wa.ubah, 'cm'), kalimat: 'Pinggang makin ramping.' });
  if (moved(bw) && ((goal === 'turun' && bw.ubah < 0) || (goal === 'naik' && bw.ubah > 0))) wins.push({ w: 55, judul: 'Berat badan', angka: _rpSigned_(bw.ubah, 'kg'), kalimat: 'Bergerak ke arah tujuan.' });
  (a.tes || []).filter(function(t) { return t.membaik; }).slice(0, 1).forEach(function(t) { wins.push({ w: 42, judul: t.label, angka: _rpSigned_(t.ubah), kalimat: 'Hasil tes kebugaran membaik.' }); });
  if (a.vNow.v > a.vPrev.v && a.vPrev.v) wins.push({ w: 35, judul: 'Volume latihan', angka: '+' + Math.round((a.vNow.v - a.vPrev.v) / a.vPrev.v * 100) + '%', kalimat: 'Total beban yang diangkat bertambah.' });
  const menang = wins.sort(function(x, y) { return y.w - x.w; }).slice(0, REPORT.maxWins).map(function(w) { return { judul: w.judul, angka: w.angka, kalimat: w.kalimat }; });

  // ── Fokus (paling banyak dua): catatan coach dulu, lalu pilar terlemah
  const fokus = [];
  const lastFokus = (a.notes || []).find(function(n) { return n.fokus; });
  if (lastFokus) fokus.push({ judul: 'Dari coach', kalimat: lastFokus.fokus });
  const saran = { konsistensi: 'Jadwalkan minimal ' + REPORT.sesiTarget + ' sesi tiap minggu, di hari yang sama supaya jadi kebiasaan.',
    kekuatan: 'Tambah beban sedikit (2,5 kg) saat semua set terasa ringan, bersama coach.',
    tubuh: 'Ukur berat dan pinggang tiap dua minggu, di pagi hari sebelum makan.',
    makan: 'Catat makan minimal empat hari per minggu, dan tambahkan lauk berprotein di tiap makan.' };
  nilai.slice().sort(function(x, y) { return x.skor - y.skor; }).forEach(function(p) { if (fokus.length < REPORT.maxFokus && p.skor < REPORT.baik) fokus.push({ judul: p.label, kalimat: saran[p.key] }); });
  if (!a.body.length && fokus.length < REPORT.maxFokus) fokus.push({ judul: 'Ukur tubuh', kalimat: saran.tubuh });
  if (!fokus.length) fokus.push({ judul: 'Lanjutkan', kalimat: 'Pertahankan ritme ini dan lanjutkan program bersama coach.' });

  // ── Detail per bagian
  const volWeeks = a.weekList.map(function(w) { return { minggu: w.minggu, v: 0, cuti: w.cuti }; }), vwIdx = {};
  volWeeks.forEach(function(w) { vwIdx[w.minggu] = w; });
  const grp = function(days) {
    const o = {};
    days.forEach(function(d) {
      const wk = vwIdx[_weekStart_(d.tanggal)];
      d.items.forEach(function(it) {
        let v = 0; it.sets.forEach(function(s) { if (!_isWarmup_(s.jenis)) v += (Number(s.berat) || 0) * (Number(s.rep) || 0); });
        const gk = RP_PART_GROUP_[it.bodyPart] || 'lain'; o[gk] = (o[gk] || 0) + v; if (wk && days === a.days) wk.v += v;
      });
    });
    return o;
  };
  const pNow = grp(a.days), pPrev = grp(a.daysPrev);
  // Otot yang dilatih (untuk figur tubuh di PDF): gerakan unik dengan volume, terbanyak dulu
  const exMap = {};
  a.days.forEach(function(d) { d.items.forEach(function(it) {
    let v = 0; it.sets.forEach(function(s) { if (!_isWarmup_(s.jenis)) v += (Number(s.berat) || 0) * (Number(s.rep) || 0); });
    const k = it.exId || it.target || it.bodyPart || it.key, e = exMap[k] || (exMap[k] = { exId: it.exId || '', target: it.target || '', bodyPart: it.bodyPart || '', v: 0 });
    e.v += v || 1;
  }); });
  const figur = Object.keys(exMap).map(function(k) { return exMap[k]; }).sort(function(x, y) { return y.v - x.v; }).slice(0, 16).map(function(e) { return { exId: e.exId, target: e.target, bodyPart: e.bodyPart, v: Math.round(e.v) }; });
  volWeeks.forEach(function(w) { w.v = Math.round(w.v); });
  const prevWeeks = Math.max(1, Math.round(R.days / 7)), rataPrev = a.vPrev.v ? Math.round(a.vPrev.v / prevWeeks) : 0;
  const otot = Object.keys(RP_GROUP_LABEL_).filter(function(k) { return pNow[k] || pPrev[k]; })
    .map(function(k) { return { key: k, label: RP_GROUP_LABEL_[k], v: Math.round(pNow[k] || 0), prev: Math.round(pPrev[k] || 0) }; }).sort(function(x, y) { return y.v - x.v; });
  const atas = (pNow.dorong || 0) + (pNow.tarik || 0) + (pNow.lengan || 0), bawah = pNow.kaki || 0;
  let seimbang = '';
  if (pNow.dorong && pNow.tarik) { const r = pNow.dorong / pNow.tarik; seimbang = r > 1.5 ? 'Latihan dorong (dada & bahu) jauh lebih banyak dari tarik (punggung); punggung perlu ditambah supaya postur tetap baik.' : r < 0.67 ? 'Latihan tarik lebih banyak dari dorong; dada dan bahu bisa ditambah sedikit.' : 'Dorong dan tarik sudah seimbang.'; }
  if (atas && bawah) { const r2 = atas / bawah; seimbang += (seimbang ? ' ' : '') + (r2 > 2 ? 'Tubuh bagian atas jauh lebih sering dilatih dari kaki.' : r2 < 0.5 ? 'Kaki lebih banyak dilatih dari tubuh bagian atas.' : 'Atas dan bawah cukup seimbang.'); }

  const weeksSpan = Math.max(1, R.days / 7);
  const laju = a.body.filter(function(b) { return b.awalTgl !== b.akhirTgl; }).map(function(b) {
    const wk = Math.max(1, _daysBetweenIso_(b.awalTgl, b.akhirTgl) / 7);
    return { key: b.key, label: b.label, unit: b.unit, perMinggu: _rpR1_(b.ubah / wk) };
  });
  const lajuBerat = laju.find(function(l) { return l.key === 'berat'; });

  const detail = {
    kehadiran: { perMinggu: perMinggu, jedaTerpanjang: jeda, hariAktif: actDays.length,
      tafsir: 'Artinya: ' + (kons == null ? 'belum ada minggu aktif di periode ini.' : kons >= REPORT.baik ? 'ritme latihan sudah stabil. Inilah dasar semua kemajuan lain.' : 'hasil paling cepat datang dari ritme yang tetap; ' + REPORT.sesiTarget + ' sesi per minggu sudah cukup.') + (jeda >= 10 ? ' Jeda terpanjang ' + jeda + ' hari.' : '') },
    kekuatan: { tafsir: 'Artinya: ' + (!pcts.length ? 'gerakan perlu dicatat minimal dua kali supaya perubahannya terlihat.' : naik >= Math.ceil(pcts.length / 2) ? 'otot merespons latihan dengan baik; beban bisa terus dinaikkan pelan-pelan.' : 'kekuatan cenderung datar; ini wajar sesekali, dan coach bisa mengubah variasi atau beban.') +
      ' "Perkiraan angkatan maksimal" (1RM) = beban terberat yang diperkirakan bisa diangkat satu kali, dihitung dari set yang dicatat.' },
    volume: { figur: figur, mingguan: volWeeks, rataPrev: rataPrev, otot: otot,
      tafsir: 'Artinya: volume = beban \u00d7 repetisi dari semua set. ' + (a.vPrev.v ? (a.vNow.v >= a.vPrev.v ? 'Total kerja otot naik dari periode sebelumnya.' : 'Total kerja otot lebih sedikit dari periode sebelumnya.') + ' ' : '') + seimbang },
    tubuh: { laju: laju, goal: goal,
      tafsir: 'Artinya: ' + (!a.body.length ? 'belum ada ukuran di periode ini.' : (lajuBerat ? 'berat berubah ' + _rpSigned_(lajuBerat.perMinggu, 'kg') + ' per minggu' + (goal === 'turun' ? (lajuBerat.perMinggu < 0 && lajuBerat.perMinggu >= -1 ? ', laju yang sehat (0,25\u20131 kg per minggu).' : lajuBerat.perMinggu < -1 ? ', agak cepat; pastikan makan dan protein cukup.' : '; dengan tujuan turun, coach akan membantu menyesuaikan makan.') : '.') + ' ' : '') + 'Berat harian naik-turun karena air dan makanan; lihat arahnya, bukan angka satu hari.') },
    makan: makanD,
    glosarium: [['Sesi', 'latihan bersama coach yang sudah selesai.'], ['Volume', 'beban \u00d7 repetisi dari semua set kerja (pemanasan tidak dihitung).'], ['1RM', 'perkiraan beban terberat untuk satu repetisi.'], ['Streak', 'minggu berturut-turut tetap berlatih; minggu cuti tidak memutusnya.']]
  };
  return { skor: { total: total, status: _rpStatus_(total), vonis: vonis, pilar: pil }, menang: menang, fokus: fokus.slice(0, REPORT.maxFokus), detail: detail };
}

/** Kumpulkan data satu klien lalu hitung laporan (sekali baca per sheet). */
function _reportFor_(row, req) {
  const id = String(row[0]).trim(), today = _todayWib_(), range = _reportRange_(req, today);
  return _withSchedulesMemo_(function() {
    const all = _getSchedulesAll_().filter(function(s) { return String(s.memberId).trim() === id; });
    const sessions = all.map(function(s) { return { id: String(s.id), tanggal: _wibDate_(s.start), done: String(s.status || '').toLowerCase() === 'completed' }; });
    const wrows = _workoutRowsOf_(id);
    const prsAll = _workoutEvents_(wrows).prs.map(function(p) { return { tanggal: p.tanggal, gerakan: p.gerakan }; });
    let food = null, target = null;
    try {
      if (_nutEnabled_()) {
        const c = _nutComputeFor_(row);
        if (c.profile.aktif) {
          food = _foodLogRows_(id).map(function(f) { return { tanggal: f.tanggal, kal: f.kal, p: f.p }; });
          target = c.target && c.target.ok ? { kal: c.target.kal, protein: c.target.protein } : null;
        }
      }
    } catch (e) { food = null; }
    let goal = '', jk = '';
    try { const np = _nutProfileFrom_(row); goal = np.goal; jk = np.jk; } catch (e) {}
    let holds = [];
    try { holds = _holdRows_().filter(function(h) { return h.memberId === id && h.status === 'ok'; }).map(function(h) { return { jenis: h.jenis, mulai: h.mulai, sampai: h.sampai }; }); } catch (e) {}
    const info = _streakInfo_(id);
    return _reportCalc_({
      name: String(row[1] || '').trim(), coach: String(row[11] || '').trim(), today: today, range: range, sessions: sessions, holds: holds, workoutRows: wrows, prsAll: prsAll,
      progress: _readProgress_(id), measures: PROGRESS_MEASURES, food: food, target: target, tests: _fitnessByMember_(id), testDefs: FITNESS_TESTS,
      goal: goal, jk: jk, notes: _sharedNotesFor_(id), streak: info.streak, bestStreak: info.bestStreak
    });
  });
}

/** Klien: data laporan PDF miliknya sendiri (dibuat saat tombol ditekan; baca saja). Klien dari token. */
function getMyReport(memberToken, req) {
  return _plainJson_(_reportFor_(requireMember_(memberToken).row, req));
}

/** Admin: data laporan PDF untuk satu klien (nada klien, karena laporan ini untuk klien; baca saja). */
function getMemberReport(token, memberId, req) {
  requireAdmin_(token);
  return _plainJson_(_reportFor_(_memberRowOrThrow_(memberId).row, req));
}
