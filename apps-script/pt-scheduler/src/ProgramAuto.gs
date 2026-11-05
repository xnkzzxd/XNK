// Fase U (T-1606): program otomatis — sambungan generator murni (ProgramGen.gs) ke sheet, fungsi publik, dan job harian.
// Nyala bawaan untuk semua klien (keputusan owner, pengecualian aturan 5 Agent.md): PROGRAM_AUTO_ENABLED=false mematikan
// untuk semua; per klien MemberData AI "Program Otomatis" = tidak. Program buatan coach (Sumber kosong) tidak pernah ditimpa
// kecuali coach menekan "Buat ulang" atau klien menerima tawaran program otomatis.
// Data kesehatan hanya dipakai di server; klien dan Telegram tidak pernah menerima jawaban PAR-Q, hanya "mode ringan".

const PG_JOB_MAX = 40;   // klien per jalan job (batas waktu Apps Script)

function _pgEnabled_() { return PropertiesService.getScriptProperties().getProperty('PROGRAM_AUTO_ENABLED') !== 'false'; }

/** Jawaban form kesehatan terbaru (server saja) → bentuk _pgenSafety_, atau null bila belum diisi. */
function _pgHealthFor_(id) {
  const rows = _sheetRowsMemo_('HealthScreening');
  let r = null;
  for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][1]).trim() === String(id)) { r = rows[i]; break; }
  if (!r) return null;
  return { answers: [r[3], r[4], r[5], r[6], r[7], r[8], r[9]].map(function(x) { return String(x || ''); }), injuries: String(r[10] || ''), medication: String(r[11] || ''), other: String(r[12] || '') };
}

function _pgSafetyFor_(row) {
  const id = String(row[0]).trim();
  const np = _nutProfileFrom_(row);
  const age = _nutAgeOf_(np, _todayWib_());
  return _pgenSafety_(_pgHealthFor_(id), age, np.kondisi);
}

/** Pencari otot untuk gerakan tercatat: katalog (exId / nama) dulu, lalu otot target pustaka. */
function _pgMuscleLookup_(catalog) {
  const byEx = {}, byName = {};
  catalog.forEach(function(x) { if (x.exId) byEx[x.exId] = x; byName[_exNorm_(x.nama)] = x; });
  return function(e) {
    const c = (e.exId && byEx[e.exId]) || byName[_exNorm_(e.gerakan)];
    if (c) return { utama: c.utama, pendukung: c.pendukung };
    return e.target && e.target !== 'cardiovascular system' ? { utama: [e.target], pendukung: [] } : null;
  };
}

/** Hari sejak catatan latihan terakhir. Belum pernah mencatat = 0 (klien baru bukan "kembali setelah absen", aturan 22). */
function _pgAbsenceDays_(days, today) {
  if (!days || !days.length) return 0;
  const last = days[0].tanggal;
  return Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(last + 'T00:00:00Z')) / 86400000);
}

/** Volume tercatat per minggu (Senin) sejak tanggal tertentu. */
function _pgWeeklyRecorded_(days, since, lookup) {
  const weeks = {};
  (days || []).forEach(function(d) {
    if (d.tanggal < since) return;
    const wk = _isoWeekStart_(d.tanggal);
    const v = _pgenRecordedVolume_(d.items, lookup);
    const w = weeks[wk] || (weeks[wk] = {});
    Object.keys(v).forEach(function(m) { w[m] = (w[m] || 0) + v[m]; });
  });
  return Object.keys(weeks).sort().map(function(k) { return weeks[k]; });
}

/** Hitung (tanpa menulis) program otomatis untuk satu baris MemberData. */
function _pgCompute_(row, extraProfile) {
  const id = String(row[0]).trim();
  const profile = Object.assign(_pgProfileFrom_(row), extraProfile || {});
  const catalog = _gymCatalog_();
  const g = _workoutGroup_(_workoutRowsOf_(id));
  const safety = _pgSafetyFor_(row);
  const today = _todayWib_();
  const res = _pgenProgram_({ profile: profile, catalog: catalog, safety: safety, absenceDays: _pgAbsenceDays_(g.days, today) });
  return { profile: profile, catalog: catalog, safety: safety, res: res, group: g, today: today };
}

/** Tulis program otomatis. force = boleh menimpa program coach (coach menekan Buat ulang / klien menerima tawaran). */
function _pgGenerate_(memberId, opts) {
  opts = opts || {};
  const m = _memberRowOrThrow_(memberId);
  const id = String(m.row[0]).trim();
  const cur = _programDays_(id);
  if (!opts.force && cur.days.length && !cur.sumber) return { skipped: 'coach' };
  const c = _pgCompute_(m.row);
  if (!c.res.days.length) return { skipped: 'katalog' };
  _locked_(function() {
    _programWrite_(id, null, c.res.days, { sumber: PGEN_VERSION });
    const v = { blokKe: c.res.block };
    if (opts.newBlock || !c.profile.blokMulai || c.res.block === 1 && c.profile.blokKe !== 1) v.blokMulai = c.today;
    _pgWrite_(m, v);
  });
  if (!/^auto:/.test(cur.sumber || '')) _pgHubEvent_(id, 'baru', { level: c.res.level });
  return { ok: true, res: c.res };
}

// ── Coach hub (T-1607b) ───────────────────────────────────────────────────────
// Peristiwa program otomatis untuk hub coach: Script Property PG_HUB_EVENTS (JSON, maks PG_HUB_MAX, 14 hari).
// Hanya ID klien, jenis, blok, level, tanggal — tanpa data kesehatan. Hub menampilkan nama depan saja.
const PG_HUB_MAX = 30;
const PG_HUB_DAYS = 14;

/** Catat satu peristiwa (baru | blok | naik | ulang). Satu peristiwa terbaru per klien. */
function _pgHubEvent_(id, jenis, extra) {
  try {
    const props = PropertiesService.getScriptProperties();
    let list = [];
    try { list = JSON.parse(props.getProperty('PG_HUB_EVENTS') || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    const today = _todayWib_(), since = _addDaysIso_(today, -PG_HUB_DAYS);
    list = list.filter(function(x) { return x && x.id !== String(id) && x.tanggal >= since; });
    list.unshift(Object.assign({ id: String(id), jenis: jenis, tanggal: today }, extra || {}));
    props.setProperty('PG_HUB_EVENTS', JSON.stringify(list.slice(0, PG_HUB_MAX)));
  } catch (e) { Logger.log('PG_HUB_EVENTS: ' + e); }
}

/** Hub coach: klien program otomatis dalam mode ringan + peristiwa 14 hari (program baru, blok baru, naik level). Nama depan saja. */
function _pgHubList_() {
  if (!_pgEnabled_()) return { light: [], events: [] };
  const prevRead = _readMemo_;
  if (!_readMemo_) _readMemo_ = {};   // HealthScreening sekali untuk semua klien
  try {
    const autoIds = {};
    _programRows_().forEach(function(r) {
      if (r[0] && String(r[1]).trim() && String(r[19] || '') !== PROGRAM_OWN && /^auto:/.test(String(r[21] || ''))) autoIds[String(r[1]).trim()] = true;
    });
    const names = {}, light = [];
    _getMemberDataSheet_().getDataRange().getValues().slice(1).forEach(function(row) {
      if (!row[0]) return;
      const id = String(row[0]).trim();
      names[id] = String(row[1] || '').trim().split(/\s+/)[0];
      if (!autoIds[id] || !_pgProfileFrom_(row).auto) return;
      if (_pgSafetyFor_(row).light) light.push({ memberId: id, name: names[id] });
    });
    let ev = [];
    try { ev = JSON.parse(PropertiesService.getScriptProperties().getProperty('PG_HUB_EVENTS') || '[]'); } catch (e) { ev = []; }
    const since = _addDaysIso_(_todayWib_(), -PG_HUB_DAYS);
    const events = (Array.isArray(ev) ? ev : []).filter(function(x) { return x && names[x.id] !== undefined && x.tanggal >= since; }).slice(0, 10)
      .map(function(x) { return { memberId: x.id, name: names[x.id], jenis: x.jenis, blok: x.blok || 0, level: x.level || '', tanggal: x.tanggal }; });
    return { light: light, events: events };
  } finally { _readMemo_ = prevRead; }
}

/** Bagian `programGen` untuk portal (admin=false) dan panel (admin=true). Tidak pernah membawa jawaban kesehatan ke klien. */
function _programGenFor_(row, admin) {
  const id = String(row[0]).trim();
  const enabled = _pgEnabled_();
  const cur = _programDays_(id);
  const isAuto = /^auto:/.test(cur.sumber || '');
  const c = _pgCompute_(row);
  const p = c.profile;
  const eligible = _pgenEligible_(c.catalog, c.res.level, (p.pantangan || []).concat(c.safety.hamil ? ['hamil'] : []));
  const options = {};
  eligible.filter(function(x) { return PGEN_COMPOUND.indexOf(x.pola) !== -1; }).forEach(function(x) { (options[x.pola] = options[x.pola] || []).push({ id: x.id, nama: x.nama }); });
  const out = {
    enabled: enabled, auto: p.auto, isAuto: isAuto, hasCoachProgram: cur.days.length > 0 && !isAuto,
    needsProfile: !p.hari || !p.durasi || !p.tujuanDiisi || !p.level,
    profile: { level: p.level, hari: p.hari, durasi: p.durasi, tujuan: p.tujuan, fokus: p.fokus },
    light: c.safety.light, block: p.blokKe || c.res.block, blokMulai: p.blokMulai,
    why: c.res.why, targets: c.res.targets, volume: c.res.volume, minutes: c.res.minutes, tukar: p.tukar, options: options,
    levels: GYM_LEVELS.slice(), goals: PG_GOALS.slice(), daysOptions: PG_DAYS.slice(), durations: PG_DURATIONS.slice(),
    muscles: EX_TARGETS.filter(function(t) { return ['cardiovascular system', 'serratus anterior', 'levator scapulae'].indexOf(t) === -1; })
  };
  if (admin) {
    out.reasons = c.safety.reasons; out.pantangan = p.pantangan; out.gaps = c.res.gaps; out.formOk = p.formOk; out.preview = c.res.days;
    out.tags = GYM_AVOID_TAGS.slice();
  }
  return out;
}

// ── Klien (anggota dari token) ────────────────────────────────────────────────

function getMyProgramProfile(memberToken) {
  const row = requireMember_(memberToken).row;
  return _programGenFor_(row, false);
}

/** Klien: simpan profil latihan (level, tujuan, hari, durasi, fokus) → program dibuat langsung bila otomatis aktif. */
function saveMyProgramProfile(memberToken, profile) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  const p = Object.assign({}, profile || {});
  delete p.pantangan; delete p.auto;   // hanya coach / tombol tersendiri
  const v = _pgValidateProfile_(p);
  if (!_throttle_('pg_' + id, 2)) throw new Error('Tunggu sebentar sebelum menyimpan lagi.');
  const m = _memberRowOrThrow_(id);
  _locked_(function() { _pgWrite_(m, v); });
  let gen = null;
  if (_pgEnabled_() && _pgProfileFrom_(_memberRowOrThrow_(id).row).auto) gen = _pgGenerate_(id, {});
  _bumpMember_(id);
  const fresh = _memberRowOrThrow_(id).row;
  return { programGen: _programGenFor_(fresh, false), program: _programFor_(fresh), skipped: gen && gen.skipped || '' };
}

/** Klien yang sudah punya program coach: terima program otomatis; program coach disalin dulu ke Rutinitas saya. */
function acceptAutoProgram(memberToken) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  if (!_pgEnabled_()) throw new Error('Program otomatis sedang dimatikan.');
  _locked_(function() {
    const coach = _programDays_(id);
    if (coach.days.length && !coach.sumber) {
      const own = _programDays_(id, null, true).days;
      const taken = own.map(function(d) { return d.hari; });
      coach.days.forEach(function(d) { const nm = _ownFreeName_(d.hari, taken); taken.push(nm); own.push({ hari: nm, items: d.items }); });
      if (own.length > PROGRAM_LIMITS.own) throw new Error('Rutinitas saya sudah penuh (' + PROGRAM_LIMITS.own + '). Hapus beberapa dulu.');
      _programWrite_(id, null, own, { own: true });
    }
    _pgWrite_(_memberRowOrThrow_(id), { auto: true });
  });
  _pgGenerate_(id, { force: true, newBlock: true });
  _bumpMember_(id);
  const fresh = _memberRowOrThrow_(id).row;
  return { programGen: _programGenFor_(fresh, false), program: _programFor_(fresh) };
}

/** Klien: nyalakan / matikan program otomatis. Mati = program terakhir tetap ada sebagai program biasa. */
function setMyProgramAuto(memberToken, on) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  _locked_(function() {
    _pgWrite_(_memberRowOrThrow_(id), { auto: !!on });
    const cur = _programDays_(id);
    if (!on && /^auto:/.test(cur.sumber || '')) _programWrite_(id, null, cur.days, {});
  });
  if (on && _pgEnabled_()) _pgGenerate_(id, {});
  _bumpMember_(id);
  const fresh = _memberRowOrThrow_(id).row;
  return { programGen: _programGenFor_(fresh, false), program: _programFor_(fresh) };
}

/** Klien: tukar gerakan untuk satu pola (aturan 16): hanya ke gerakan katalog dengan pola sama yang boleh untuknya. */
function swapMyProgramExercise(memberToken, pola, gymId) {
  const row = requireMember_(memberToken).row;
  const id = String(row[0]).trim();
  const c = _pgCompute_(row);
  const ok = _pgenEligible_(c.catalog, c.res.level, (c.profile.pantangan || []).concat(c.safety.hamil ? ['hamil'] : []))
    .some(function(x) { return x.id === String(gymId) && x.pola === String(pola); });
  if (!ok) throw new Error('Gerakan itu tidak bisa dipakai untuk pola ini.');
  const tukar = Object.assign({}, c.profile.tukar);
  tukar[String(pola)] = String(gymId);
  _locked_(function() { _pgWrite_(_memberRowOrThrow_(id), { tukar: tukar }); });
  if (/^auto:/.test(_programDays_(id).sumber || '')) _pgGenerate_(id, {});
  _bumpMember_(id);
  const fresh = _memberRowOrThrow_(id).row;
  return { programGen: _programGenFor_(fresh, false), program: _programFor_(fresh) };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function getProgramGenPreview(token, memberId) {
  requireAdmin_(token);
  return _plainJson_(_programGenFor_(_memberRowOrThrow_(memberId).row, true));
}

/** Admin: buat ulang program otomatis sekarang (boleh menimpa program coach — keputusan coach). */
function regenerateProgram(token, memberId) {
  requireAdmin_(token);
  const id = String(_memberRowOrThrow_(memberId).row[0]).trim();
  const r = _pgGenerate_(id, { force: true });
  if (r.skipped === 'katalog') throw new Error('Katalog alat gym belum punya gerakan aktif untuk klien ini.');
  return _bumpAfter_(id, getProgramGenPreview(token, id));
}

/** Admin: setel per klien. v = { auto?, pantangan?, level? }. */
function setClientProgramAuto(token, memberId, v) {
  requireAdmin_(token);
  const id = String(_memberRowOrThrow_(memberId).row[0]).trim();
  const clean = _pgValidateProfile_({ auto: v && v.auto, pantangan: v && v.pantangan, level: v && v.level !== undefined ? v.level : undefined });
  if (v && v.auto === undefined) delete clean.auto;
  if (v && v.pantangan === undefined) delete clean.pantangan;
  _locked_(function() { _pgWrite_(_memberRowOrThrow_(id), clean); });
  const p = _pgProfileFrom_(_memberRowOrThrow_(id).row);
  if (_pgEnabled_() && p.auto && /^auto:|^$/.test(_programDays_(id).sumber || '') && (!_programDays_(id).days.length || /^auto:/.test(_programDays_(id).sumber || ''))) _pgGenerate_(id, {});
  return _bumpAfter_(id, getProgramGenPreview(token, id));
}

/** Admin: tandai form satu gerakan OK di sesi PT (gerbang kenaikan beban, aturan 9a). exKey = kunci riwayat (ex:<id> / nm:<nama>). */
function setFormOk(token, memberId, exKey, ok) {
  requireAdmin_(token);
  const id = String(_memberRowOrThrow_(memberId).row[0]).trim();
  const key = String(exKey || '').trim();
  if (!/^(ex|nm):.{1,80}$/.test(key)) throw new Error('Gerakan tidak valid.');
  _locked_(function() {
    const m = _memberRowOrThrow_(id);
    const f = Object.assign({}, _pgProfileFrom_(m.row).formOk);
    if (ok) f[key] = _todayWib_(); else delete f[key];
    _pgWrite_(m, { formOk: f });
  });
  return _bumpAfter_(id, { formOk: _pgProfileFrom_(_memberRowOrThrow_(id).row).formOk });
}

// ── Saran progresi untuk program otomatis (dipakai _workoutFor_) ───────────────

/** { key: {step, kg?, why} } untuk gerakan di program otomatis (aturan 9a, 22). */
function _pgProgressFor_(row, program, g) {
  const p = _pgProfileFrom_(row);
  const catalog = _gymCatalog_();
  const lookup = _pgMuscleLookup_(catalog);
  const today = _todayWib_();
  const absent = _pgAbsenceDays_(g.days, today) >= PGEN.absenceDays;
  const safety = _pgSafetyFor_(row);
  const level = safety.light ? 'pemula-banget' : (p.level || 'pemula-banget');
  const upper = (PGEN.volume[level] || PGEN.volume['pemula-banget'])[safety.light ? 0 : 1];
  const planVol = {};
  program.forEach(function(d) { d.items.forEach(function(it) {
    const mm = lookup(it);
    if (!mm) return;
    mm.utama.forEach(function(m) { planVol[m] = (planVol[m] || 0) + (Number(it.set) || 0); });
    mm.pendukung.forEach(function(m) { planVol[m] = (planVol[m] || 0) + (Number(it.set) || 0) * PGEN.helperWeight; });
  }); });
  const out = {};
  program.forEach(function(d) { d.items.forEach(function(it) {
    if (it.jenis === 'waktu' || it.jenis === 'jarak') return;
    const key = _exKeyOf_(it.exId, it.gerakan), last = g.last[key];
    if (out[key]) return;
    const day = last && g.days.find(function(x) { return x.tanggal === last.tanggal; });
    const logged = day && day.items.find(function(x) { return x.key === key; });
    const mm = lookup(it) || { utama: [], pendukung: [] };
    const canAdd = mm.utama.length > 0 && mm.utama.every(function(m) { return (planVol[m] || 0) + 1 <= upper; });
    const lower = mm.utama.some(function(m) { return PGEN_LOWER.indexOf(m) !== -1; });
    out[key] = _pgenOverload_(last ? last.sets : [], it, { coachOk: !!p.formOk[key], lastForm: logged ? logged.form : '' }, canAdd, lower, absent, it.set);
  }); });
  return out;
}

// ── Job harian (REMINDER_JOBS 'program-otomatis', 04:00 WIB) ──────────────────

/** Tinjau blok tiap klien dengan program otomatis; buat program untuk klien aktif yang belum punya. Tidak mengirim pesan. */
function runProgramAutoJob_(ctx) {
  if (!_pgEnabled_()) return true;
  const pools = _loadClientPools_();
  const props = PropertiesService.getScriptProperties();
  const ids = pools.active.map(function(c) { return String(c.id); }).sort();
  const start = Number(props.getProperty('PG_JOB_CURSOR')) || 0;
  const batch = ids.slice(start, start + PG_JOB_MAX);
  const today = _todayWib_();
  let changed = 0;
  batch.forEach(function(id) {
    try {
      const m = _memberRowOrThrow_(id);
      const p = _pgProfileFrom_(m.row);
      if (!p.auto) return;
      const cur = _programDays_(id);
      if (cur.days.length && !/^auto:/.test(cur.sumber || '')) return;   // program coach: tidak disentuh
      if (!cur.days.length) { if (p.level && _pgGenerate_(id, {}).ok) changed++; return; }
      const g = _workoutGroup_(_workoutRowsOf_(id));
      const lookup = _pgMuscleLookup_(_gymCatalog_());
      const c = _pgCompute_(m.row);
      const since = p.blokMulai || today;
      const sinceDays = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(since + 'T00:00:00Z')) / 86400000);
      const formOkProgress = Object.keys(p.formOk || {}).length > 0;
      const r = _pgenReview_(sinceDays, _pgAbsenceDays_(g.days, today), _pgWeeklyRecorded_(g.days, since, lookup), c.res.targets,
        (PGEN.volume[c.res.level] || [0, 0])[1], formOkProgress, c.safety.light, c.res.level);
      if (r === 'keep') return;
      const v = {};
      if (r === 'next-block') v.blokKe = (p.blokKe || 1) + 1;
      if (r === 'level-up') { v.level = GYM_LEVELS[Math.min(GYM_LEVELS.length - 1, GYM_LEVELS.indexOf(c.res.level) + 1)]; v.blokKe = 1; }
      if (r === 'restart') v.blokKe = 1;
      v.blokMulai = today;
      _locked_(function() { _pgWrite_(_memberRowOrThrow_(id), v); });
      if (_pgGenerate_(id, {}).ok) {
        changed++; _bumpMember_(id);
        _pgHubEvent_(id, r === 'level-up' ? 'naik' : (r === 'restart' ? 'ulang' : 'blok'), { blok: v.blokKe, level: v.level || c.res.level });
      }
    } catch (e) { Logger.log('program-otomatis ' + id + ': ' + e); }
  });
  props.setProperty('PG_JOB_CURSOR', String(start + PG_JOB_MAX >= ids.length ? 0 : start + PG_JOB_MAX));
  if (changed) _bumpMember_('*');
  return true;
}
