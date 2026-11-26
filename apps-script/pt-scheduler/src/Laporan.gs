// =============================================================================
// Laporan.gs — Fase AD4 (T-2440): data laporan PDF yang dibuat HANYA saat klien atau coach menekan tombol.
// Server menghitung angka dan kalimat tafsir (nada klien, tanpa RPE, catatan privat, catatan cuti, nomor HP, atau foto);
// browser menggambar halaman A4 dan menyusun PDF di perangkat (parts/app/23-laporan.part). Tidak ada yang disimpan
// atau diunggah. docs/coachkit/Design.md §AD4.
// =============================================================================

const REPORT = { maxDays: 400, defaultDays: 28, notesMax: 6, liftsMax: 3, weightPts: 40 };

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
function _rpSigned_(n, unit) { const v = _rpR1_(n); return (v > 0 ? '+' : v < 0 ? '−' : '±') + String(Math.abs(v)).replace('.', ',') + (unit ? ' ' + unit : ''); }

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
  const lifts = stats.exercises.filter(function(e) { return e.points.length >= 1 && e.points.some(function(p) { return p.e1rm > 0; }); }).slice(0, REPORT.liftsMax).map(function(e) {
    const pts = e.points.filter(function(p) { return p.e1rm > 0; }), a = pts[0], b = pts[pts.length - 1];
    return { gerakan: e.gerakan, key: e.key, awal: a.e1rm, akhir: b.e1rm, ubah: _rpR1_(b.e1rm - a.e1rm), pct: a.e1rm ? Math.round((b.e1rm - a.e1rm) / a.e1rm * 100) : 0, titik: pts.map(function(p) { return { tanggal: p.tanggal, v: p.e1rm }; }) };
  });
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
  if (holds.length) ringkas.push('Ada masa ' + holds.map(function(h) { return (h.jenis === 'sakit' ? 'sakit' : h.jenis === 'berhenti' ? 'nonaktif' : 'cuti') + ' ' + _holdDay_(h.mulai) + (h.sampai !== h.mulai ? '–' + _holdDay_(h.sampai) : ''); }).join(', ') + '; streak tidak putus karenanya.');
  if (!ringkas.length) ringkas.push('Belum ada catatan di periode ini. Laporan berikutnya akan terisi setelah sesi dan catatan pertama.');
  const lastFokus = notes.find(function(n) { return n.fokus; });
  if (lastFokus) lanjut.push('Fokus dari coach: ' + lastFokus.fokus);
  if (activeWeeks.length >= 2 && weeksWithSession / activeWeeks.length < 0.75) lanjut.push('Jaga ritme: usahakan minimal satu sesi setiap minggu.');
  if (lifts.length && !lifts.some(function(l) { return l.ubah > 0; })) lanjut.push('Saatnya menambah beban sedikit di gerakan utama, bersama coach.');
  if (makan && makan.hari < R.days * 0.5) lanjut.push('Catat makan minimal empat hari per minggu supaya target bisa disesuaikan.');
  if (makan && makan.proteinCukup !== null && makan.hari && makan.proteinCukup < makan.hari * 0.6) lanjut.push('Protein masih sering di bawah target; tambahkan lauk berprotein di tiap makan.');
  if (!body.length) lanjut.push('Catat berat dan lingkar pinggang minimal dua minggu sekali.');
  if (!lanjut.length) lanjut.push('Pertahankan ritme ini dan lanjutkan program bersama coach.');

  return {
    name: src.name, coach: src.coach, periode: { from: R.from, to: R.to, days: R.days, prevFrom: R.prevFrom, prevTo: R.prevTo }, dibuat: src.today,
    headline: headline, kehadiran: { sesi: sesi, sesiPrev: sesiPrev, minggu: weekList, streak: src.streak || 0, bestStreak: src.bestStreak || 0, calendar: calendar }, cuti: holds,
    latihan: { hari: g.days.length, set: vNow.sets, volume: vNow.v, volumePrev: vPrev.v, angkatan: lifts, rekor: prs.map(function(p) { return { tanggal: p.tanggal, gerakan: p.gerakan }; }).slice(0, 8), otot: parts, mingguan: stats.weeks },
    tubuh: { ukuran: body, berat: berat }, makan: makan, tes: tes, catatan: notes, teks: { ringkas: ringkas, lanjut: lanjut }
  };
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
    let holds = [];
    try { holds = _holdRows_().filter(function(h) { return h.memberId === id && h.status === 'ok'; }).map(function(h) { return { jenis: h.jenis, mulai: h.mulai, sampai: h.sampai }; }); } catch (e) {}
    const info = _streakInfo_(id);
    return _reportCalc_({
      name: String(row[1] || '').trim(), coach: String(row[11] || '').trim(), today: today, range: range, sessions: sessions, holds: holds, workoutRows: wrows, prsAll: prsAll,
      progress: _readProgress_(id), measures: PROGRESS_MEASURES, food: food, target: target, tests: _fitnessByMember_(id), testDefs: FITNESS_TESTS,
      notes: _sharedNotesFor_(id), streak: info.streak, bestStreak: info.bestStreak
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
