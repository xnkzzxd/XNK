// =============================================================================
// TestFase1.gs — T-30: tes penjaga akses fungsi PR (Task) Fase 1.
//
// Jalankan `testAksesFase1` dari editor Apps Script (pemilik saja). Hasil di
// Logger (View > Logs / Execution log). Fungsi melempar error di akhir kalau
// ada tes gagal, jadi eksekusi berwarna merah = ada yang bocor.
//
// Aman dijalankan di data produksi: semua panggilan memakai token SALAH dan
// harus ditolak SEBELUM menyentuh sheet. Satu-satunya panggilan berhasil adalah
// getTaskSummary dengan token admin sah (baca-saja). Tes juga memastikan jumlah
// baris sheet "Tasks" tidak berubah selama tes.
// =============================================================================

var _T30_DAY_ = 86400000;

/** Panggil fn; lulus kalau melempar error auth (AUTH_ERROR_PREFIX). */
function _t30_expectAuthError_(results, label, fn) {
  try {
    fn();
    results.push({ ok: false, label: label, detail: 'TIDAK ditolak (fungsi berhasil dijalankan)' });
  } catch (e) {
    var msg = String(e && e.message || e);
    if (msg.indexOf(AUTH_ERROR_PREFIX) === 0) results.push({ ok: true, label: label });
    else results.push({ ok: false, label: label, detail: 'ditolak, tapi bukan error auth: ' + msg });
  }
}

/** Token uji. null = tidak bisa dibuat di lingkungan ini (dilewati, bukan gagal). */
function _t30_tokens_() {
  var now = Date.now();
  var adminVer = _adminPinVersion_();
  var T = { adminValid: null, adminStale: null, adminExpired: null, adminTampered: null,
            memberForged: null, memberValid: null, memberStale: null, memberGhost: null, memberExpired: null,
            memberId: null };

  if (adminVer) {
    T.adminValid = _issueToken_({ r: 'admin', v: adminVer, exp: now + _T30_DAY_ });
    T.adminExpired = _issueToken_({ r: 'admin', v: adminVer, exp: now - 1000 });
    // Tanda tangan dirusak: payload sah, signature diganti.
    T.adminTampered = T.adminValid.split('.')[0] + '.' + '0'.repeat(64);
  }
  T.adminStale = _issueToken_({ r: 'admin', v: 'versi-lama-x', exp: now + _T30_DAY_ });

  // Token role 'member' tapi dipakai ke fungsi admin: harus ditolak (payload.r !== 'admin').
  T.memberForged = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now + _T30_DAY_ });
  T.memberGhost = T.memberForged;                                   // klien tidak ada
  T.memberExpired = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now - 1000 });

  // Token klien nyata (kalau ada klien): versi sesi asli, dan versi salah.
  var found = _findMemberRow_(function() { return true; });
  if (found) {
    var id = String(found.row[0]).trim();
    var ver = _memberSessionVersion_(found, false); // false = tidak menulis apa pun
    T.memberId = id;
    T.memberStale = _issueToken_({ r: 'member', m: id, v: 'versi-lama-x', exp: now + _T30_DAY_ });
    if (ver) T.memberValid = _issueToken_({ r: 'member', m: id, v: ver, exp: now + _T30_DAY_ });
  }
  return T;
}

function testAksesFase1() {
  requireOwner_();
  var results = [], skipped = [];
  var T = _t30_tokens_();
  var rowsBefore = _tasksSheet_().getLastRow();

  // ── 1. Fungsi ADMIN harus menolak semua token yang bukan admin sah ───────────
  var adminCalls = {
    addTask:          function(tok) { return addTask(tok, { memberId: 'X', title: 'uji', category: 'lain' }); },
    updateTask:       function(tok) { return updateTask(tok, { id: 'X', title: 'uji' }); },
    deleteTask:       function(tok) { return deleteTask(tok, 'X'); },
    deleteTaskGroup:  function(tok) { return deleteTaskGroup(tok, 'X'); },
    getTasksForMember:function(tok) { return getTasksForMember(tok, 'X'); },
    getTaskSummary:   function(tok) { return getTaskSummary(tok); }
  };
  var badForAdmin = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token bukan string', { r: 'admin' }],
    ['token admin versi lama (PIN diganti)', T.adminStale],
    ['token admin kedaluwarsa', T.adminExpired],
    ['token admin signature dirusak', T.adminTampered],
    ['token klien dipakai di fungsi admin', T.memberForged],
    ['token klien NYATA dipakai di fungsi admin', T.memberValid]
  ];
  Object.keys(adminCalls).forEach(function(name) {
    badForAdmin.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'admin ' + name + ' ← ' + c[0], function() { adminCalls[name](c[1]); });
    });
  });

  // ── 2. Fungsi KLIEN harus menolak token yang bukan klien sah ────────────────
  var clientCalls = {
    getMyTasks:     function(tok) { return getMyTasks(tok); },
    completeMyTask: function(tok) { return completeMyTask(tok, 'X', 'uji'); }
  };
  var badForClient = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token ADMIN sah dipakai di fungsi klien', T.adminValid],
    ['token klien untuk ID yang tidak ada', T.memberGhost],
    ['token klien kedaluwarsa', T.memberExpired],
    ['token klien versi sesi lama', T.memberStale]
  ];
  Object.keys(clientCalls).forEach(function(name) {
    badForClient.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'klien ' + name + ' ← ' + c[0], function() { clientCalls[name](c[1]); });
    });
  });

  // ── 3. Kontrol positif: token sah HARUS lolos (agar penolakan di atas bermakna) ─
  if (T.adminValid) {
    try {
      var sum = getTaskSummary(T.adminValid);
      results.push({ ok: sum && typeof sum === 'object', label: 'kontrol: getTaskSummary ← token admin sah lolos',
                     detail: 'hasil bukan objek' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getTaskSummary ← token admin sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol admin sah (PIN admin belum diatur)');

  if (T.memberValid) {
    try {
      var mine = getMyTasks(T.memberValid);
      results.push({ ok: Array.isArray(mine), label: 'kontrol: getMyTasks ← token klien sah lolos', detail: 'hasil bukan array' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getMyTasks ← token klien sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol klien sah (tidak ada klien / versi sesi belum dibuat; login sekali sebagai klien)');

  // ── 4. Tidak ada efek samping: penolakan tidak boleh menulis ke sheet ───────
  var rowsAfter = _tasksSheet_().getLastRow();
  results.push({ ok: rowsBefore === rowsAfter, label: 'sheet Tasks tidak berubah (' + rowsBefore + ' → ' + rowsAfter + ' baris)',
                 detail: 'ada penulisan saat penolakan!' });

  // ── Laporan ────────────────────────────────────────────────────────────────
  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  skipped.forEach(function(s) { Logger.log('⏭️  dilewati: ' + s); });
  Logger.log('— ' + (results.length - failed.length) + '/' + results.length + ' lulus, ' + skipped.length + ' dilewati —');
  if (failed.length) throw new Error('T-30 GAGAL: ' + failed.length + ' tes. Lihat log. Pertama: ' + failed[0].label);
  return { passed: results.length, skipped: skipped.length };
}


// =============================================================================
// T-31 — tes kepemilikan PR & ketiadaan PR di endpoint publik.
//
// Jalankan `testKepemilikanFase1` dari editor Apps Script (pemilik saja). Perlu
// minimal 2 klien di MemberData. Fungsi menyisipkan 2 PR uji (ID 'TSK-T31-A/B',
// judul 'T31-UJI-...') lalu SELALU menghapusnya di akhir (blok finally), dan
// memeriksa jumlah baris sheet "Tasks" kembali seperti semula.
// Catatan: seperti login klien, tes ini membuat kunci sesi (kolom N) untuk klien
// uji yang belum punya; tidak ada data klien lain yang diubah.
// =============================================================================

function _t31_findTwoMembers_() {
  var a = _findMemberRow_(function() { return true; });
  if (!a) return null;
  var idA = String(a.row[0]).trim();
  var b = _findMemberRow_(function(row) { return String(row[0]).trim() !== idA; });
  return b ? { a: a, b: b } : null;
}

function _t31_memberToken_(found) {
  var ver = _memberSessionVersion_(found, true);
  return _issueToken_({ r: 'member', m: String(found.row[0]).trim(), v: ver, exp: Date.now() + _T30_DAY_ });
}

function _t31_expectMsg_(results, label, fn, msgPart) {
  try {
    fn();
    results.push({ ok: false, label: label, detail: 'TIDAK ditolak' });
  } catch (e) {
    var msg = String(e && e.message || e);
    results.push({ ok: msg.indexOf(msgPart) !== -1, label: label, detail: 'pesan error: ' + msg });
  }
}

function _t31_taskStatus_(id) {
  var f = _findTaskRow_(_tasksSheet_(), id);
  return f ? { status: String(f.row[6]), note: String(f.row[11] || '') } : null;
}

function testKepemilikanFase1() {
  requireOwner_();
  var results = [], skipped = [];
  var pair = _t31_findTwoMembers_();
  if (!pair) throw new Error('T-31 butuh minimal 2 klien di MemberData.');

  var idA = String(pair.a.row[0]).trim(), idB = String(pair.b.row[0]).trim();
  var tokA = _t31_memberToken_(pair.a), tokB = _t31_memberToken_(pair.b);
  var TA = 'TSK-T31-A', TB = 'TSK-T31-B';
  var sheet = _tasksSheet_();
  var rowsBefore = sheet.getLastRow();

  try {
    // Sisipkan PR uji langsung ke sheet (kolom A–M, Design §2.1).
    _withTaskLock_(function() {
      var iso = new Date().toISOString();
      sheet.appendRow([TA, idA, 'T31-UJI-A', '', 'lain', '', 'todo', 'none', 'uji-T31', iso, '', '', '']);
      sheet.appendRow([TB, idB, 'T31-UJI-B', '', 'lain', '', 'todo', 'none', 'uji-T31', iso, '', '', '']);
    });

    // ── 1. getMyTasks: hanya PR milik sendiri, tanpa field khusus admin ────────
    var mineA = getMyTasks(tokA), mineB = getMyTasks(tokB);
    var ids = function(list) { return list.map(function(t) { return t.id; }); };
    results.push({ ok: ids(mineA).indexOf(TA) !== -1, label: 'getMyTasks(A) memuat PR A', detail: 'PR A tidak muncul' });
    results.push({ ok: ids(mineA).indexOf(TB) === -1, label: 'getMyTasks(A) TIDAK memuat PR B', detail: 'PR klien lain bocor!' });
    results.push({ ok: ids(mineB).indexOf(TB) !== -1, label: 'getMyTasks(B) memuat PR B', detail: 'PR B tidak muncul' });
    results.push({ ok: ids(mineB).indexOf(TA) === -1, label: 'getMyTasks(B) TIDAK memuat PR A', detail: 'PR klien lain bocor!' });
    var leakFields = ['memberId', 'createdBy', 'createdAt', 'groupId'];
    var hasLeak = mineA.concat(mineB).some(function(t) { return leakFields.some(function(f) { return f in t; }); });
    results.push({ ok: !hasLeak, label: 'getMyTasks tanpa field admin (' + leakFields.join(', ') + ')', detail: 'field admin ikut terkirim' });

    // ── 2. completeMyTask: lintas klien ditolak, tanpa efek samping ────────────
    _t31_expectMsg_(results, 'completeMyTask(A) ke PR B ditolak "PR tidak ditemukan."',
      function() { completeMyTask(tokA, TB, 'serang'); }, 'PR tidak ditemukan.');
    _t31_expectMsg_(results, 'completeMyTask(B) ke PR A ditolak "PR tidak ditemukan."',
      function() { completeMyTask(tokB, TA, 'serang'); }, 'PR tidak ditemukan.');
    var sA = _t31_taskStatus_(TA), sB = _t31_taskStatus_(TB);
    results.push({ ok: sA && sA.status === 'todo' && sA.note === '', label: 'PR A tetap todo setelah serangan B', detail: JSON.stringify(sA) });
    results.push({ ok: sB && sB.status === 'todo' && sB.note === '', label: 'PR B tetap todo setelah serangan A', detail: JSON.stringify(sB) });

    // Pesan error untuk PR klien lain harus sama dengan ID yang tidak ada (tidak membocorkan keberadaan).
    var msgOther = '', msgGhost = '';
    try { completeMyTask(tokA, TB, ''); } catch (e) { msgOther = String(e.message || e); }
    try { completeMyTask(tokA, 'TSK-T31-TIDAK-ADA', ''); } catch (e) { msgGhost = String(e.message || e); }
    results.push({ ok: !!msgOther && msgOther === msgGhost, label: 'pesan PR klien lain = pesan ID tidak ada',
                   detail: '"' + msgOther + '" vs "' + msgGhost + '"' });

    // ── 3. Kontrol positif: pemilik sah bisa menyelesaikan PR-nya ──────────────
    try {
      var r = completeMyTask(tokA, TA, 'selesai uji');
      var afterA = _t31_taskStatus_(TA), afterB = _t31_taskStatus_(TB);
      results.push({ ok: r && r.status === 'success' && afterA.status === 'done' && afterA.note === 'selesai uji',
                     label: 'kontrol: completeMyTask(A) ke PR A berhasil', detail: JSON.stringify(afterA) });
      results.push({ ok: afterB.status === 'todo', label: 'PR B tidak ikut berubah', detail: JSON.stringify(afterB) });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: completeMyTask(A) ke PR A berhasil', detail: String(e.message || e) });
    }

    // ── 4. Admin (kalau PIN ada): getTasksForMember terpisah per klien ─────────
    var adminVer = _adminPinVersion_();
    if (adminVer) {
      var adm = _issueToken_({ r: 'admin', v: adminVer, exp: Date.now() + _T30_DAY_ });
      var lA = ids(getTasksForMember(adm, idA)), lB = ids(getTasksForMember(adm, idB));
      results.push({ ok: lA.indexOf(TA) !== -1 && lA.indexOf(TB) === -1, label: 'getTasksForMember(A) hanya PR A', detail: JSON.stringify(lA) });
      results.push({ ok: lB.indexOf(TB) !== -1 && lB.indexOf(TA) === -1, label: 'getTasksForMember(B) hanya PR B', detail: JSON.stringify(lB) });
    } else skipped.push('cek admin getTasksForMember (PIN admin belum diatur)');

    // ── 5. Endpoint publik (tanpa/dengan token klien) tidak memuat PR ──────────
    var publicCalls = {
      getPublicSchedules:    function() { return getPublicSchedules(); },
      'getPublicSchedules(token klien)': function() { return getPublicSchedules(tokA); },
      getPublicAvailability: function() { return getPublicAvailability(); },
      getPublicTestimonials: function() { return getPublicTestimonials(); },
      getLandingStats:       function() { return getLandingStats(); },
      getPriceList:          function() { return getPriceList(); },
      getCoaches:            function() { return getCoaches(); },
      getBusinessHours:      function() { return getBusinessHours(); }
    };
    Object.keys(publicCalls).forEach(function(name) {
      var out;
      try { out = JSON.stringify(publicCalls[name]()); }
      catch (e) { skipped.push('publik ' + name + ' (error: ' + String(e.message || e) + ')'); return; }
      var leaked = /T31-UJI|TSK-T31/.test(String(out));
      results.push({ ok: !leaked, label: 'publik ' + name + ' tanpa data PR', detail: 'data PR uji muncul di respons publik!' });
    });
  } finally {
    // Selalu bersihkan PR uji, sekalipun tes di atas melempar error.
    _withTaskLock_(function() {
      var data = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        var id = String(data[i][0]);
        if (id === TA || id === TB) sheet.deleteRow(i + 1);
      }
    });
  }

  var rowsAfter = sheet.getLastRow();
  results.push({ ok: rowsBefore === rowsAfter, label: 'sheet Tasks bersih kembali (' + rowsBefore + ' → ' + rowsAfter + ' baris)',
                 detail: 'PR uji tertinggal, hapus manual ID TSK-T31-A / TSK-T31-B' });

  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  skipped.forEach(function(s) { Logger.log('⏭️  dilewati: ' + s); });
  Logger.log('— ' + (results.length - failed.length) + '/' + results.length + ' lulus, ' + skipped.length + ' dilewati —');
  if (failed.length) throw new Error('T-31 GAGAL: ' + failed.length + ' tes. Lihat log. Pertama: ' + failed[0].label);
  return { passed: results.length, skipped: skipped.length };
}

// =============================================================================
// TestFase2.gs — tes Fase 2. Jalankan dari editor Apps Script (pemilik saja).
// =============================================================================

/** T-43: idempotensi ReminderLog + retensi. Baris uji dibersihkan di akhir. */
function testReminderLog() {
  requireOwner_();
  var results = [];
  var J = 'uji-t43', S = '2026-01-01T17';
  var sheet = _reminderLogSheet_();
  var rowsBefore = sheet.getLastRow();
  var check = function(ok, label, detail) { results.push({ ok: !!ok, label: label, detail: detail || '' }); };

  try {
    check(!_alreadySent_(J, S, '*'), 'awal: belum terkirim');
    _logReminder_(J, S, '*', 'gagal');
    check(!_alreadySent_(J, S, '*'), 'hasil "gagal" tidak dianggap terkirim (boleh coba lagi)');
    _logReminder_(J, S, '*', 'ok');
    check(_alreadySent_(J, S, '*'), 'setelah "ok": terdeteksi terkirim');
    check(_alreadySent_(J, S, ''), 'target kosong = "*"');
    check(!_alreadySent_(J, S, 'M-1'), 'target lain tidak ikut terkirim');
    check(!_alreadySent_(J, '2026-01-01T20', '*'), 'slot lain tidak ikut terkirim');
    check(!_alreadySent_('uji-lain', S, '*'), 'jenis lain tidak ikut terkirim');
    var slotCell = sheet.getRange(sheet.getLastRow(), 3).getValue();
    check(typeof slotCell === 'string' && slotCell === S, 'kolom Slot tetap teks', typeof slotCell + ': ' + slotCell);

    // Retensi: baris uji berumur 61 hari harus terhapus, baris baru tetap.
    var old = new Date(Date.now() - 61 * 86400000).toISOString();
    sheet.appendRow([_reminderKey_(J, 'lama', '*'), J, 'lama', '*', old, 'ok']);
    var removed = _pruneReminderLog_();
    check(removed >= 1 && !_alreadySent_(J, 'lama', '*'), 'prune menghapus baris >60 hari', 'terhapus ' + removed);
    check(_alreadySent_(J, S, '*'), 'prune tidak menghapus baris baru');
  } finally {
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) if (String(data[i][1]) === J) sheet.deleteRow(i + 1);
  }
  check(sheet.getLastRow() === rowsBefore, 'ReminderLog bersih kembali (' + rowsBefore + ' → ' + sheet.getLastRow() + ' baris)');

  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  Logger.log('— ' + (results.length - failed.length) + '/' + results.length + ' lulus —');
  if (failed.length) throw new Error('T-43 GAGAL: ' + failed.length + ' tes. Pertama: ' + failed[0].label);
  return { passed: results.length };
}

// =============================================================================
// TestReminder.gs — T-60: tes pemilihan klien, idempotensi, pemecahan pesan,
// dan _waLink_ untuk Fase 2 (Reminder).
//
// Jalankan `testReminderT60` dari editor Apps Script (pemilik saja). Hasil di
// Logger. Melempar error di akhir bila ada tes gagal → eksekusi merah = ada bug.
//
// Efek samping: HANYA grup "idempotensi" menulis ke sheet ReminderLog, memakai
// jenis unik `t60-uji-<waktu>`; semua baris itu dihapus lagi di blok finally.
// Tidak ada pesan Telegram/email/WA yang dikirim. Sheet klien & jadwal tidak
// disentuh (data klien di grup pemilihan adalah data sintetis).
//
// Fungsi terpisah bisa dijalankan sendiri: testT60WaLink, testT60PemilihanKlien,
// testT60PemecahanPesan, testT60Idempotensi.
//
// CATATAN: tes _waLink_ juga mendeteksi bentrok nama. Kode.gs punya fungsi
// _normalizePhone_ lain (tanpa validasi, tidak mengembalikan null). Kalau
// versi itu yang "menang" di proyek, tes 'nomor tidak valid → null' akan GAGAL.
// =============================================================================

/** Kumpulkan hasil: eq membandingkan lewat JSON. */
function _t60_ctx_() {
  var results = [];
  return {
    results: results,
    eq: function(label, got, want) {
      var ok = JSON.stringify(got) === JSON.stringify(want);
      results.push({ ok: ok, label: label, detail: 'dapat ' + JSON.stringify(got) + ', seharusnya ' + JSON.stringify(want) });
    },
    ok: function(label, cond, detail) { results.push({ ok: !!cond, label: label, detail: detail || 'kondisi salah' }); }
  };
}

function _t60_report_(name, results) {
  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  Logger.log('— ' + name + ': ' + (results.length - failed.length) + '/' + results.length + ' lulus —');
  if (failed.length) throw new Error('T-60 GAGAL (' + name + '): ' + failed.length + ' tes. Pertama: ' + failed[0].label);
  return { passed: results.length };
}

// ── 1. _waLink_ / _normalizePhone_ ──────────────────────────────────────────
function _t60_waLink_(c) {
  var base = 'https://wa.me/628123456789';
  c.eq('08… → 62…', _waLink_('08123456789'), base);
  c.eq('8… → 62…', _waLink_('8123456789'), base);
  c.eq('62… tetap', _waLink_('628123456789'), base);
  c.eq('+62 dengan spasi & strip', _waLink_('+62 812-3456-789'), base);
  c.eq('angka (bukan string) dari sheet', _waLink_(8123456789), base);
  c.eq('salah ketik 6208…', _waLink_('6208123456789'), base);
  c.eq('tanda kurung & titik', _waLink_('(0812) 3456.789'), base);

  c.eq('kosong → null', _waLink_(''), null);
  c.eq('null → null', _waLink_(null), null);
  c.eq('undefined → null', _waLink_(undefined), null);
  c.eq('"-" (placeholder sheet) → null', _waLink_('-'), null);
  c.eq('huruf → null', _waLink_('abc'), null);
  c.eq('terlalu pendek → null', _waLink_('08123'), null);
  c.eq('terlalu panjang → null', _waLink_('08123456789012345'), null);
  c.eq('bukan awalan 8 (telepon rumah) → null', _waLink_('0712345678'), null);
  c.eq('angka acak 123 → null', _waLink_('123'), null);

  c.eq('teks di-encode', _waLink_('08123456789', 'Halo & apa?'), base + '?text=Halo%20%26%20apa%3F');
  c.eq('teks baris baru di-encode', _waLink_('08123456789', 'a\nb'), base + '?text=a%0Ab');
  c.eq('tanpa teks → tanpa "?"', _waLink_('08123456789', ''), base);
  c.eq('nomor tidak valid + teks → null', _waLink_('abc', 'halo'), null);
}

function testT60WaLink() { var c = _t60_ctx_(); _t60_waLink_(c); return _t60_report_('_waLink_', c.results); }

// ── 2. Pemilihan klien (_buildClientPools_, fungsi murni) ───────────────────
// Kolom MemberData yang dipakai: 0 id, 1 nama, 2 WA, 6 paket, 8 total sesi, 9 terpakai, 10 coach.
function _t60_row_(id, name, phone, total, used) {
  var r = [id, name, phone, '', '', '', 'PKG', '', total, used, 'C1'];
  return r;
}

function _t60_pools_(c) {
  var now = new Date(2026, 8, 28, 10, 0, 0);
  var future = new Date(2026, 8, 30, 9, 0, 0).toISOString();
  var past = new Date(2026, 8, 20, 9, 0, 0).toISOString();

  var members = [
    _t60_row_('A', 'Ani', '08123456789', 10, 3),   // sisa 7, tanpa jadwal → bookable 7
    _t60_row_('B', 'Budi', '08123456780', 5, 3),   // sisa 2, 2 jadwal mendatang → aktif, tidak bookable
    _t60_row_('C', 'Cici', '08123456781', 5, 3),   // sisa 2, 3 jadwal mendatang → slots -1, tidak bookable
    _t60_row_('D', 'Dedi', '08123456782', 5, 5),   // sisa 0 → bukan aktif
    _t60_row_('E', 'Eka', 'abc', 5, 1),            // sisa 4, nomor tidak valid → skipped
    _t60_row_('F', 'Fani', '-', 5, 5),             // nomor tidak valid tapi sisa 0 → TIDAK dihitung skipped
    _t60_row_('G', 'Gita', '08123456783', '', ''), // total kosong → default 10, terpakai 0
    _t60_row_('H', 'Hadi', '08123456784', 4, 0),   // jadwal lampau & completed tidak dihitung → slots 4
    _t60_row_('I', 'Ida', '08123456785', 3, 4),    // terpakai > total → sisa negatif → bukan aktif
    null,                                          // baris rusak
    [],                                            // baris kosong
    _t60_row_('', 'Tanpa ID', '08123456786', 5, 0) // tanpa ID → dilewati
  ];
  var schedules = [
    { memberId: 'B', start: future, status: 'upcoming' },
    { memberId: 'B', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'H', start: past, status: 'upcoming' },        // sudah lewat
    { memberId: 'H', start: future, status: 'Completed' },     // completed (huruf besar) → tidak dihitung
    { memberId: 'H', start: 'bukan-tanggal', status: 'upcoming' }, // tanggal rusak → diabaikan
    { memberId: ' A ', start: past, status: 'upcoming' }       // spasi di ID, tapi lampau
  ];

  var p = _buildClientPools_(members, schedules, now);
  var ids = function(list) { return list.map(function(x) { return x.id; }); };
  var byId = {}; p.active.forEach(function(x) { byId[x.id] = x; });

  c.eq('aktif = A,B,C,G,H (urut sheet)', ids(p.active), ['A', 'B', 'C', 'G', 'H']);
  c.eq('bookable = A,G,H', ids(p.bookable), ['A', 'G', 'H']);
  c.eq('skipped = 1 (hanya Eka)', p.skipped, 1);
  c.eq('A: sisa 7, slots 7', [byId.A.remaining, byId.A.upcoming, byId.A.slots], [7, 0, 7]);
  c.eq('B: sisa 2, mendatang 2, slots 0', [byId.B.remaining, byId.B.upcoming, byId.B.slots], [2, 2, 0]);
  c.eq('C: slots negatif (-1) tidak bookable', [byId.C.slots, ids(p.bookable).indexOf('C')], [-1, -1]);
  c.eq('G: total kosong → default 10', [byId.G.remaining, byId.G.slots], [10, 10]);
  c.eq('H: jadwal lampau/completed/rusak diabaikan', [byId.H.upcoming, byId.H.slots], [0, 4]);
  c.eq('nomor di hasil sudah 62…', byId.A.phone, '628123456789');
  c.eq('nama & paket & coach terbawa', [byId.A.name, byId.A.packageId, byId.A.coachId], ['Ani', 'PKG', 'C1']);
  c.ok('bookable ⊆ aktif', p.bookable.every(function(b) { return !!byId[b.id]; }));

  // Batas: sisa tepat = jadwal mendatang → tidak bookable; sisa = jadwal+1 → bookable 1.
  var pp = _buildClientPools_([_t60_row_('X', 'Xa', '08123456787', 3, 1), _t60_row_('Y', 'Ya', '08123456788', 3, 1)],
    [{ memberId: 'X', start: future, status: 'upcoming' }, { memberId: 'X', start: future, status: 'upcoming' },
     { memberId: 'Y', start: future, status: 'upcoming' }], now);
  c.eq('sisa 2 − 2 jadwal = 0 → tidak bookable', pp.bookable.map(function(x) { return x.id; }), ['Y']);
  c.eq('sisa 2 − 1 jadwal = 1 slot', pp.bookable[0].slots, 1);

  // Jadwal tepat "sekarang" masih dihitung mendatang (start >= now).
  var pn = _buildClientPools_([_t60_row_('Z', 'Za', '08123456789', 2, 0)], [{ memberId: 'Z', start: now.toISOString(), status: 'upcoming' }], now);
  c.eq('jadwal tepat sekarang dihitung', pn.active[0].upcoming, 1);

  // Masukan kosong / null tidak melempar.
  c.eq('members [] → nol', _buildClientPools_([], [], now), { active: [], bookable: [], skipped: 0 });
  c.eq('members & schedules null → nol', _buildClientPools_(null, null, now), { active: [], bookable: [], skipped: 0 });

  // memberId numerik dari sheet cocok dengan ID string.
  var pnum = _buildClientPools_([_t60_row_(101, 'Num', '08123456789', 3, 0)], [{ memberId: 101, start: future, status: 'upcoming' }], now);
  c.eq('ID angka cocok dengan jadwal', pnum.active[0].upcoming, 1);
}

function testT60PemilihanKlien() { var c = _t60_ctx_(); _t60_pools_(c); return _t60_report_('pemilihan klien', c.results); }

// ── 3. Pemecahan pesan (_chunkButtons_, _cleanButtons_) ─────────────────────
function _t60_range_(n) { var a = []; for (var i = 0; i < n; i++) a.push({ text: 'B' + i, url: 'https://wa.me/1' }); return a; }

function _t60_chunk_(c) {
  var sizes = function(n) { return _chunkButtons_(_t60_range_(n), TELEGRAM_BUTTONS_PER_MESSAGE).map(function(x) { return x.length; }); };
  c.eq('batas tombol per pesan = 8', TELEGRAM_BUTTONS_PER_MESSAGE, 8);
  c.eq('0 tombol → tanpa potongan', sizes(0), []);
  c.eq('1 tombol', sizes(1), [1]);
  c.eq('8 tombol → satu pesan', sizes(8), [8]);
  c.eq('9 tombol → [8,1]', sizes(9), [8, 1]);
  c.eq('16 tombol → [8,8]', sizes(16), [8, 8]);
  c.eq('17 tombol → [8,8,1]', sizes(17), [8, 8, 1]);
  c.eq('40 tombol → 5 pesan penuh', sizes(40), [8, 8, 8, 8, 8]);

  var flat = [].concat.apply([], _chunkButtons_(_t60_range_(19), 8)).map(function(b) { return b.text; });
  c.eq('urutan & jumlah terjaga (19 tombol)', flat, _t60_range_(19).map(function(b) { return b.text; }));

  var cleaned = _cleanButtons_([
    { text: 'ok', url: 'https://wa.me/1' },
    { text: '', url: 'https://wa.me/1' },              // teks kosong
    { text: '   ', url: 'https://wa.me/1' },            // teks spasi
    { text: 'x', url: '' },                             // url kosong
    { text: 'x', url: 'javascript:alert(1)' },          // bukan http(s)
    { text: 'x', url: 'ftp://a' },
    { text: 'x', url: null },
    { text: 'linkNull', url: _waLink_('abc') },         // nomor tidak valid → null → dibuang
    null,
    { text: '  rapi  ', url: 'HTTP://a.b/c' },          // dipangkas, http huruf besar diterima
    { text: new Array(101).join('a'), url: 'https://a.b' } // dipotong 60
  ]);
  c.eq('hanya tombol valid tersisa', cleaned.map(function(b) { return b.text.length > 10 ? 'panjang' : b.text; }), ['ok', 'rapi', 'panjang']);
  c.eq('teks dipotong ' + TELEGRAM_BUTTON_TEXT_MAX + ' karakter', cleaned[2].text.length, TELEGRAM_BUTTON_TEXT_MAX);
  c.eq('null → []', _cleanButtons_(null), []);
  c.eq('undefined → []', _cleanButtons_(undefined), []);
  c.eq('[] → []', _cleanButtons_([]), []);
}

function testT60PemecahanPesan() { var c = _t60_ctx_(); _t60_chunk_(c); return _t60_report_('pemecahan pesan', c.results); }

// ── 4. Idempotensi ──────────────────────────────────────────────────────────
function _t60_keys_(c) {
  c.eq('kunci: target kosong → *', _reminderKey_('pr', '2026-09-28T08', ''), 'pr|2026-09-28T08|*');
  c.eq('kunci: target null → *', _reminderKey_('pr', '2026-09-28T08', null), 'pr|2026-09-28T08|*');
  c.eq('kunci: dipangkas', _reminderKey_(' pr ', ' 2026-09-28T08 ', ' m1 '), 'pr|2026-09-28T08|m1');
  c.ok('kunci: slot beda → kunci beda', _reminderKey_('pr', 'a', '*') !== _reminderKey_('pr', 'b', '*'));
  c.ok('kunci: jenis beda → kunci beda', _reminderKey_('pr', 'a', '*') !== _reminderKey_('booking-minggu', 'a', '*'));

  // Tick terlambat memakai slot yang sama dengan tick tepat waktu (kunci berasal dari jam TARGET).
  var job = { jenis: 'x', day: 0, hour: 17, handler: 'h' };
  var t1 = _dueJobs_({ day: 0, hour: 17, date: '2026-09-27' }, [job], {}, 1)[0];
  var t2 = _dueJobs_({ day: 0, hour: 18, date: '2026-09-27' }, [job], {}, 1)[0];
  c.eq('tick 17:00 dan 18:00 → slot sama', [t1.slot, t2.slot], ['2026-09-27T17', '2026-09-27T17']);
  var t3 = _dueJobs_({ day: 0, hour: 17, date: '2026-10-04' }, [job], {}, 1)[0];
  c.ok('Minggu depan → slot beda', t3.slot !== t1.slot);
}

/**
 * Meniru keputusan runReminderTick untuk satu job: kirim hanya bila belum 'ok'.
 * Mengembalikan true bila "mengirim" (handler dipanggil).
 */
function _t60_tickOnce_(job, parts, sendResult) {
  var due = _dueJobs_(parts, [job], {}, REMINDER_TICK_TOLERANCE_HOURS);
  var sent = false;
  due.forEach(function(d) {
    if (_alreadySent_(d.job.jenis, d.slot, '*')) return;
    sent = true;
    _logReminder_(d.job.jenis, d.slot, '*', sendResult ? 'ok' : 'gagal');
  });
  return sent;
}

function _t60_idempotensi_(c) {
  _t60_keys_(c);
  requireOwner_();
  var jenis = 't60-uji-' + Date.now();
  var job = { jenis: jenis, day: 0, hour: 17, handler: 'x' };
  var sun = '2026-09-27';
  try {
    c.eq('_alreadySent_ awal: false', _alreadySent_(jenis, sun + 'T17', '*'), false);

    c.eq('tick 17:00 pertama mengirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: sun }, true), true);
    c.eq('_alreadySent_ setelah ok: true', _alreadySent_(jenis, sun + 'T17', '*'), true);
    c.eq('tick 17:00 diulang TIDAK mengirim lagi', _t60_tickOnce_(job, { day: 0, hour: 17, date: sun }, true), false);
    c.eq('tick 18:00 (terlambat) TIDAK mengirim lagi', _t60_tickOnce_(job, { day: 0, hour: 18, date: sun }, true), false);
    c.eq('slot lain (Minggu depan) tetap bisa kirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: '2026-10-04' }, true), true);

    // 'gagal' tidak dianggap terkirim → boleh dicoba lagi, lalu berhenti setelah 'ok'.
    var slotG = '2026-10-11';
    c.eq('percobaan gagal mengirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: slotG }, false), true);
    c.eq('_alreadySent_ setelah gagal: false', _alreadySent_(jenis, slotG + 'T17', '*'), false);
    c.eq('coba lagi di tick berikut (18:00) → mengirim', _t60_tickOnce_(job, { day: 0, hour: 18, date: slotG }, true), true);
    c.eq('setelah ok, tidak lagi', _t60_tickOnce_(job, { day: 0, hour: 18, date: slotG }, true), false);

    // Target berbeda tidak saling menghalangi.
    _logReminder_(jenis, 'slot-t', 'M1', 'ok');
    c.eq('target M1 terkirim', _alreadySent_(jenis, 'slot-t', 'M1'), true);
    c.eq('target M2 belum', _alreadySent_(jenis, 'slot-t', 'M2'), false);
    c.eq('target * belum', _alreadySent_(jenis, 'slot-t', '*'), false);

    // Slot berformat tanggal tidak boleh berubah jadi objek Date oleh Sheets (kolom Plain Text).
    _logReminder_(jenis, '2026-09-27', '*', 'ok');
    c.eq('slot "YYYY-MM-DD" tetap terbaca (tidak jadi Date)', _alreadySent_(jenis, '2026-09-27', '*'), true);
  } finally {
    // Bersihkan semua baris uji, dari bawah ke atas.
    var sheet = _reminderLogSheet_(), last = sheet.getLastRow();
    if (last >= 2) {
      var jenisCol = sheet.getRange(2, 2, last - 1, 1).getValues();
      for (var i = jenisCol.length - 1; i >= 0; i--) {
        if (String(jenisCol[i][0]) === jenis) sheet.deleteRow(i + 2);
      }
    }
  }
  var lastAfter = _reminderLogSheet_().getLastRow(), left = 0;
  if (lastAfter >= 2) {
    _reminderLogSheet_().getRange(2, 2, lastAfter - 1, 1).getValues().forEach(function(r) { if (String(r[0]) === jenis) left++; });
  }
  c.eq('baris uji terhapus semua', left, 0);
}

function testT60Idempotensi() { var c = _t60_ctx_(); _t60_idempotensi_(c); return _t60_report_('idempotensi', c.results); }

// ── Runner ──────────────────────────────────────────────────────────────────
function testReminderT60() {
  requireOwner_();
  var c = _t60_ctx_();
  _t60_waLink_(c);
  _t60_pools_(c);
  _t60_chunk_(c);
  _t60_idempotensi_(c);
  return _t60_report_('T-60 (semua)', c.results);
}

// =============================================================================
// TestReminder.gs — T-60: tes pemilihan klien, idempotensi, pemecahan pesan,
// dan _waLink_ untuk Fase 2 (Reminder).
//
// Jalankan `testReminderT60` dari editor Apps Script (pemilik saja). Hasil di
// Logger. Melempar error di akhir bila ada tes gagal → eksekusi merah = ada bug.
//
// Efek samping: HANYA grup "idempotensi" menulis ke sheet ReminderLog, memakai
// jenis unik `t60-uji-<waktu>`; semua baris itu dihapus lagi di blok finally.
// Tidak ada pesan Telegram/email/WA yang dikirim. Sheet klien & jadwal tidak
// disentuh (data klien di grup pemilihan adalah data sintetis).
//
// Fungsi terpisah bisa dijalankan sendiri: testT60WaLink, testT60PemilihanKlien,
// testT60PemecahanPesan, testT60Idempotensi.
//
// CATATAN: Kode.gs punya _normalizePhone_ lain (tanpa validasi). Versi Reminder.gs
// sudah diganti nama jadi _rmdNormalizePhone_ agar tidak bentrok; tes _waLink_ tetap
// mendeteksi bila _waLink_ salah memakai versi Kode.gs.
// =============================================================================

/** Kumpulkan hasil: eq membandingkan lewat JSON. */
function _t60_ctx_() {
  var results = [];
  return {
    results: results,
    eq: function(label, got, want) {
      var ok = JSON.stringify(got) === JSON.stringify(want);
      results.push({ ok: ok, label: label, detail: 'dapat ' + JSON.stringify(got) + ', seharusnya ' + JSON.stringify(want) });
    },
    ok: function(label, cond, detail) { results.push({ ok: !!cond, label: label, detail: detail || 'kondisi salah' }); }
  };
}

function _t60_report_(name, results) {
  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  Logger.log('— ' + name + ': ' + (results.length - failed.length) + '/' + results.length + ' lulus —');
  if (failed.length) throw new Error('T-60 GAGAL (' + name + '): ' + failed.length + ' tes. Pertama: ' + failed[0].label);
  return { passed: results.length };
}

// ── 1. _waLink_ / _normalizePhone_ ──────────────────────────────────────────
function _t60_waLink_(c) {
  var base = 'https://wa.me/628123456789';
  c.eq('08… → 62…', _waLink_('08123456789'), base);
  c.eq('8… → 62…', _waLink_('8123456789'), base);
  c.eq('62… tetap', _waLink_('628123456789'), base);
  c.eq('+62 dengan spasi & strip', _waLink_('+62 812-3456-789'), base);
  c.eq('angka (bukan string) dari sheet', _waLink_(8123456789), base);
  c.eq('salah ketik 6208…', _waLink_('6208123456789'), base);
  c.eq('tanda kurung & titik', _waLink_('(0812) 3456.789'), base);

  c.eq('kosong → null', _waLink_(''), null);
  c.eq('null → null', _waLink_(null), null);
  c.eq('undefined → null', _waLink_(undefined), null);
  c.eq('"-" (placeholder sheet) → null', _waLink_('-'), null);
  c.eq('huruf → null', _waLink_('abc'), null);
  c.eq('terlalu pendek → null', _waLink_('08123'), null);
  c.eq('terlalu panjang → null', _waLink_('08123456789012345'), null);
  c.eq('bukan awalan 8 (telepon rumah) → null', _waLink_('0712345678'), null);
  c.eq('angka acak 123 → null', _waLink_('123'), null);

  c.eq('teks di-encode', _waLink_('08123456789', 'Halo & apa?'), base + '?text=Halo%20%26%20apa%3F');
  c.eq('teks baris baru di-encode', _waLink_('08123456789', 'a\nb'), base + '?text=a%0Ab');
  c.eq('tanpa teks → tanpa "?"', _waLink_('08123456789', ''), base);
  c.eq('nomor tidak valid + teks → null', _waLink_('abc', 'halo'), null);
}

function testT60WaLink() { var c = _t60_ctx_(); _t60_waLink_(c); return _t60_report_('_waLink_', c.results); }

// ── 2. Pemilihan klien (_buildClientPools_, fungsi murni) ───────────────────
// Kolom MemberData yang dipakai: 0 id, 1 nama, 2 WA, 6 paket, 8 total sesi, 9 terpakai, 10 coach.
function _t60_row_(id, name, phone, total, used) {
  var r = [id, name, phone, '', '', '', 'PKG', '', total, used, 'C1'];
  return r;
}

function _t60_pools_(c) {
  var now = new Date(2026, 8, 28, 10, 0, 0);
  var future = new Date(2026, 8, 30, 9, 0, 0).toISOString();
  var past = new Date(2026, 8, 20, 9, 0, 0).toISOString();

  var members = [
    _t60_row_('A', 'Ani', '08123456789', 10, 3),   // sisa 7, tanpa jadwal → bookable 7
    _t60_row_('B', 'Budi', '08123456780', 5, 3),   // sisa 2, 2 jadwal mendatang → aktif, tidak bookable
    _t60_row_('C', 'Cici', '08123456781', 5, 3),   // sisa 2, 3 jadwal mendatang → slots -1, tidak bookable
    _t60_row_('D', 'Dedi', '08123456782', 5, 5),   // sisa 0 → bukan aktif
    _t60_row_('E', 'Eka', 'abc', 5, 1),            // sisa 4, nomor tidak valid → skipped
    _t60_row_('F', 'Fani', '-', 5, 5),             // nomor tidak valid tapi sisa 0 → TIDAK dihitung skipped
    _t60_row_('G', 'Gita', '08123456783', '', ''), // total kosong → default 10, terpakai 0
    _t60_row_('H', 'Hadi', '08123456784', 4, 0),   // jadwal lampau & completed tidak dihitung → slots 4
    _t60_row_('I', 'Ida', '08123456785', 3, 4),    // terpakai > total → sisa negatif → bukan aktif
    null,                                          // baris rusak
    [],                                            // baris kosong
    _t60_row_('', 'Tanpa ID', '08123456786', 5, 0) // tanpa ID → dilewati
  ];
  var schedules = [
    { memberId: 'B', start: future, status: 'upcoming' },
    { memberId: 'B', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'C', start: future, status: 'upcoming' },
    { memberId: 'H', start: past, status: 'upcoming' },        // sudah lewat
    { memberId: 'H', start: future, status: 'Completed' },     // completed (huruf besar) → tidak dihitung
    { memberId: 'H', start: 'bukan-tanggal', status: 'upcoming' }, // tanggal rusak → diabaikan
    { memberId: ' A ', start: past, status: 'upcoming' }       // spasi di ID, tapi lampau
  ];

  var p = _buildClientPools_(members, schedules, now);
  var ids = function(list) { return list.map(function(x) { return x.id; }); };
  var byId = {}; p.active.forEach(function(x) { byId[x.id] = x; });

  c.eq('aktif = A,B,C,G,H (urut sheet)', ids(p.active), ['A', 'B', 'C', 'G', 'H']);
  c.eq('bookable = A,G,H', ids(p.bookable), ['A', 'G', 'H']);
  c.eq('skipped = 1 (hanya Eka)', p.skipped, 1);
  c.eq('A: sisa 7, slots 7', [byId.A.remaining, byId.A.upcoming, byId.A.slots], [7, 0, 7]);
  c.eq('B: sisa 2, mendatang 2, slots 0', [byId.B.remaining, byId.B.upcoming, byId.B.slots], [2, 2, 0]);
  c.eq('C: slots negatif (-1) tidak bookable', [byId.C.slots, ids(p.bookable).indexOf('C')], [-1, -1]);
  c.eq('G: total kosong → default 10', [byId.G.remaining, byId.G.slots], [10, 10]);
  c.eq('H: jadwal lampau/completed/rusak diabaikan', [byId.H.upcoming, byId.H.slots], [0, 4]);
  c.eq('nomor di hasil sudah 62…', byId.A.phone, '628123456789');
  c.eq('nama & paket & coach terbawa', [byId.A.name, byId.A.packageId, byId.A.coachId], ['Ani', 'PKG', 'C1']);
  c.ok('bookable ⊆ aktif', p.bookable.every(function(b) { return !!byId[b.id]; }));

  // Batas: sisa tepat = jadwal mendatang → tidak bookable; sisa = jadwal+1 → bookable 1.
  var pp = _buildClientPools_([_t60_row_('X', 'Xa', '08123456787', 3, 1), _t60_row_('Y', 'Ya', '08123456788', 3, 1)],
    [{ memberId: 'X', start: future, status: 'upcoming' }, { memberId: 'X', start: future, status: 'upcoming' },
     { memberId: 'Y', start: future, status: 'upcoming' }], now);
  c.eq('sisa 2 − 2 jadwal = 0 → tidak bookable', pp.bookable.map(function(x) { return x.id; }), ['Y']);
  c.eq('sisa 2 − 1 jadwal = 1 slot', pp.bookable[0].slots, 1);

  // Jadwal tepat "sekarang" masih dihitung mendatang (start >= now).
  var pn = _buildClientPools_([_t60_row_('Z', 'Za', '08123456789', 2, 0)], [{ memberId: 'Z', start: now.toISOString(), status: 'upcoming' }], now);
  c.eq('jadwal tepat sekarang dihitung', pn.active[0].upcoming, 1);

  // Masukan kosong / null tidak melempar.
  c.eq('members [] → nol', _buildClientPools_([], [], now), { active: [], bookable: [], skipped: 0 });
  c.eq('members & schedules null → nol', _buildClientPools_(null, null, now), { active: [], bookable: [], skipped: 0 });

  // memberId numerik dari sheet cocok dengan ID string.
  var pnum = _buildClientPools_([_t60_row_(101, 'Num', '08123456789', 3, 0)], [{ memberId: 101, start: future, status: 'upcoming' }], now);
  c.eq('ID angka cocok dengan jadwal', pnum.active[0].upcoming, 1);
}

function testT60PemilihanKlien() { var c = _t60_ctx_(); _t60_pools_(c); return _t60_report_('pemilihan klien', c.results); }

// ── 3. Pemecahan pesan (_chunkButtons_, _cleanButtons_) ─────────────────────
function _t60_range_(n) { var a = []; for (var i = 0; i < n; i++) a.push({ text: 'B' + i, url: 'https://wa.me/1' }); return a; }

function _t60_chunk_(c) {
  var sizes = function(n) { return _chunkButtons_(_t60_range_(n), TELEGRAM_BUTTONS_PER_MESSAGE).map(function(x) { return x.length; }); };
  c.eq('batas tombol per pesan = 8', TELEGRAM_BUTTONS_PER_MESSAGE, 8);
  c.eq('0 tombol → tanpa potongan', sizes(0), []);
  c.eq('1 tombol', sizes(1), [1]);
  c.eq('8 tombol → satu pesan', sizes(8), [8]);
  c.eq('9 tombol → [8,1]', sizes(9), [8, 1]);
  c.eq('16 tombol → [8,8]', sizes(16), [8, 8]);
  c.eq('17 tombol → [8,8,1]', sizes(17), [8, 8, 1]);
  c.eq('40 tombol → 5 pesan penuh', sizes(40), [8, 8, 8, 8, 8]);

  var flat = [].concat.apply([], _chunkButtons_(_t60_range_(19), 8)).map(function(b) { return b.text; });
  c.eq('urutan & jumlah terjaga (19 tombol)', flat, _t60_range_(19).map(function(b) { return b.text; }));

  var cleaned = _cleanButtons_([
    { text: 'ok', url: 'https://wa.me/1' },
    { text: '', url: 'https://wa.me/1' },              // teks kosong
    { text: '   ', url: 'https://wa.me/1' },            // teks spasi
    { text: 'x', url: '' },                             // url kosong
    { text: 'x', url: 'javascript:alert(1)' },          // bukan http(s)
    { text: 'x', url: 'ftp://a' },
    { text: 'x', url: null },
    { text: 'linkNull', url: _waLink_('abc') },         // nomor tidak valid → null → dibuang
    null,
    { text: '  rapi  ', url: 'HTTP://a.b/c' },          // dipangkas, http huruf besar diterima
    { text: new Array(101).join('a'), url: 'https://a.b' } // dipotong 60
  ]);
  c.eq('hanya tombol valid tersisa', cleaned.map(function(b) { return b.text.length > 10 ? 'panjang' : b.text; }), ['ok', 'rapi', 'panjang']);
  c.eq('teks dipotong ' + TELEGRAM_BUTTON_TEXT_MAX + ' karakter', cleaned[2].text.length, TELEGRAM_BUTTON_TEXT_MAX);
  c.eq('null → []', _cleanButtons_(null), []);
  c.eq('undefined → []', _cleanButtons_(undefined), []);
  c.eq('[] → []', _cleanButtons_([]), []);
}

function testT60PemecahanPesan() { var c = _t60_ctx_(); _t60_chunk_(c); return _t60_report_('pemecahan pesan', c.results); }

// ── 4. Idempotensi ──────────────────────────────────────────────────────────
function _t60_keys_(c) {
  c.eq('kunci: target kosong → *', _reminderKey_('pr', '2026-09-28T08', ''), 'pr|2026-09-28T08|*');
  c.eq('kunci: target null → *', _reminderKey_('pr', '2026-09-28T08', null), 'pr|2026-09-28T08|*');
  c.eq('kunci: dipangkas', _reminderKey_(' pr ', ' 2026-09-28T08 ', ' m1 '), 'pr|2026-09-28T08|m1');
  c.ok('kunci: slot beda → kunci beda', _reminderKey_('pr', 'a', '*') !== _reminderKey_('pr', 'b', '*'));
  c.ok('kunci: jenis beda → kunci beda', _reminderKey_('pr', 'a', '*') !== _reminderKey_('booking-minggu', 'a', '*'));

  // Tick terlambat memakai slot yang sama dengan tick tepat waktu (kunci berasal dari jam TARGET).
  var job = { jenis: 'x', day: 0, hour: 17, handler: 'h' };
  var t1 = _dueJobs_({ day: 0, hour: 17, date: '2026-09-27' }, [job], {}, 1)[0];
  var t2 = _dueJobs_({ day: 0, hour: 18, date: '2026-09-27' }, [job], {}, 1)[0];
  c.eq('tick 17:00 dan 18:00 → slot sama', [t1.slot, t2.slot], ['2026-09-27T17', '2026-09-27T17']);
  var t3 = _dueJobs_({ day: 0, hour: 17, date: '2026-10-04' }, [job], {}, 1)[0];
  c.ok('Minggu depan → slot beda', t3.slot !== t1.slot);
}

/**
 * Meniru keputusan runReminderTick untuk satu job: kirim hanya bila belum 'ok'.
 * Mengembalikan true bila "mengirim" (handler dipanggil).
 */
function _t60_tickOnce_(job, parts, sendResult) {
  var due = _dueJobs_(parts, [job], {}, REMINDER_TICK_TOLERANCE_HOURS);
  var sent = false;
  due.forEach(function(d) {
    if (_alreadySent_(d.job.jenis, d.slot, '*')) return;
    sent = true;
    _logReminder_(d.job.jenis, d.slot, '*', sendResult ? 'ok' : 'gagal');
  });
  return sent;
}

function _t60_idempotensi_(c) {
  _t60_keys_(c);
  requireOwner_();
  var jenis = 't60-uji-' + Date.now();
  var job = { jenis: jenis, day: 0, hour: 17, handler: 'x' };
  var sun = '2026-09-27';
  try {
    c.eq('_alreadySent_ awal: false', _alreadySent_(jenis, sun + 'T17', '*'), false);

    c.eq('tick 17:00 pertama mengirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: sun }, true), true);
    c.eq('_alreadySent_ setelah ok: true', _alreadySent_(jenis, sun + 'T17', '*'), true);
    c.eq('tick 17:00 diulang TIDAK mengirim lagi', _t60_tickOnce_(job, { day: 0, hour: 17, date: sun }, true), false);
    c.eq('tick 18:00 (terlambat) TIDAK mengirim lagi', _t60_tickOnce_(job, { day: 0, hour: 18, date: sun }, true), false);
    c.eq('slot lain (Minggu depan) tetap bisa kirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: '2026-10-04' }, true), true);

    // 'gagal' tidak dianggap terkirim → boleh dicoba lagi, lalu berhenti setelah 'ok'.
    var slotG = '2026-10-11';
    c.eq('percobaan gagal mengirim', _t60_tickOnce_(job, { day: 0, hour: 17, date: slotG }, false), true);
    c.eq('_alreadySent_ setelah gagal: false', _alreadySent_(jenis, slotG + 'T17', '*'), false);
    c.eq('coba lagi di tick berikut (18:00) → mengirim', _t60_tickOnce_(job, { day: 0, hour: 18, date: slotG }, true), true);
    c.eq('setelah ok, tidak lagi', _t60_tickOnce_(job, { day: 0, hour: 18, date: slotG }, true), false);

    // Target berbeda tidak saling menghalangi.
    _logReminder_(jenis, 'slot-t', 'M1', 'ok');
    c.eq('target M1 terkirim', _alreadySent_(jenis, 'slot-t', 'M1'), true);
    c.eq('target M2 belum', _alreadySent_(jenis, 'slot-t', 'M2'), false);
    c.eq('target * belum', _alreadySent_(jenis, 'slot-t', '*'), false);

    // Slot berformat tanggal tidak boleh berubah jadi objek Date oleh Sheets (kolom Plain Text).
    _logReminder_(jenis, '2026-09-27', '*', 'ok');
    c.eq('slot "YYYY-MM-DD" tetap terbaca (tidak jadi Date)', _alreadySent_(jenis, '2026-09-27', '*'), true);
  } finally {
    // Bersihkan semua baris uji, dari bawah ke atas.
    var sheet = _reminderLogSheet_(), last = sheet.getLastRow();
    if (last >= 2) {
      var jenisCol = sheet.getRange(2, 2, last - 1, 1).getValues();
      for (var i = jenisCol.length - 1; i >= 0; i--) {
        if (String(jenisCol[i][0]) === jenis) sheet.deleteRow(i + 2);
      }
    }
  }
  var lastAfter = _reminderLogSheet_().getLastRow(), left = 0;
  if (lastAfter >= 2) {
    _reminderLogSheet_().getRange(2, 2, lastAfter - 1, 1).getValues().forEach(function(r) { if (String(r[0]) === jenis) left++; });
  }
  c.eq('baris uji terhapus semua', left, 0);
}

function testT60Idempotensi() { var c = _t60_ctx_(); _t60_idempotensi_(c); return _t60_report_('idempotensi', c.results); }

// ── Runner ──────────────────────────────────────────────────────────────────
function testReminderT60() {
  requireOwner_();
  var c = _t60_ctx_();
  _t60_waLink_(c);
  _t60_pools_(c);
  _t60_chunk_(c);
  _t60_idempotensi_(c);
  return _t60_report_('T-60 (semua)', c.results);
}

// =============================================================================
// TestFase1.gs — T-30: tes penjaga akses fungsi PR (Task) Fase 1.
//
// Jalankan `testAksesFase1` dari editor Apps Script (pemilik saja). Hasil di
// Logger (View > Logs / Execution log). Fungsi melempar error di akhir kalau
// ada tes gagal, jadi eksekusi berwarna merah = ada yang bocor.
//
// Aman dijalankan di data produksi: semua panggilan memakai token SALAH dan
// harus ditolak SEBELUM menyentuh sheet. Satu-satunya panggilan berhasil adalah
// getTaskSummary dengan token admin sah (baca-saja). Tes juga memastikan jumlah
// baris sheet "Tasks" tidak berubah selama tes.
// =============================================================================

var _T30_DAY_ = 86400000;

/** Panggil fn; lulus kalau melempar error auth (AUTH_ERROR_PREFIX). */
function _t30_expectAuthError_(results, label, fn) {
  try {
    fn();
    results.push({ ok: false, label: label, detail: 'TIDAK ditolak (fungsi berhasil dijalankan)' });
  } catch (e) {
    var msg = String(e && e.message || e);
    if (msg.indexOf(AUTH_ERROR_PREFIX) === 0) results.push({ ok: true, label: label });
    else results.push({ ok: false, label: label, detail: 'ditolak, tapi bukan error auth: ' + msg });
  }
}

/** Token uji. null = tidak bisa dibuat di lingkungan ini (dilewati, bukan gagal). */
function _t30_tokens_() {
  var now = Date.now();
  var adminVer = _adminPinVersion_();
  var T = { adminValid: null, adminStale: null, adminExpired: null, adminTampered: null,
            memberForged: null, memberValid: null, memberStale: null, memberGhost: null, memberExpired: null,
            memberId: null };

  if (adminVer) {
    T.adminValid = _issueToken_({ r: 'admin', v: adminVer, exp: now + _T30_DAY_ });
    T.adminExpired = _issueToken_({ r: 'admin', v: adminVer, exp: now - 1000 });
    // Tanda tangan dirusak: payload sah, signature diganti.
    T.adminTampered = T.adminValid.split('.')[0] + '.' + '0'.repeat(64);
  }
  T.adminStale = _issueToken_({ r: 'admin', v: 'versi-lama-x', exp: now + _T30_DAY_ });

  // Token role 'member' tapi dipakai ke fungsi admin: harus ditolak (payload.r !== 'admin').
  T.memberForged = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now + _T30_DAY_ });
  T.memberGhost = T.memberForged;                                   // klien tidak ada
  T.memberExpired = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now - 1000 });

  // Token klien nyata (kalau ada klien): versi sesi asli, dan versi salah.
  var found = _findMemberRow_(function() { return true; });
  if (found) {
    var id = String(found[0]).trim();
    var ver = _memberSessionVersion_(found, false); // false = tidak menulis apa pun
    T.memberId = id;
    T.memberStale = _issueToken_({ r: 'member', m: id, v: 'versi-lama-x', exp: now + _T30_DAY_ });
    if (ver) T.memberValid = _issueToken_({ r: 'member', m: id, v: ver, exp: now + _T30_DAY_ });
  }
  return T;
}

function testAksesFase1() {
  requireOwner_();
  var results = [], skipped = [];
  var T = _t30_tokens_();
  var rowsBefore = _tasksSheet_().getLastRow();

  // ── 1. Fungsi ADMIN harus menolak semua token yang bukan admin sah ───────────
  var adminCalls = {
    addTask:          function(tok) { return addTask(tok, { memberId: 'X', title: 'uji', category: 'lain' }); },
    updateTask:       function(tok) { return updateTask(tok, { id: 'X', title: 'uji' }); },
    deleteTask:       function(tok) { return deleteTask(tok, 'X'); },
    deleteTaskGroup:  function(tok) { return deleteTaskGroup(tok, 'X'); },
    getTasksForMember:function(tok) { return getTasksForMember(tok, 'X'); },
    getTaskSummary:   function(tok) { return getTaskSummary(tok); },
    getTaskTemplates: function(tok) { return getTaskTemplates(tok); },
    saveTaskTemplate: function(tok) { return saveTaskTemplate(tok, { title: 'uji', category: 'lain' }); },
    deleteTaskTemplate: function(tok) { return deleteTaskTemplate(tok, 'X'); }
  };
  var badForAdmin = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token bukan string', { r: 'admin' }],
    ['token admin versi lama (PIN diganti)', T.adminStale],
    ['token admin kedaluwarsa', T.adminExpired],
    ['token admin signature dirusak', T.adminTampered],
    ['token klien dipakai di fungsi admin', T.memberForged],
    ['token klien NYATA dipakai di fungsi admin', T.memberValid]
  ];
  Object.keys(adminCalls).forEach(function(name) {
    badForAdmin.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'admin ' + name + ' ← ' + c[0], function() { adminCalls[name](c[1]); });
    });
  });

  // ── 2. Fungsi KLIEN harus menolak token yang bukan klien sah ────────────────
  var clientCalls = {
    getMyTasks:     function(tok) { return getMyTasks(tok); },
    completeMyTask: function(tok) { return completeMyTask(tok, 'X', 'uji'); }
  };
  var badForClient = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token ADMIN sah dipakai di fungsi klien', T.adminValid],
    ['token klien untuk ID yang tidak ada', T.memberGhost],
    ['token klien kedaluwarsa', T.memberExpired],
    ['token klien versi sesi lama', T.memberStale]
  ];
  Object.keys(clientCalls).forEach(function(name) {
    badForClient.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'klien ' + name + ' ← ' + c[0], function() { clientCalls[name](c[1]); });
    });
  });

  // ── 3. Kontrol positif: token sah HARUS lolos (agar penolakan di atas bermakna) ─
  if (T.adminValid) {
    try {
      var sum = getTaskSummary(T.adminValid);
      results.push({ ok: sum && typeof sum === 'object', label: 'kontrol: getTaskSummary ← token admin sah lolos',
                     detail: 'hasil bukan objek' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getTaskSummary ← token admin sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol admin sah (PIN admin belum diatur)');

  if (T.memberValid) {
    try {
      var mine = getMyTasks(T.memberValid);
      results.push({ ok: Array.isArray(mine), label: 'kontrol: getMyTasks ← token klien sah lolos', detail: 'hasil bukan array' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getMyTasks ← token klien sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol klien sah (tidak ada klien / versi sesi belum dibuat; login sekali sebagai klien)');

  // ── 4. Tidak ada efek samping: penolakan tidak boleh menulis ke sheet ───────
  var rowsAfter = _tasksSheet_().getLastRow();
  results.push({ ok: rowsBefore === rowsAfter, label: 'sheet Tasks tidak berubah (' + rowsBefore + ' → ' + rowsAfter + ' baris)',
                 detail: 'ada penulisan saat penolakan!' });

  // ── Laporan ────────────────────────────────────────────────────────────────
  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  skipped.forEach(function(s) { Logger.log('⏭️  dilewati: ' + s); });
  Logger.log('— ' + (results.length - failed.length) + '/' + results.length + ' lulus, ' + skipped.length + ' dilewati —');
  if (failed.length) throw new Error('T-30 GAGAL: ' + failed.length + ' tes. Lihat log. Pertama: ' + failed[0].label);
  return { passed: results.length, skipped: skipped.length };
}

// =============================================================================
// TestFase1.gs — T-30: tes penjaga akses fungsi PR (Task) Fase 1.
//
// Jalankan `testAksesFase1` dari editor Apps Script (pemilik saja). Hasil di
// Logger (View > Logs / Execution log). Fungsi melempar error di akhir kalau
// ada tes gagal, jadi eksekusi berwarna merah = ada yang bocor.
//
// Aman dijalankan di data produksi: semua panggilan memakai token SALAH dan
// harus ditolak SEBELUM menyentuh sheet. Satu-satunya panggilan berhasil adalah
// getTaskSummary dengan token admin sah (baca-saja). Tes juga memastikan jumlah
// baris sheet "Tasks" tidak berubah selama tes.
// =============================================================================

var _T30_DAY_ = 86400000;

/** Panggil fn; lulus kalau melempar error auth (AUTH_ERROR_PREFIX). */
function _t30_expectAuthError_(results, label, fn) {
  try {
    fn();
    results.push({ ok: false, label: label, detail: 'TIDAK ditolak (fungsi berhasil dijalankan)' });
  } catch (e) {
    var msg = String(e && e.message || e);
    if (msg.indexOf(AUTH_ERROR_PREFIX) === 0) results.push({ ok: true, label: label });
    else results.push({ ok: false, label: label, detail: 'ditolak, tapi bukan error auth: ' + msg });
  }
}

/** Token uji. null = tidak bisa dibuat di lingkungan ini (dilewati, bukan gagal). */
function _t30_tokens_() {
  var now = Date.now();
  var adminVer = _adminPinVersion_();
  var T = { adminValid: null, adminStale: null, adminExpired: null, adminTampered: null,
            memberForged: null, memberValid: null, memberStale: null, memberGhost: null, memberExpired: null,
            memberId: null };

  if (adminVer) {
    T.adminValid = _issueToken_({ r: 'admin', v: adminVer, exp: now + _T30_DAY_ });
    T.adminExpired = _issueToken_({ r: 'admin', v: adminVer, exp: now - 1000 });
    // Tanda tangan dirusak: payload sah, signature diganti.
    T.adminTampered = T.adminValid.split('.')[0] + '.' + '0'.repeat(64);
  }
  T.adminStale = _issueToken_({ r: 'admin', v: 'versi-lama-x', exp: now + _T30_DAY_ });

  // Token role 'member' tapi dipakai ke fungsi admin: harus ditolak (payload.r !== 'admin').
  T.memberForged = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now + _T30_DAY_ });
  T.memberGhost = T.memberForged;                                   // klien tidak ada
  T.memberExpired = _issueToken_({ r: 'member', m: 'ID-TIDAK-ADA', v: 'x', exp: now - 1000 });

  // Token klien nyata (kalau ada klien): versi sesi asli, dan versi salah.
  var found = _findMemberRow_(function() { return true; });
  if (found) {
    var id = String(found[0]).trim();
    var ver = _memberSessionVersion_(found, false); // false = tidak menulis apa pun
    T.memberId = id;
    T.memberStale = _issueToken_({ r: 'member', m: id, v: 'versi-lama-x', exp: now + _T30_DAY_ });
    if (ver) T.memberValid = _issueToken_({ r: 'member', m: id, v: ver, exp: now + _T30_DAY_ });
  }
  return T;
}

function testAksesFase1() {
  requireOwner_();
  var results = [], skipped = [];
  var T = _t30_tokens_();
  var rowsBefore = _tasksSheet_().getLastRow();

  // ── 1. Fungsi ADMIN harus menolak semua token yang bukan admin sah ───────────
  var adminCalls = {
    addTask:          function(tok) { return addTask(tok, { memberId: 'X', title: 'uji', category: 'lain' }); },
    updateTask:       function(tok) { return updateTask(tok, { id: 'X', title: 'uji' }); },
    deleteTask:       function(tok) { return deleteTask(tok, 'X'); },
    deleteTaskGroup:  function(tok) { return deleteTaskGroup(tok, 'X'); },
    getTasksForMember:function(tok) { return getTasksForMember(tok, 'X'); },
    getTaskSummary:   function(tok) { return getTaskSummary(tok); },
    getTaskTemplates: function(tok) { return getTaskTemplates(tok); },
    saveTaskTemplate: function(tok) { return saveTaskTemplate(tok, { title: 'uji', category: 'lain' }); },
    deleteTaskTemplate: function(tok) { return deleteTaskTemplate(tok, 'X'); }
  };
  var badForAdmin = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token bukan string', { r: 'admin' }],
    ['token admin versi lama (PIN diganti)', T.adminStale],
    ['token admin kedaluwarsa', T.adminExpired],
    ['token admin signature dirusak', T.adminTampered],
    ['token klien dipakai di fungsi admin', T.memberForged],
    ['token klien NYATA dipakai di fungsi admin', T.memberValid]
  ];
  Object.keys(adminCalls).forEach(function(name) {
    badForAdmin.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'admin ' + name + ' ← ' + c[0], function() { adminCalls[name](c[1]); });
    });
  });

  // ── 2. Fungsi KLIEN harus menolak token yang bukan klien sah ────────────────
  var clientCalls = {
    getMyTasks:     function(tok) { return getMyTasks(tok); },
    completeMyTask: function(tok) { return completeMyTask(tok, 'X', 'uji'); }
  };
  var badForClient = [
    ['tanpa token (undefined)', undefined],
    ['token null', null],
    ['token kosong', ''],
    ['token sampah', 'bukan-token'],
    ['token ADMIN sah dipakai di fungsi klien', T.adminValid],
    ['token klien untuk ID yang tidak ada', T.memberGhost],
    ['token klien kedaluwarsa', T.memberExpired],
    ['token klien versi sesi lama', T.memberStale]
  ];
  Object.keys(clientCalls).forEach(function(name) {
    badForClient.forEach(function(c) {
      if (c[1] === null && c[0] !== 'token null') { skipped.push(name + ' · ' + c[0]); return; }
      _t30_expectAuthError_(results, 'klien ' + name + ' ← ' + c[0], function() { clientCalls[name](c[1]); });
    });
  });

  // ── 3. Kontrol positif: token sah HARUS lolos (agar penolakan di atas bermakna) ─
  if (T.adminValid) {
    try {
      var sum = getTaskSummary(T.adminValid);
      results.push({ ok: sum && typeof sum === 'object', label: 'kontrol: getTaskSummary ← token admin sah lolos',
                     detail: 'hasil bukan objek' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getTaskSummary ← token admin sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol admin sah (PIN admin belum diatur)');

  if (T.memberValid) {
    try {
      var mine = getMyTasks(T.memberValid);
      results.push({ ok: Array.isArray(mine), label: 'kontrol: getMyTasks ← token klien sah lolos', detail: 'hasil bukan array' });
    } catch (e) {
      results.push({ ok: false, label: 'kontrol: getMyTasks ← token klien sah lolos', detail: String(e.message || e) });
    }
  } else skipped.push('kontrol klien sah (tidak ada klien / versi sesi belum dibuat; login sekali sebagai klien)');

  // ── 4. Tidak ada efek samping: penolakan tidak boleh menulis ke sheet ───────
  var rowsAfter = _tasksSheet_().getLastRow();
  results.push({ ok: rowsBefore === rowsAfter, label: 'sheet Tasks tidak berubah (' + rowsBefore + ' → ' + rowsAfter + ' baris)',
                 detail: 'ada penulisan saat penolakan!' });

  // ── Laporan ────────────────────────────────────────────────────────────────
  var failed = results.filter(function(r) { return !r.ok; });
  results.forEach(function(r) { Logger.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.ok ? '' : '  → ' + r.detail)); });
  skipped.forEach(function(s) { Logger.log('⏭️  dilewati: ' + s); });
  Logger.log('— ' + (results.length - failed.length) + '/' + results.length + ' lulus, ' + skipped.length + ' dilewati —');
  if (failed.length) throw new Error('T-30 GAGAL: ' + failed.length + ' tes. Lihat log. Pertama: ' + failed[0].label);
  return { passed: results.length, skipped: skipped.length };
}

// =============================================================================
// TestFase3.gs — T-78: uji kuota waktu eksekusi (<6 menit) pada data terbesar.
//
// Jalankan `testWaktuEksekusi` dari editor Apps Script (pemilik saja).
// BACA-SAJA: tidak mengirim Telegram, tidak menulis sheet. Bagian 1 memakai data
// sintetis (murni, tanpa sheet); bagian 2 mengukur pembacaan sheet NYATA.
// Pengiriman Telegram tidak dijalankan; waktunya DIPERKIRAKAN dari jumlah pesan.
// =============================================================================

var _T78_LIMIT_MS_ = 6 * 60 * 1000;      // batas eksekusi Apps Script (akun biasa)
var _T78_FETCH_MS_ = 800;                // asumsi konservatif satu UrlFetch ke Telegram

function _t78_time_(fn) { var t = Date.now(); var r = fn(); return { ms: Date.now() - t, out: r }; }

function _t78_members_(n) {
  var rows = [];
  for (var i = 0; i < n; i++) {
    var r = new Array(15);
    r[0] = 'M-' + i; r[1] = 'Klien ' + i; r[2] = '0812' + ('0000000' + i).slice(-8);
    r[6] = i % 2 ? 'PKG-CORE' : 'PKG-LAIN'; r[8] = 20; r[9] = i % 15; r[10] = ''; r[14] = '';
    rows.push(r);
  }
  return rows;
}

function _t78_schedules_(n, members) {
  var out = [], base = Date.now() + 3600000;
  for (var i = 0; i < n; i++) {
    out.push({ memberId: 'M-' + (i % members), start: new Date(base + i * 3600000).toISOString(), status: 'scheduled' });
  }
  return out;
}

function testWaktuEksekusi() {
  requireOwner_();
  var lines = [], worst = 0, fail = [];
  var chatIds = String(PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_IDS') || '').split(',')
    .map(function(x) { return x.trim(); }).filter(String).length || 1;
  var packages = [{ id: 'PKG-CORE', kategori: 'core' }, { id: 'PKG-LAIN', kategori: 'lain' }];

  // ── 1. Data sintetis: bagian murni (pools → core → digest → tombol) ─────────
  [200, 500, 1000, 2000].forEach(function(n) {
    var members = _t78_members_(n), sched = _t78_schedules_(n * 3, n);
    var a = _t78_time_(function() { return _buildClientPools_(members, sched, new Date()); });
    var b = _t78_time_(function() { return _filterCoreClients_(a.out.active, packages); });
    var core = b.out && b.out.clients ? b.out.clients : (b.out || []);
    var c = _t78_time_(function() { return _buildMakanDigest_(core, 'pagi', 'Tip uji', 0); });
    var msgs = c.out ? Math.ceil(c.out.buttons.length / TELEGRAM_BUTTONS_PER_MESSAGE) : 0;
    // Perkiraan kirim: satu fetch per pesan per chat + jeda antar pesan (T-78).
    var sendMs = msgs * chatIds * _T78_FETCH_MS_ + Math.max(0, msgs - 1) * TELEGRAM_CHUNK_GAP_MS;
    var cpu = a.ms + b.ms + c.ms;
    worst = Math.max(worst, cpu + sendMs);
    lines.push(n + ' klien (' + core.length + ' core): olah ' + cpu + ' ms, ' + msgs + ' pesan Telegram × ' +
               chatIds + ' chat ≈ ' + Math.round(sendMs / 1000) + ' dtk kirim');
    if (cpu + sendMs > _T78_LIMIT_MS_) fail.push(n + ' klien melewati 6 menit (≈' + Math.round((cpu + sendMs) / 1000) + ' dtk)');
  });

  // ── 2. Sheet NYATA (baca-saja): waktu baca yang dipakai tiap digest ─────────
  var mem = _t78_time_(function() { return _getMemberDataSheet_().getDataRange().getValues().length - 1; });
  var sch = _t78_time_(function() { return _getSchedulesAll_().length; });
  var pl = _t78_time_(function() { return getPriceList().length; });
  var tk = _t78_time_(function() { return _tasksSheet_().getLastRow() - 1; });
  lines.push('Sheet nyata: MemberData ' + mem.out + ' baris ' + mem.ms + ' ms · Schedules ' + sch.out + ' ' + sch.ms +
             ' ms · PriceList ' + pl.out + ' ' + pl.ms + ' ms · Tasks ' + tk.out + ' ' + tk.ms + ' ms');
  var readMs = mem.ms + sch.ms + pl.ms + tk.ms;
  lines.push('Total baca sheet satu digest ≈ ' + readMs + ' ms');
  if (readMs > 60000) fail.push('baca sheet > 60 dtk (' + readMs + ' ms)');

  // ── 3. Lock: digest memegang ScriptLock selama berjalan ─────────────────────
  lines.push('Catatan: runReminderTick memegang ScriptLock selama digest; addTask/updateTask memakai lock yang sama ' +
             '(tunggu 10 dtk). Digest terlama di atas ≈ ' + Math.round(worst / 1000) + ' dtk.');
  if (worst > 10000) lines.push('⚠️ Jika Coach menyimpan PR saat digest berjalan, bisa muncul "Server sedang sibuk".');

  lines.forEach(function(l) { Logger.log(l); });
  Logger.log(fail.length ? '❌ ' + fail.join(' | ') : '✅ semua ukuran di bawah 6 menit');
  if (fail.length) throw new Error('T-78 GAGAL: ' + fail[0]);
  return { worstMs: worst, readMs: readMs };
}