// Demo runtime (browser). build-demo.js inlines this file into demo/*.html with the
// real server code (src/*.gs) in place of __GS__. One page, two views: /demo/ is the
// coach panel, /demo/?klien the client portal (the pill at the top switches).
// The Google services are faked in memory (a browser port of tests/harness.js) and
// google.script.run calls the server functions directly, so the demo needs no
// Google account and never touches the real data. Everything resets on reload.
(function () {
  'use strict';
  var MODE = /[?&](klien|view=public)\b/.test(location.search) ? 'public' : 'admin';
  var DEMO_PIN = '123456';
  var DEMO_KEY = 'd'.repeat(32);    // link key of the demo client (Sari)

  // ── Bytes, SHA-256, HMAC (sync, like Utilities) ───────────────────────────
  var enc = new TextEncoder(), dec = new TextDecoder();
  function bytes(data) {
    if (Array.isArray(data)) return Uint8Array.from(data, function (b) { return b < 0 ? b + 256 : b; });
    if (data instanceof Uint8Array) return data;
    return enc.encode(data == null ? '' : String(data));
  }
  function signed(u8) { return Array.from(u8, function (b) { return b > 127 ? b - 256 : b; }); }
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(msg) {
    var l = msg.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n), dv = new DataView(m.buffer);
    m.set(msg); m[l] = 0x80; dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    var r = function (x, c) { return (x >>> c) | (x << (32 - c)); };
    for (var o = 0; o < n; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(function (x) { return x | 0; });
    }
    var out = new Uint8Array(32), ov = new DataView(out.buffer);
    H.forEach(function (x, i) { ov.setUint32(i * 4, x >>> 0); });
    return out;
  }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    var k = new Uint8Array(64); k.set(key);
    var ip = k.map(function (x) { return x ^ 0x36; }), op = k.map(function (x) { return x ^ 0x5c; });
    var inner = new Uint8Array(64 + msg.length); inner.set(ip); inner.set(msg, 64);
    var outer = new Uint8Array(96); outer.set(op); outer.set(sha256(inner), 64);
    return sha256(outer);
  }
  function b64(u8) { var s = ''; u8.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(String(s)), function (c) { return c.charCodeAt(0); }); }

  // ── Spreadsheet (same model as tests/harness.js) ──────────────────────────
  function colToIndex(letters) { var n = 0; for (var ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function Range(sheet, row, col, numRows, numCols) { this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows; this.numCols = numCols; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var r = 0; r < this.numRows; r++) {
      var src = this.sheet.rows[this.row - 1 + r] || [], line = [];
      for (var c = 0; c < this.numCols; c++) { var v = src[this.col - 1 + c]; line.push(v === undefined || v === null ? '' : v); }
      out.push(line);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValues = function (values) { var t = this; values.forEach(function (line, r) { line.forEach(function (v, c) { t.sheet._set(t.row + r, t.col + c, v); }); }); return this; };
  Range.prototype.setValue = function (v) { for (var r = 0; r < this.numRows; r++) for (var c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, v); return this; };
  Range.prototype.clearContent = function () { return this.setValue(''); };
  Range.prototype.setNumberFormat = Range.prototype.setFontWeight = Range.prototype.setBackground = function () { return this; };

  function Sheet(name, rows) { this.name = name; this.rows = (rows || []).map(function (r) { return r.slice(); }); }
  Sheet.prototype = {
    getName: function () { return this.name; },
    getLastRow: function () {
      for (var i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
      return 0;
    },
    getLastColumn: function () { return this.rows.reduce(function (m, r) { return Math.max(m, (r || []).length); }, 0); },
    _set: function (row, col, v) { while (this.rows.length < row) this.rows.push([]); var line = this.rows[row - 1]; while (line.length < col) line.push(''); line[col - 1] = v; },
    getDataRange: function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); },
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') {
        var m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/i);
        var c1 = colToIndex(m[1]), r1 = m[2] ? parseInt(m[2], 10) : 1, c2 = m[3] ? colToIndex(m[3]) : c1;
        var r2 = m[4] ? parseInt(m[4], 10) : (m[2] ? r1 : Math.max(1, this.getLastRow()));
        return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return new Range(this, a, b, c || 1, d || 1);
    },
    appendRow: function (values) { this.rows.splice(this.getLastRow(), 0, values.slice()); return this; },
    deleteRow: function (row) { this.rows.splice(row - 1, 1); },
    insertColumnAfter: function (col) { this.rows.forEach(function (r) { while (r.length < col) r.push(''); r.splice(col, 0, ''); }); },
    insertColumnBefore: function (col) { this.rows.forEach(function (r) { while (r.length < col) r.push(''); r.splice(col - 1, 0, ''); }); },
    insertRowBefore: function (row) { this.rows.splice(row - 1, 0, []); },
    setFrozenRows: function () {}
  };
  function Spreadsheet(id) { this.id = id; this.sheets = []; }
  Spreadsheet.prototype = {
    getId: function () { return this.id; },
    getSheetByName: function (n) { return this.sheets.find(function (s) { return s.name === n; }) || null; },
    getSheets: function () { return this.sheets.slice(); },
    insertSheet: function (n) { var s = new Sheet(n); this.sheets.push(s); return s; },
    seed: function (n, rows) { this.sheets = this.sheets.filter(function (s) { return s.name !== n; }); var s = new Sheet(n, rows); this.sheets.push(s); return s; }
  };

  // ── Other services ────────────────────────────────────────────────────────
  function makeBlob(data, contentType, name) {
    var buf = data === undefined ? new Uint8Array(0) : bytes(data);
    return {
      getBytes: function () { return signed(buf); }, getDataAsString: function () { return dec.decode(buf); },
      getContentType: function () { return contentType || null; }, getName: function () { return name || null; },
      setName: function (x) { name = x; return this; }
    };
  }
  function formatDate(date, tz, fmt) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date(date)).forEach(function (x) { p[x.type] = x.value; });
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var map = { yyyy: p.year, MMM: months[parseInt(p.month, 10) - 1], MM: p.month, dd: p.day, d: String(parseInt(p.day, 10)), HH: p.hour, H: String(parseInt(p.hour, 10)), mm: p.minute, ss: p.second,
      u: String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]) };
    return fmt.replace(/yyyy|MMM|MM|dd|HH|mm|ss|H|d|u/g, function (t) { return map[t]; });
  }

  var ss = new Spreadsheet('DEMO'), props = {}, cache = {}, files = [], triggers = [];
  var folder = function (id, name) {
    return {
      getId: function () { return id; }, getName: function () { return name; }, setTrashed: function () { return this; },
      createFile: function (blob) {
        var fid = 'FILE_' + (files.length + 1);
        var f = { getId: function () { return fid; }, getUrl: function () { return 'https://drive.google.com/file/d/' + fid + '/view'; },
          setSharing: function () { return this; }, setTrashed: function () { return this; }, getBlob: function () { return blob; } };
        files.push(f); return f;
      }
    };
  };
  var services = {
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; }, flush: function () {} },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
      setProperty: function (k, v) { props[k] = String(v); return this; },
      deleteProperty: function (k) { delete props[k]; return this; },
      getProperties: function () { return Object.assign({}, props); }
    }; } },
    CacheService: { getScriptCache: function () { return {
      get: function (k) { var e = cache[k]; if (!e) return null; if (e.expires <= Date.now()) { delete cache[k]; return null; } return e.value; },
      put: function (k, v, ttl) { cache[k] = { value: String(v), expires: Date.now() + (ttl || 600) * 1000 }; },
      getAll: function (keys) { var o = {}, t = this; keys.forEach(function (k) { var v = t.get(k); if (v != null) o[k] = v; }); return o; },
      putAll: function (m, ttl) { var t = this; Object.keys(m).forEach(function (k) { t.put(k, m[k], ttl); }); },
      remove: function (k) { delete cache[k]; }
    }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: function () { return crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(); },
      formatDate: formatDate, sleep: function () {}, newBlob: makeBlob,
      base64Decode: function (s) { return signed(unb64(s)); },
      base64Encode: function (d) { return b64(bytes(d)); },
      base64EncodeWebSafe: function (d) { return b64(bytes(d)).replace(/\+/g, '-').replace(/\//g, '_'); },
      base64DecodeWebSafe: function (s) { return signed(unb64(String(s).replace(/-/g, '+').replace(/_/g, '/'))); },
      computeDigest: function (alg, v) { return signed(sha256(bytes(v))); },
      computeHmacSha256Signature: function (v, key) { return signed(hmac(bytes(key), bytes(v))); }
    },
    Session: {
      getActiveUser: function () { return { getEmail: function () { return ''; } }; },
      getEffectiveUser: function () { return { getEmail: function () { return 'demo@xnk.my.id'; } }; },
      getScriptTimeZone: function () { return 'Asia/Jakarta'; }
    },
    // Nothing leaves the browser: no mail, Telegram or WhatsApp in the demo.
    MailApp: { sendEmail: function () {} },
    UrlFetchApp: { fetch: function () { return { getResponseCode: function () { return 200; }, getContentText: function () { return '{}'; } }; } },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      createFolder: function (n) { return folder('FOLDER_' + n, n); }, getFolderById: function (id) { return folder(id, id); },
      getFileById: function (id) { return files.find(function (f) { return f.getId() === id; }); },
      searchFiles: function () { return { hasNext: function () { return false; } }; }
    },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY' }, getService: function () { return { getUrl: function () { return location.href.split('?')[0]; } }; },
      getProjectTriggers: function () { return triggers.slice(); },
      newTrigger: function (handler) {
        var b = { timeBased: function () { return b; }, everyDays: function () { return b; }, atHour: function () { return b; }, onWeekDay: function () { return b; },
          everyHours: function () { return b; }, inTimezone: function () { return b; },
          create: function () { var t = { getHandlerFunction: function () { return handler; } }; triggers.push(t); return t; } };
        return b;
      },
      deleteTrigger: function (t) { triggers = triggers.filter(function (x) { return x !== t; }); }
    },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' } },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: function (t) { return { setMimeType: function () { return this; }, content: t }; } },
    Logger: { log: function () {} }
  };

  // The server code runs in this function's scope; `server(name)` looks a function up by name.
  var server = new Function(Object.keys(services).join(','), '/*__GS__*/\nreturn function (n) { try { return eval(n); } catch (e) { return undefined; } };')
    .apply(null, Object.keys(services).map(function (k) { return services[k]; }));
  function call(name) {
    var fn = server(name);
    if (typeof fn !== 'function') throw new Error('No server function ' + name);
    var args = JSON.parse(JSON.stringify([].slice.call(arguments, 1)));
    var out = fn.apply(null, args);
    return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
  }

  // ── Demo data ─────────────────────────────────────────────────────────────
  var DAY = 86400000;
  var wibDay = function (d) { return new Date(Date.now() + d * DAY).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); };
  var at = function (d, h) { return new Date(wibDay(d) + 'T' + String(h).padStart(2, '0') + ':00:00+07:00').toISOString(); };
  var dmy = function (d) { var p = wibDay(d).split('-'); return +p[2] + '/' + +p[1] + '/' + p[0]; };   // D/M/YYYY like the sheet

  props.ADMIN_PIN = DEMO_PIN;
  var clients = [
    // id, name, phone, goal, package, total, used, key, joined (days ago)
    ['PT-1', 'Sari Wulandari', '6281200000001', 'Turun berat badan', 'P2', 12, 7, DEMO_KEY, 70],
    ['PT-2', 'Bima Pratama', '6281200000002', 'Tambah massa otot', 'P2', 12, 10, 'e'.repeat(32), 95],
    ['PT-3', 'Dewi Lestari', '6281200000003', 'Kebugaran umum', 'P1', 8, 3, 'f'.repeat(32), 30],
    ['PT-4', 'Raka Aditya', '6281200000004', 'Kekuatan', 'P1', 8, 8, '1'.repeat(32), 120],
    ['PT-5', 'Nadia Putri', '6281200000005', 'Postur & core', 'P3', 4, 1, '2'.repeat(32), 10],
    ['PT-6', 'Fajar Nugroho', '6281200000006', 'Turun berat badan', 'P2', 12, 4, '3'.repeat(32), 40]
  ];
  var pkgName = { P1: 'Regular 8', P2: 'Intensif 12', P3: 'Coba 4' };
  ss.seed('MemberData', [['ID', 'Nama', 'No WA', 'Tujuan (Goal)', 'Tanggal Gabung', 'Foto URL', 'Paket ID Aktif', 'Nama Paket Aktif', 'Total Sesi', 'Sesi Terpakai', 'Coach ID', 'Nama Coach', 'Tanggal Update Terakhir', 'Kunci Link']]
    .concat(clients.map(function (c) { return [c[0], c[1], c[2], c[3], dmy(-c[8]), '', c[4], pkgName[c[4]], c[5], c[6], 'C-1', 'Coach Demo', dmy(-1), c[7]]; })));
  ss.seed('PriceList', [
    ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
    ['P1', 'Regular 8', 'regular', 1200000, 8, '1 Bulan', '8 sesi privat dalam sebulan.', 'Program latihan,Cek progres', true],
    ['P2', 'Intensif 12', 'premium', 1650000, 12, '1 Bulan', '12 sesi privat + panduan gizi.', 'Program latihan,Panduan gizi,Cek progres', true],
    ['P3', 'Coba 4', 'regular', 650000, 4, '2 Minggu', 'Paket coba untuk pemula.', 'Program latihan', true]
  ]);
  ss.seed('Coaches', [['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman'],
    ['C-1', 'Coach Demo', '6281200009999', 'Strength & fat loss', '', 'Coach contoh untuk demo XNK.', '5 Tahun']]);
  var sched = [['ID', 'Member ID', 'Nama Member', 'No WA', 'Waktu Mulai', 'Waktu Selesai', 'Catatan', 'Status', 'Coach ID', 'Nama Coach', 'Completed At', 'Recurring Group ID']];
  var n = 0;
  var addS = function (c, d, h, status, note) {
    var s = at(d, h);
    sched.push(['SCH-' + (++n), c[0], c[1], c[2], s, new Date(Date.parse(s) + 3600000).toISOString(), note || '', status, 'C-1', 'Coach Demo', status === 'completed' ? new Date(Date.parse(s) + 3600000).toISOString() : '', '']);
    return 'SCH-' + n;
  };
  var past = {};
  clients.forEach(function (c, i) {
    past[c[0]] = [];
    for (var k = c[6]; k >= 1; k--) past[c[0]].push(addS(c, -k * 3 - (i % 2), 7 + (i % 4) * 3, 'completed'));
  });
  addS(clients[1], 0, 7, 'completed', 'Upper body');
  addS(clients[0], 0, 17, 'read', 'Lower body + cardio');
  addS(clients[2], 0, 19, 'unread');
  addS(clients[0], 2, 17, 'read');
  addS(clients[1], 1, 7, 'read');
  addS(clients[5], 1, 18, 'unread');
  addS(clients[4], 3, 9, 'read');
  addS(clients[0], 5, 17, 'read');
  ss.seed('Schedules', sched);
  ss.seed('Members', [['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan', 'Harga']]
    .concat(clients.map(function (c, i) { return ['T' + (i + 1), c[0], dmy(-Math.min(c[8], 25 - i * 3)), i % 2 ? 'Perpanjang' : 'Baru', c[4], pkgName[c[4]], c[5], 'C-1', 'Coach Demo', '', { P1: 1200000, P2: 1650000, P3: 650000 }[c[4]]]; })));

  var token = call('adminLogin', DEMO_PIN).token;
  var seed = function (name) {   // a failing seed step only loses that bit of sample data
    try { return call.apply(null, arguments); } catch (e) { console.warn('[demo seed]', name, e.message); }
  };
  seed('saveContent', token, { tipe: 'pengumuman', judul: 'Selamat datang di demo XNK', isi: 'Semua data di sini contoh dan kembali seperti awal saat halaman dimuat ulang.', sematkan: true });
  seed('saveContent', token, { tipe: 'tips', judul: 'Minum cukup air', isi: 'Targetkan 2–3 liter air sehari, lebih banyak di hari latihan.', kategori: 'Nutrisi' });
  seed('saveContent', token, { tipe: 'tips', judul: 'Tidur 7–8 jam', isi: 'Otot pulih saat tidur. Jaga jam tidur tetap sama tiap hari.', kategori: 'Pemulihan' });
  var program = '# Hari A — Lower\nSquat | 4x8 | turun pelan\nRomanian deadlift | 3x10\nLunges | 3x12\nPlank | 3x45 detik\n\n# Hari B — Upper\nBench press | 4x8\nLat pulldown | 3x10\nShoulder press | 3x10\nSeated row | 3x12';
  clients.slice(0, 3).forEach(function (c) { seed('saveMemberProgram', token, c[0], program); });
  // Measurements, workouts and session notes for the first clients, spread over the last weeks.
  clients.slice(0, 4).forEach(function (c, i) {
    var w0 = [78, 70, 62, 82][i];
    for (var k = 8; k >= 0; k--) seed('saveMemberMeasurement', token, c[0], { tanggal: wibDay(-k * 7), berat: Math.round((w0 - (8 - k) * (i === 1 ? -0.3 : 0.45)) * 10) / 10, pinggang: Math.round(90 - i * 4 - (8 - k) * 0.6) });
    for (k = 9; k >= 1; k--) {
      var lower = k % 2;
      var base = (i === 1 ? 60 : 35) + (9 - k) * 2.5;
      var entries = lower
        ? [{ gerakan: 'Squat', bodyPart: 'upper legs', sets: [{ berat: base, rep: 8 }, { berat: base, rep: 8 }, { berat: base + 2.5, rep: 6 }] },
          { gerakan: 'Romanian deadlift', bodyPart: 'upper legs', sets: [{ berat: base - 5, rep: 10 }, { berat: base - 5, rep: 10 }] }]
        : [{ gerakan: 'Bench press', bodyPart: 'chest', sets: [{ berat: base - 10, rep: 8 }, { berat: base - 10, rep: 8 }, { berat: base - 7.5, rep: 6 }] },
          { gerakan: 'Lat pulldown', bodyPart: 'back', sets: [{ berat: base - 5, rep: 10 }, { berat: base - 5, rep: 10 }] }];
      seed('saveWorkoutLog', token, c[0], wibDay(-k * 3), '', entries, { mulai: at(-k * 3, 17), selesai: at(-k * 3, 18), rasa: 4 });
    }
    var last = past[c[0]][past[c[0]].length - 1];
    if (last) seed('saveSessionNote', token, last, { dilatih: 'Squat & deadlift, teknik makin rapi', fokus: 'Naikkan beban squat 2,5 kg', rpe: 8, pribadi: 'Lutut kanan sedikit masuk, ingatkan.' });
  });
  var sari = call('memberLoginByKey', DEMO_KEY).token;
  seed('saveMyNutritionProfile', sari, { tinggi: '162', jk: 'P', goal: 'turun', pantangan: [], anggaran: 'standar', birthDate: '1995-05-12' });
  seed('logMyFood', sari, { waktu: 'sarapan', custom: { nama: 'Oatmeal pisang', kal: 320 }, jumlah: 1 });
  seed('logMyFood', sari, { waktu: 'siang', custom: { nama: 'Nasi + ayam bakar + sayur', kal: 560 }, jumlah: 1 });

  // ── google.script.* for the app ──────────────────────────────────────────
  var params = {};
  new URLSearchParams(location.search).forEach(function (v, k) { params[k] = v; });
  if (MODE === 'public') { params.view = 'public'; if (!params.k) params.k = DEMO_KEY; }
  var runner = function (ok, fail) {
    return new Proxy({}, { get: function (_, prop) {
      if (prop === 'withSuccessHandler') return function (fn) { return runner(fn, fail); };
      if (prop === 'withFailureHandler') return function (fn) { return runner(ok, fn); };
      if (prop === 'withUserObject') return function () { return runner(ok, fail); };
      return function () {
        var args = arguments;
        setTimeout(function () {   // async like the real thing
          var res, err;
          try { res = call.apply(null, [prop].concat([].slice.call(args))); } catch (e) { err = e; }
          if (err) { if (fail) fail(err); } else if (ok) ok(res);
        }, 60);
      };
    } });
  };
  window.google = { script: { run: runner(null, null), url: { getLocation: function (cb) { setTimeout(function () { cb({ parameter: params, hash: '' }); }, 0); } } } };

  // Fresh device state each load: drop the app's own copies, then sign in.
  try {
    Object.keys(localStorage).forEach(function (k) { if (/^xnk_/.test(k) && k !== 'xnk_theme') localStorage.removeItem(k); });
    if (MODE === 'admin') localStorage.setItem('xnk_admin_token', token);
  } catch (e) {}

  // Pill at the top: which view this is, and a switch to the other (a reload, so data starts fresh).
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    var tab = function (label, href, on) {
      return '<a href="' + href + '" style="color:#fff;text-decoration:none;padding:6px 10px;border-radius:999px;' + (on ? 'background:rgba(0,0,0,.35)' : 'opacity:.8') + '">' + label + '</a>';
    };
    b.innerHTML = '<span style="padding:0 6px 0 8px">DEMO</span>' + tab('Coach', './', MODE === 'admin') + tab('Klien', './?klien', MODE === 'public');
    b.title = MODE === 'admin' ? 'PIN demo ' + DEMO_PIN + ' · data contoh, kembali seperti awal saat dimuat ulang' : 'Klien contoh Sari (WA 081200000001) · data contoh';
    b.setAttribute('style', 'position:fixed;top:calc(var(--sa-t,0px) + 6px);left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:2px;' +
      'background:#e11d48;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:3px;white-space:nowrap;border-radius:999px;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,.25)');
    document.body.appendChild(b);
  });
})();
