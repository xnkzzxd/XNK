/**
 * Fase AG (T-2700+): poster coach. Gambar dibuat di browser (kanvas, parts/app/27-poster.part) dan tidak pernah diunggah.
 * Server hanya memberi angka dan teks publik milik coach itu sendiri: profil, paket, jam kosong, testimoni yang diizinkan,
 * hasil coaching (jumlah saja) dan kisah klien yang sudah memberi izin (nama depan dan angka saja).
 * Tidak pernah: nomor klien, catatan, RPE, data kesehatan, catatan cuti, foto progres (aturan 7b).
 */

// Produksi (xnk.my.id): poster "XNK Coach" milik pemilik, menjual XNK ke coach lain. Harga = xnk-library/tools/hub-harga.js (tests/poster.test.js). Library: baris ini diganti null (build-lib TEXT_SWAPS).
const POSTER_XNK = { title: 'XNK Coach', url: 'https://xnk.web.id', tiers: [{ key: 'starter', name: 'Starter', bulanan: 149000, limit: '1 coach · sampai 15 klien aktif', fit: 'Untuk PT yang baru mulai merapikan klien.' }, { key: 'pro', name: 'Pro', bulanan: 249000, limit: '1 coach · klien tanpa batas', fit: 'Untuk PT full-time yang ingin klien bertahan lama.', popular: true }, { key: 'studio', name: 'Studio', bulanan: 549000, limit: 'Sampai 5 coach · klien tanpa batas', fit: 'Untuk tim kecil atau studio privat.' }] };

const POSTER_PERIODS = ['bulan', 'bulanLalu', '3bulan', 'semua'];
const POSTER_LIMITS = { testimonials: 20, text: 280, slotsDays: 7 };

/** Nyala bawaan (pilihan pemilik, seperti kartu bagikan); POSTER_ENABLED=false mematikannya. */
function _posterEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('POSTER_ENABLED') !== 'false';
}

/** Alamat QR poster: halaman info coach di hub (SITE_URL/info/), kalau tidak ada alamat QR kartu bagikan. */
function _posterQrUrl_() {
  const site = String(PropertiesService.getScriptProperties().getProperty('SITE_URL') || '').trim();
  return site ? site.replace(/\/+$/, '') + '/info/' : _shareQrUrl_();
}

/** Murni: rentang tanggal WIB untuk periode hasil coaching. */
function _posterRange_(period, today) {
  const p = POSTER_PERIODS.indexOf(period) !== -1 ? period : 'bulan';
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const pad = function(n) { return ('0' + n).slice(-2); };
  if (p === 'bulan') return { period: p, from: today.slice(0, 8) + '01', to: today };
  if (p === 'bulanLalu') {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { period: p, from: py + '-' + pad(pm) + '-01', to: py + '-' + pad(pm) + '-' + pad(last) };
  }
  if (p === '3bulan') return { period: p, from: _addDaysIso_(today, -89), to: today };
  return { period: p, from: '', to: today };
}

/** Coach poster: coach yang login, kalau pemilik coach yang dipilih atau "Ini saya". */
function _posterCoach_(want) {
  const scope = _scopeCoach_();
  const all = _coachesAll_();
  if (scope) return all.filter(function(c) { return c.id === scope; })[0] || null;
  const active = _activeCoaches_();
  if (want) { const c = active.filter(function(x) { return x.id === String(want); })[0]; if (c) return c; }
  return _selfCoach_();
}

/**
 * Murni: hasil coaching dalam satu rentang, hanya jumlah. inp = { range, members:[id], schedules, ratings, workout:{id: rows},
 * progress:{id: entries} }. Turun berat / pinggang = perubahan dari ukuran terakhir sebelum (atau pertama di dalam) rentang
 * ke ukuran terakhir di dalam rentang, hanya yang turun dijumlahkan.
 */
function _posterResults_(inp) {
  const r = inp.range, ids = {};
  (inp.members || []).forEach(function(id) { ids[String(id)] = true; });
  const inR = function(d) { return !!d && (!r.from || d >= r.from) && d <= r.to; };
  const clients = {};
  let sessions = 0;
  (inp.schedules || []).forEach(function(s) {
    if (String(s.status || '').toLowerCase() !== 'completed' || !ids[String(s.memberId)]) return;
    const d = _wibDate_(s.completedAt || s.start);
    if (!inR(d)) return;
    sessions++; clients[String(s.memberId)] = true;
  });
  let starSum = 0, starN = 0;
  (inp.ratings || []).forEach(function(x) { if (ids[x.memberId] && x.bintang > 0 && inR(x.tanggal)) { starSum += x.bintang; starN++; } });
  let prs = 0;
  const prClients = {};
  Object.keys(inp.workout || {}).forEach(function(id) {
    if (!ids[id]) return;
    _workoutEvents_(inp.workout[id]).prs.forEach(function(p) { if (inR(p.tanggal)) { prs++; prClients[id] = true; } });
  });
  const down = { berat: 0, pinggang: 0 }, downN = { berat: 0, pinggang: 0 };
  Object.keys(inp.progress || {}).forEach(function(id) {
    if (!ids[id]) return;
    ['berat', 'pinggang'].forEach(function(k) {
      const pts = inp.progress[id].filter(function(e) { return e[k] !== '' && e[k] != null && e.tanggal <= r.to; });
      const inside = pts.filter(function(e) { return inR(e.tanggal); });
      if (!inside.length) return;
      const before = r.from ? pts.filter(function(e) { return e.tanggal < r.from; }) : [];
      const start = before.length ? before[before.length - 1] : inside[0];
      const ch = Number(inside[inside.length - 1][k]) - Number(start[k]);
      if (ch < 0) { down[k] += -ch; downN[k]++; }
    });
  });
  const round1 = function(v) { return Math.round(v * 10) / 10; };
  return {
    period: r.period, from: r.from, to: r.to,
    sessions: sessions, clients: Object.keys(clients).length, totalClients: (inp.members || []).length,
    rating: starN ? round1(starSum / starN) : null, ratings: starN,
    prs: prs, prClients: Object.keys(prClients).length,
    kgDown: round1(down.berat), kgClients: downN.berat, cmDown: round1(down.pinggang), cmClients: downN.pinggang
  };
}

/** Murni: kisah satu klien. Nama depan dan angka saja. */
function _posterStory_(inp) {
  const first = String(inp.name || '').trim().split(/\s+/)[0] || '';
  const entries = inp.entries || [];
  const ch = function(k) { const c = _measureChange_(entries, k); return c && c.count >= 2 ? { from: c.first.nilai, to: c.last.nilai, change: c.change, fromDate: c.first.tanggal, toDate: c.last.tanggal } : null; };
  const ev = _workoutEvents_(inp.workout || []);
  let lift = null;
  const byKey = {};
  ev.prs.forEach(function(p) { const b = byKey[p.key] || (byKey[p.key] = { gerakan: p.gerakan, from: p.prev, to: p.e1rm }); b.to = Math.max(b.to, p.e1rm); b.from = Math.min(b.from, p.prev); });
  Object.keys(byKey).forEach(function(k) { const b = byKey[k]; if (!lift || b.to - b.from > lift.to - lift.from) lift = b; });
  if (lift) lift = { gerakan: lift.gerakan, from: Math.round(lift.from), to: Math.round(lift.to) };
  const dates = (inp.doneDates || []).slice().sort();
  const since = [dates[0], entries.length ? entries[0].tanggal : ''].filter(Boolean).sort()[0] || '';
  const weeks = since ? Math.max(1, Math.round((Date.parse(inp.today + 'T00:00:00Z') - Date.parse(since + 'T00:00:00Z')) / (7 * 86400000))) : 0;
  return { first: first, since: since, weeks: weeks, sessions: dates.length, prs: ev.prs.length, berat: ch('berat'), pinggang: ch('pinggang'), lift: lift };
}

/** Klien coach ini (multi-coach: kolom coach = coach ini; satu coach: semua klien). */
function _posterMemberRows_(coach) {
  const rows = _memberValues_().data.slice(1).filter(function(r) { return String(r[0] || '').trim(); });
  const multi = _activeCoaches_().length >= 2 || !!_scopeCoach_();
  return multi && coach ? rows.filter(function(r) { return String(r[10] || '').trim() === coach.id; }) : rows;
}

/** Progress semua klien, satu kali baca: { memberId: entries[] } (urut tanggal). */
function _posterProgressAll_(ids) {
  const out = {};
  _sheetRowsMemo_('Progress').forEach(function(r) {
    const id = String(r[1] || '').trim();
    if (!r[0] || !ids[id]) return;
    const e = { tanggal: _isoDateCell_(r[2]) };
    PROGRESS_MEASURES.forEach(function(m) { const v = r[m.col - 1]; e[m.key] = (v === '' || v == null) ? '' : Number(v); });
    (out[id] = out[id] || []).push(e);
  });
  Object.keys(out).forEach(function(id) { out[id].sort(function(a, b) { return a.tanggal < b.tanggal ? -1 : (a.tanggal > b.tanggal ? 1 : 0); }); });
  return out;
}

/** Testimoni yang diizinkan klien (rating sesi + evaluasi paket di aplikasi; untuk pemilik satu coach juga form lama). */
function _posterTestimonials_(ids, nameOf, withForm) {
  const out = [];
  const cut = function(t) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > POSTER_LIMITS.text ? t.slice(0, POSTER_LIMITS.text - 1).trim() + '…' : t; };
  _readSheetRows_('SessionRatings', _ratingFromRow_, null).forEach(function(x) {
    if (x.izin && ids[x.memberId] && String(x.komentar).trim()) out.push({ name: _maskNamaTestimoni_(nameOf[x.memberId]), stars: x.bintang || 5, text: cut(x.komentar), date: x.tanggal, src: 'sesi' });
  });
  _readSheetRows_('PackageEvaluations', _evalFromRow_, null).forEach(function(x) {
    if (!x.izin || !ids[x.memberId] || !String(x.komentar).trim()) return;
    const vals = EVAL_ASPECTS.map(function(a) { return Number(x[a[0]]) || 0; }).filter(function(v) { return v > 0; });
    out.push({ name: _maskNamaTestimoni_(nameOf[x.memberId]), stars: vals.length ? Math.round(vals.reduce(function(a, b) { return a + b; }, 0) / vals.length) : 5, text: cut(x.komentar), date: x.tanggal, src: 'paket' });
  });
  if (withForm) {
    getPublicTestimonialsImpl_().forEach(function(t) { out.push({ name: String(t.name || ''), stars: Number(t.rating) || 5, text: cut(t.text), date: '', src: 'form' }); });
  }
  out.sort(function(a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  return out.filter(function(t) { return t.text; }).slice(0, POSTER_LIMITS.testimonials);
}

/** Admin: semua data poster dalam satu panggilan. opts = { coachId?, period?, avatar? }. */
function getPosterData(token, opts) {
  requireAdmin_(token);
  if (!_posterEnabled_()) throw new Error('Poster sedang dimatikan.');
  opts = opts || {};
  return _withMemberMemo_(function() { return _withSchedulesMemo_(function() { return _posterData_(opts); }); });
}

function _posterData_(opts) {
  const coach = _posterCoach_(opts.coachId);
  const today = _todayWib_();
  const rows = _posterMemberRows_(coach);
  const ids = {}, nameOf = {};
  rows.forEach(function(r) { const id = String(r[0]).trim(); ids[id] = true; nameOf[id] = String(r[1] || ''); });
  const active = _activeCoaches_();
  const multi = active.length >= 2;
  const owner = !_scopeCoach_();

  const pl = getPriceListPublicImpl_();
  const packages = pl.packages.filter(function(p) { return p.aktif !== false; }).map(function(p) {
    return { id: p.id, nama: p.namaPaket, kategori: p.kategori, harga: p.harga, sesi: p.jumlahSesi, durasi: p.durasi || '', benefit: (p.benefit || []).slice(0, 4), tipe: p.tipe || '' };
  });

  const slotDays = _openSlotsCached_({ days: POSTER_LIMITS.slotsDays, coachId: multi && coach ? coach.id : '' }, new Date());
  const slots = slotDays.map(function(d) {
    return { date: d.date, dow: d.dow, closed: d.closed, hours: d.hours.filter(function(h) { return h.free > 0 && !h.past && !h.off; }).map(function(h) { return h.hour; }) };
  });

  const results = _posterResultsFor_(coach, rows, ids, opts.period, today);
  const stories = rows.filter(function(r) { return _pfFrom_(r).poster; }).map(function(r) { return { id: String(r[0]).trim(), first: String(r[1] || '').trim().split(/\s+/)[0] }; });

  return {
    today: today,
    coach: coach ? {
      id: coach.id, name: coach.name, headline: coach.headline, specialty: coach.specialty, bio: coach.bio, experience: coach.experience,
      certifications: coach.certifications || [], achievements: coach.achievements || [], location: coach.location, instagram: coach.instagram, wa: coach.phone
    } : null,
    avatar: coach && opts.avatar !== false ? _shareAvatar_(coach.photo, coach.photoFileId) : '',
    coaches: owner && multi ? active.map(function(c) { return { id: c.id, name: c.name }; }) : [],
    packages: packages,
    slots: slots,
    testimonials: _posterTestimonials_(ids, nameOf, owner && !multi),
    results: results,
    stories: stories,
    qrUrl: _posterQrUrl_(),
    xnkCoach: owner && POSTER_XNK ? POSTER_XNK : null
  };
}

function _posterResultsFor_(coach, rows, ids, period, today) {
  const workout = {};
  _sheetRowsMemo_('WorkoutLog').forEach(function(r) { const id = String(r[1] || '').trim(); if (r[0] && ids[id]) (workout[id] = workout[id] || []).push(_exResolveRow_(r)); });
  return _posterResults_({
    range: _posterRange_(period, today), members: Object.keys(ids),
    schedules: _getSchedulesAll_(), ratings: _readSheetRows_('SessionRatings', _ratingFromRow_, null),
    workout: workout, progress: _posterProgressAll_(ids)
  });
}

/** Admin: hasil coaching untuk periode lain (tanpa memuat ulang semuanya). */
function getPosterResults(token, period, coachId) {
  requireAdmin_(token);
  if (!_posterEnabled_()) throw new Error('Poster sedang dimatikan.');
  return _withMemberMemo_(function() {
    return _withSchedulesMemo_(function() {
      const coach = _posterCoach_(coachId), rows = _posterMemberRows_(coach), ids = {};
      rows.forEach(function(r) { ids[String(r[0]).trim()] = true; });
      return _posterResultsFor_(coach, rows, ids, period, _todayWib_());
    });
  });
}

/** Admin: angka kisah satu klien, hanya bila klien mengizinkan (portal → Saya). */
function getPosterStory(token, memberId) {
  requireAdmin_(token);
  if (!_posterEnabled_()) throw new Error('Poster sedang dimatikan.');
  const row = _memberRowOrThrow_(memberId).row;
  if (!_pfFrom_(row).poster) throw new Error('Klien belum mengizinkan poster.');
  const id = String(row[0]).trim();
  const done = _getSchedulesAll_().filter(function(s) { return String(s.memberId).trim() === id && String(s.status || '').toLowerCase() === 'completed'; });
  return _posterStory_({
    name: row[1], today: _todayWib_(), entries: _readProgress_(id), workout: _workoutRowsOf_(id),
    doneDates: done.map(function(s) { return _wibDate_(s.completedAt || s.start); }).filter(Boolean)
  });
}
