// Laporan angka untuk XNK Pusat (hub xnk.web.id, T-2233). Spreadsheet coach di hub mendaftar ke XNK Pusat dengan
// rahasia acak (Script Property HUB_SECRET, ditulis wizard setup lewat Library); XNK Pusat memanggil hubStatus setiap
// pagi untuk dasbor /adminxnk dan email peringatan pemilik.
// Publik tanpa token admin/klien; satu-satunya penjaga adalah HUB_SECRET (perbandingan waktu-konstan, seperti relay
// push). Tanpa HUB_SECRET (produksi xnk.my.id) selalu menolak. Isi jawaban hanya angka dan status: tidak ada nama,
// nomor WA, catatan atau data kesehatan klien.

/** Tolak bila rahasia tidak cocok (pesan sama dengan permintaan tak dikenal). */
function _hubAuth_(secret) {
  var want = String(PropertiesService.getScriptProperties().getProperty('HUB_SECRET') || '');
  var got = String(secret == null ? '' : secret);
  var ok = want.length >= 32 && got.length === want.length;
  var diff = 0;
  for (var i = 0; i < want.length && i < got.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  if (!ok || diff !== 0) throw new Error('Permintaan tidak valid.');
}

/** Waktu (ms) dari sel tanggal/teks ISO; NaN bila kosong. */
function _hubMs_(v) {
  if (v instanceof Date) return v.getTime();
  var t = new Date(String(v || '')).getTime();
  return isNaN(t) ? NaN : t;
}

/**
 * Status spreadsheet ini untuk XNK Pusat. Hanya angka.
 * @param {string} secret HUB_SECRET spreadsheet ini
 * @return {{at: string, lib: ?Object, api: number, triggers: Object, reminders: Object, clients: Object, sessions: Object, quota: Object}}
 */
function hubStatus(secret) {
  _hubAuth_(secret);
  var props = PropertiesService.getScriptProperties();
  var now = Date.now(), day = 864e5;
  var b = typeof LIB_BUILD !== 'undefined' ? LIB_BUILD : null;
  var handlers = ScriptApp.getProjectTriggers().map(function(t) { return t.getHandlerFunction(); });
  var count = function(n) { return handlers.filter(function(h) { return h === n; }).length; };
  var last = parseInt(props.getProperty('RMD_LAST_tick'), 10);

  var sched = _readSchedulesAll_();
  var active = {}, done7 = 0, next7 = 0;
  sched.forEach(function(s) {
    var t = _hubMs_(s.start);
    if (isNaN(t)) return;
    if (t >= now - 30 * day && s.memberId) active[s.memberId] = 1;
    if (s.status === 'completed' && t >= now - 7 * day && t <= now) done7++;
    if (s.status !== 'completed' && t > now && t <= now + 7 * day) next7++;
  });
  var md = _getMemberDataSheet_();

  return {
    at: new Date(now).toISOString(),
    lib: b ? { hash: String(b.hash || ''), commit: String(b.commit || '') } : null,
    api: API_VERSION,
    triggers: { runReminderTick: count('runReminderTick'), runWarmTick: count('runWarmTick') },
    reminders: { enabled: props.getProperty('RMD_ENABLED') === 'true', lastTickAt: isNaN(last) ? '' : new Date(last).toISOString() },
    clients: { total: Math.max(0, md.getLastRow() - 1), active30d: Object.keys(active).length },
    sessions: { done7d: done7, next7d: next7 },
    quota: _quotaToday_(),   // T-2253: email, fetch, menit trigger hari ini (WIB)
  };
}
