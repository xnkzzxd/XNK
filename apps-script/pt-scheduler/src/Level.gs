// Fase X (T-1902): level, momen, cerita perjalanan, lonceng, dan "Tugas hari ini" untuk portal klien.
// Semua fungsi di berkas ini MURNI (tanpa SpreadsheetApp / Properties): masukannya angka dan objek dari
// part getPortalMore yang sudah dihitung. Penghubung ke sheet ada di Profil.gs (_portalXFor_).

// Poin tiap aktivitas dan tangga level. Poin dihitung dari jumlah sepanjang waktu, jadi level tidak turun.
const LEVEL = {
  poin: { sesi: 10, latihan: 4, makan: 1, ukur: 2, minggu: 5 },
  label: { sesi: 'Sesi dengan coach', latihan: 'Latihan tercatat', makan: 'Hari makan tercatat', ukur: 'Catatan ukuran', minggu: 'Minggu beruntun terbaik' },
  tangga: [0, 60, 180, 400, 800, 1300, 2000, 2900, 4000, 5500],
  gelar: ['Pemula', 'Mulai Rutin', 'Rajin', 'Konsisten', 'Tangguh', 'Disiplin', 'Kuat', 'Andal', 'Elite', 'Legenda']
};
const NOTIF_FRESH_DAYS = 14;      // info dan momen lebih tua dari ini tidak masuk lonceng
const NOTIF_WEIGH_DAYS = 7;       // "waktunya timbang" setelah sekian hari tanpa catatan berat
const TODO_RENEW_AT = 2;          // tawarkan perpanjang saat sisa sesi ≤ ini
const TODO_TASKS_MAX = 3;         // PR coach yang tampil di daftar tugas

/** Murni: jumlah aktivitas → { poin, level, gelar, dari, sampai, sisa, pct, rinci[], next }. */
function _levelCalc_(counts) {
  counts = counts || {};
  const rinci = Object.keys(LEVEL.poin).map(function(k) {
    const n = Math.max(0, Math.floor(Number(counts[k]) || 0));
    return { k: k, label: LEVEL.label[k], n: n, poin: n * LEVEL.poin[k] };
  });
  const poin = rinci.reduce(function(s, r) { return s + r.poin; }, 0);
  let i = 0;
  while (i + 1 < LEVEL.tangga.length && poin >= LEVEL.tangga[i + 1]) i++;
  const dari = LEVEL.tangga[i], max = i + 1 >= LEVEL.tangga.length, sampai = max ? null : LEVEL.tangga[i + 1];
  return {
    poin: poin, level: i + 1, gelar: LEVEL.gelar[i], dari: dari, sampai: sampai,
    sisa: max ? 0 : sampai - poin,
    pct: max ? 100 : Math.round((poin - dari) / (sampai - dari) * 100),
    rinci: rinci,
    next: max ? null : { level: i + 2, gelar: LEVEL.gelar[i + 1] }
  };
}

const _lvNum_ = function(n, dp) { const f = Math.pow(10, dp || 0); return String(Math.round(Number(n) * f) / f).replace('.', ','); };
const _lvThou_ = function(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
const _lvDays_ = function(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); };

/**
 * Murni: momen penting, terbaru dulu.
 * ctx: { prs:[{tanggal, gerakan, berat, rep}], sessionDates:[iso naik], badges:[{need, kind}], weight:{first,last,change}, waist:{…} }
 * Hasil: [{ id, tanggal, kind:'pr'|'sesi'|'ukur', title }], maksimal `max` (bawaan 12).
 */
function _momentsCalc_(ctx, max) {
  ctx = ctx || {};
  const out = [];
  (ctx.prs || []).forEach(function(p) {
    if (!p || !p.tanggal) return;
    const kg = Number(p.berat) > 0 ? ' ' + _lvNum_(p.berat, 1) + ' kg' : '';
    out.push({ id: 'pr:' + p.tanggal + ':' + p.gerakan, tanggal: p.tanggal, kind: 'pr', title: 'Rekor baru: ' + p.gerakan + kg });
  });
  const dates = (ctx.sessionDates || []).slice().sort();
  BADGE_DEFS.filter(function(b) { return b.kind === 'sesi'; }).concat([{ need: 1, label: 'Sesi pertama' }]).forEach(function(b) {
    if (dates.length >= b.need) out.push({ id: 'sesi:' + b.need, tanggal: dates[b.need - 1], kind: 'sesi', title: b.need === 1 ? 'Sesi pertama' : 'Sesi ke-' + b.need });
  });
  [['weight', 'Berat', 'kg', 1], ['waist', 'Pinggang', 'cm', 1]].forEach(function(m) {
    const c = ctx[m[0]];
    if (!c || !c.last || !c.first || c.first.tanggal === c.last.tanggal || Math.abs(c.change) < m[3]) return;
    out.push({ id: 'ukur:' + m[0], tanggal: c.last.tanggal, kind: 'ukur', title: m[1] + (c.change < 0 ? ' turun ' : ' naik ') + _lvNum_(Math.abs(c.change), 1) + ' ' + m[2] });
  });
  out.sort(function(a, b) { return a.tanggal < b.tanggal ? 1 : (a.tanggal > b.tanggal ? -1 : (a.id < b.id ? -1 : 1)); });
  return out.slice(0, max || 12);
}

/**
 * Murni: cerita perjalanan untuk halaman Progres.
 * ctx: { today, since (iso, tanggal gabung/sesi pertama), weight, waist (bentuk _measureChange_), strength:{gerakan, first, last}, streak, completed }
 * Hasil: { weeks, eyebrow, headline, sub, tiles:[{l,v}] }. Tanpa angka = ajakan mulai mencatat.
 */
function _journeyCalc_(ctx) {
  ctx = ctx || {};
  const weeks = ctx.since && ctx.today && ctx.since <= ctx.today ? Math.max(1, Math.round(_lvDays_(ctx.since, ctx.today) / 7)) : 0;
  const facts = [];
  const w = ctx.weight;
  if (w && w.first && w.last && w.first.tanggal !== w.last.tanggal && Math.abs(w.change) >= 0.5) facts.push((w.change < 0 ? 'Turun ' : 'Naik ') + _lvNum_(Math.abs(w.change), 1) + ' kg');
  const s = ctx.strength;
  if (s && Number(s.last) - Number(s.first) >= 1) facts.push(s.gerakan + ' naik ' + _lvNum_(s.last - s.first, 0) + ' kg');
  const p = ctx.waist;
  if (p && p.first && p.last && p.first.tanggal !== p.last.tanggal && Math.abs(p.change) >= 1) facts.push('Pinggang ' + (p.change < 0 ? 'turun ' : 'naik ') + _lvNum_(Math.abs(p.change), 1) + ' cm');
  if (Number(ctx.streak) >= 2) facts.push(ctx.streak + ' minggu beruntun');
  if (!facts.length && Number(ctx.completed) > 0) facts.push(ctx.completed + ' sesi selesai');
  const tiles = [];
  if (w && w.first && w.last) {
    tiles.push({ l: 'Awal', v: _lvNum_(w.first.nilai, 1) }, { l: 'Sekarang', v: _lvNum_(w.last.nilai, 1) });
    tiles.push({ l: 'Selisih', v: (w.change > 0 ? '+' : (w.change < 0 ? '−' : '')) + _lvNum_(Math.abs(w.change), 1) + ' kg' });
  }
  return {
    weeks: weeks,
    eyebrow: weeks ? weeks + ' minggu bersama XNK' : 'Perjalanan',
    headline: facts[0] || 'Mulai catat hari ini',
    sub: facts.length > 1 ? facts.slice(1, 3).join(' · ') : (facts.length ? '' : 'Timbang berat atau catat latihan pertama untuk melihat perkembangan.'),
    tiles: tiles
  };
}

/**
 * Murni: daftar "Tugas hari ini".
 * ctx: { today, nextRoutine, workedToday, nutrition:{on, ok, eaten, target, missing[]}, tasks:[{id,title,dueDate(iso|''),status,overdue,completedAt}],
 *        hasUpcoming, quotaLeft (null = tak terbatas), total, renewalOpen, pendingRating:{scheduleId,start}, evalEligible, billsRemaining }
 * Hasil: [{ id, kind, title, sub, act, done, danger, ref }] — yang belum selesai dulu, urutan tetap.
 */
function _todoCalc_(ctx) {
  ctx = ctx || {};
  const out = [];
  const add = function(o) { out.push(Object.assign({ sub: '', act: '', done: false, danger: false, ref: '' }, o)); };
  if (ctx.nextRoutine || ctx.workedToday) {
    add({ id: 'latihan', kind: 'latihan', title: ctx.nextRoutine ? 'Latihan: ' + ctx.nextRoutine : 'Latihan hari ini', sub: ctx.workedToday ? 'Sudah dicatat hari ini' : '', act: ctx.workedToday ? '' : 'Mulai', done: !!ctx.workedToday, ref: ctx.nextRoutine || '' });
  }
  const n = ctx.nutrition;
  if (n && n.on) {
    if (!n.ok) add({ id: 'gizi-data', kind: 'gizi', title: 'Lengkapi data makan', sub: 'Supaya target kalori bisa dihitung', act: 'Isi' });
    else {
      const eaten = Math.round(Number(n.eaten) || 0), target = Math.round(Number(n.target) || 0);
      const done = target > 0 && eaten >= target * 0.9;
      const miss = (n.missing || []).slice(0, 2);
      add({ id: 'makan', kind: 'makan', title: 'Makan: ' + _lvThou_(eaten) + ' dari ' + _lvThou_(target) + ' kkal', sub: done ? 'Target hari ini tercapai' : (miss.length ? miss.join(' dan ') + ' belum dicatat' : ''), act: done ? '' : 'Catat', done: done });
    }
  }
  const today = String(ctx.today || '');
  const tasks = ctx.tasks || [];
  tasks.filter(function(t) { return t.status === 'todo'; }).slice(0, TODO_TASKS_MAX).forEach(function(t) {
    const due = t.overdue ? 'Lewat tenggat' : (t.dueDate ? (t.dueDate === today ? 'Tenggat hari ini' : 'Tenggat ' + t.dueDate) : '');
    add({ id: 'pr:' + t.id, kind: 'pr', title: 'PR coach: ' + t.title, sub: due, danger: !!t.overdue, ref: t.id });
  });
  tasks.filter(function(t) { return t.status !== 'todo' && String(t.completedAt || '').slice(0, 10) === today; }).slice(0, 2).forEach(function(t) {
    add({ id: 'pr:' + t.id, kind: 'pr', title: 'PR coach: ' + t.title, done: true, ref: t.id });
  });
  const left = ctx.quotaLeft;
  if (!ctx.hasUpcoming && (left == null || left > 0)) add({ id: 'booking', kind: 'booking', title: 'Booking sesi berikutnya', sub: 'Belum ada jadwal mendatang', act: 'Booking' });
  if (ctx.pendingRating) add({ id: 'nilai', kind: 'nilai', title: 'Nilai sesi terakhir', sub: 'Satu ketukan, 1 sampai 5 bintang', ref: String(ctx.pendingRating.scheduleId || '') });
  if (ctx.evalEligible) add({ id: 'evaluasi', kind: 'evaluasi', title: 'Evaluasi paket', sub: 'Lima pertanyaan singkat' });
  if (Number(ctx.total) > 0 && left != null && left <= TODO_RENEW_AT && !ctx.renewalOpen) {
    add({ id: 'perpanjang', kind: 'perpanjang', title: 'Perpanjang paket', sub: left <= 0 ? 'Sesi habis' : 'Sisa ' + left + ' sesi', danger: true });
  }
  if (Number(ctx.billsRemaining) > 0) add({ id: 'tagihan', kind: 'tagihan', title: 'Tagihan belum lunas', sub: 'Sisa Rp ' + _lvThou_(ctx.billsRemaining), danger: true });
  return out.filter(function(x) { return !x.done; }).concat(out.filter(function(x) { return x.done; }));
}

/**
 * Murni: isi lonceng.
 * ctx: { today, seenAt (ISO terakhir dibuka, '' = belum pernah), content:[{id,judul,tipe,dibuat}], lastWeighDate, nutrition:{on, ok},
 *        healthDone, renewal:{status, decidedAt, createdAt, packageName}, billsRemaining, moments:[…], level:{level, gelar} }
 * Hasil: { items:[{ id, kind:'info'|'data'|'paket'|'capai', title, sub, act, at, fresh }], count } — fresh dulu.
 */
function _notifCalc_(ctx) {
  ctx = ctx || {};
  const today = String(ctx.today || ''), seen = String(ctx.seenAt || '');
  const freshFrom = today ? new Date(new Date(today + 'T00:00:00Z').getTime() - NOTIF_FRESH_DAYS * 86400000).toISOString().slice(0, 10) : '';
  const items = [];
  const dated = function(o) { if (String(o.at).slice(0, 10) < freshFrom) return; o.fresh = String(o.at) > seen; items.push(o); };
  const todo = function(o) { o.at = ''; o.fresh = seen.slice(0, 10) < today; items.push(o); };   // pengingat: dianggap baru sekali sehari
  (ctx.content || []).forEach(function(c) {
    dated({ id: 'info:' + c.id, kind: 'info', title: c.judul, sub: c.tipe === 'pengumuman' ? 'Pengumuman' : (c.tipe === 'video' ? 'Video' : 'Tips'), act: 'Buka', at: String(c.dibuat || '') });
  });
  if (!ctx.lastWeighDate) todo({ id: 'ukur', kind: 'data', title: 'Catat berat pertama', sub: 'Dipakai untuk grafik dan target makan', act: 'Ukur' });
  else if (today && _lvDays_(ctx.lastWeighDate, today) >= NOTIF_WEIGH_DAYS) todo({ id: 'ukur', kind: 'data', title: 'Waktunya timbang', sub: 'Terakhir ' + _lvDays_(ctx.lastWeighDate, today) + ' hari lalu', act: 'Ukur' });
  if (ctx.nutrition && ctx.nutrition.on && !ctx.nutrition.ok) todo({ id: 'gizi-data', kind: 'data', title: 'Lengkapi data makan', sub: 'Supaya target kalori bisa dihitung', act: 'Isi' });
  if (ctx.healthDone === false) todo({ id: 'kesehatan', kind: 'data', title: 'Form kesehatan belum diisi', sub: 'Tujuh pertanyaan ya atau tidak', act: 'Isi' });
  const r = ctx.renewal;
  if (r && r.status === 'menunggu') dated({ id: 'paket:' + r.createdAt, kind: 'paket', title: 'Perpanjangan menunggu konfirmasi', sub: r.packageName || '', act: 'Lihat', at: String(r.createdAt || '') });
  else if (r && (r.status === 'disetujui' || r.status === 'ditolak') && r.decidedAt) dated({ id: 'paket:' + r.decidedAt, kind: 'paket', title: r.status === 'disetujui' ? 'Perpanjangan disetujui' : 'Perpanjangan ditolak', sub: r.packageName || '', act: 'Lihat', at: String(r.decidedAt) });
  if (Number(ctx.billsRemaining) > 0) todo({ id: 'tagihan', kind: 'paket', title: 'Tagihan belum lunas', sub: 'Lihat rincian di Paket saya', act: 'Lihat' });
  (ctx.moments || []).forEach(function(m) { dated({ id: 'capai:' + m.id, kind: 'capai', title: m.title, sub: 'Pencapaian', act: 'Bagikan', at: m.tanggal }); });
  items.sort(function(a, b) { return (a.fresh === b.fresh ? 0 : (a.fresh ? -1 : 1)) || (a.at < b.at ? 1 : (a.at > b.at ? -1 : 0)); });
  return { items: items.slice(0, 30), count: items.filter(function(x) { return x.fresh; }).length };
}
