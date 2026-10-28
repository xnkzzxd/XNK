/*
 * XNK — layar "Catat offline" di halaman pembungkus (GitHub Pages).
 * Satu sumber untuk xnk.my.id (coach) dan book.xnkbooking.my.id (klien); salinannya di BookingPT-Client dibuat
 * oleh apps-script/pt-scheduler/tools/sync-offline.js. Jangan ubah salinan itu langsung.
 *
 * Aplikasi (Apps Script, di iframe) mengirim salinan kecil lewat postMessage ("offline-snap"): nama depan, rutinitas,
 * set terakhir, target & catatan makan hari ini, jadwal, progres terakhir. Tanpa token dan tanpa nomor WA.
 * Saat tanpa sinyal, halaman ini menampilkan salinan itu dan menyimpan catatan baru di antrean (xnk_off_queue).
 * Begitu aplikasi terbuka lagi, ia meminta antrean ("offline-queue?"), memasukkannya ke antreannya sendiri
 * (dikirim ke server dengan cid, jadi tidak pernah dobel), lalu membalas "offline-ack".
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var MODE = (script && script.getAttribute('data-mode')) === 'coach' ? 'coach' : 'client';
  var SNAP_KEY = 'xnk_off_snap', Q_KEY = 'xnk_off_queue';
  var EX_URL = 'https://xnk.my.id/exercises/exercises.min.json', FOOD_URL = 'https://xnk.my.id/foods/foods.min.json';
  var MEALS = [['sarapan', 'Sarapan'], ['siang', 'Makan siang'], ['malam', 'Makan malam'], ['camilan', 'Camilan']];
  var MAX_DAYS = 30, WARN_DAYS = 25;
  // Sama dengan PROGRESS_MEASURES di server (subset yang paling sering dicatat).
  var MEASURES = [['berat', 'Berat', 'kg'], ['pinggang', 'Pinggang', 'cm'], ['perut', 'Perut', 'cm'], ['dada', 'Dada', 'cm'], ['lenganKanan', 'Lengan kanan', 'cm'], ['pahaKanan', 'Paha kanan', 'cm']];

  function ls(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null');
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wib(ms) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ms || Date.now())); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function daysAgo(iso) { return Math.round((Date.parse(wib() + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z')) / 86400000); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; }
  function fmtTime(iso) { try { return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }
  function snap() { var s = ls(SNAP_KEY); return s && s.mode === MODE ? s : null; }
  function queue() { var q = ls(Q_KEY); return Array.isArray(q) ? q : []; }
  function setQueue(q) { ls(Q_KEY, q.length ? q : null); }
  function push(item) { var s = snap(); item.sig = s ? s.sig : ''; item.at = Date.now(); var q = queue(); q.push(item); setQueue(q); }

  // ── Pustaka (dari cache service worker; boleh tidak ada) ──────────────────────
  var lib = { ex: null, food: null };
  function loadLib(name, url) {
    if (lib[name]) return Promise.resolve(lib[name]);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); }).then(function (d) { lib[name] = d; return d; }).catch(function () { return null; });
  }

  // ── Jembatan dengan aplikasi (dipanggil oleh index.html untuk pesan dari *.googleusercontent.com) ─────
  function message(e) {
    var d = e.data || {};
    if (d.xnk === 'offline-snap' && d.snap && d.snap.mode === MODE) {
      var s = d.snap; s.savedAt = Date.now(); ls(SNAP_KEY, s);
      if (state.open) render();
    } else if (d.xnk === 'offline-queue?') {
      try { e.source.postMessage({ xnk: 'offline-queue', items: queue() }, e.origin); } catch (err) {}
    } else if (d.xnk === 'offline-ack' && Array.isArray(d.ids)) {
      setQueue(queue().filter(function (x) { return d.ids.indexOf(x.id) === -1; }));
      if (state.open) render();
    } else if (d.xnk === 'offline-clear') {
      ls(SNAP_KEY, null); ls(Q_KEY, null);
      if (state.open) render();
    }
  }

  // ── Tampilan ───────────────────────────────────────────────────────────────
  var state = { open: false, tab: MODE === 'coach' ? 'jadwal' : 'latihan', client: '', wl: null, food: { waktu: 'siang', q: '', pick: null, gram: '', own: false }, msg: '' };
  var root = null;
  function el() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'xoff'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Catat offline');
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onInput);
    document.body.appendChild(root);
    return root;
  }
  function show() { state.open = true; el().hidden = false; document.documentElement.classList.add('xoff-on'); render(); hideOffer(); }
  function hide() { state.open = false; if (root) root.hidden = true; document.documentElement.classList.remove('xoff-on'); }
  var offer = null;
  function offerButton() {
    if (state.open || offer) return;
    offer = document.createElement('button');
    offer.type = 'button'; offer.id = 'xoff-offer'; offer.textContent = 'Catat offline';
    offer.addEventListener('click', show);
    document.body.appendChild(offer);
  }
  function hideOffer() { if (offer) { offer.remove(); offer = null; } }

  function head(s) {
    var q = queue(), old = q.filter(function (x) { return x.date && daysAgo(x.date) >= WARN_DAYS; }).length;
    return '<header class="xoff-head"><div><b>Offline</b> · catatan disimpan di HP' +
      '<small>' + (s ? 'Data per ' + h(fmtTime(new Date(s.savedAt || s.at).toISOString())) : 'Belum ada salinan dari aplikasi') + (q.length ? ' · ' + q.length + ' menunggu sinyal' : '') + '</small></div>' +
      '<button type="button" class="xoff-btn" data-act="reconnect">Sambung lagi</button></header>' +
      (old ? '<p class="xoff-warn">Ada catatan yang hampir ' + MAX_DAYS + ' hari. Buka aplikasi dengan sinyal supaya tersimpan.</p>' : '') +
      (state.msg ? '<p class="xoff-msg" role="status">' + h(state.msg) + '</p>' : '');
  }
  function tabs(list) {
    return '<nav class="xoff-tabs" role="tablist">' + list.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (state.tab === t[0]) + '" class="' + (state.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>';
  }
  function render() {
    if (!root) return;
    var s = snap(), html = head(s);
    if (state.wl) html += loggerHtml(s);
    else if (MODE === 'client') {
      html += tabs([['latihan', 'Latihan'], ['makan', 'Makan'], ['jadwal', 'Jadwal'], ['progres', 'Progres']]);
      html += '<main class="xoff-body">' + ({ latihan: clientWorkout, makan: clientFood, jadwal: clientSchedule, progres: clientProgress }[state.tab] || clientWorkout)(s) + '</main>';
    } else {
      html += coachHtml(s);
    }
    root.innerHTML = html;
  }

  // Klien ───────────────────────────────────────────────────────────────────
  function pendingList(kind, filter) {
    return queue().filter(function (x) { return x.kind === kind && (!filter || filter(x)); });
  }
  function routinesHtml(routines, who) {
    var html = '<button type="button" class="xoff-btn xoff-primary xoff-block" data-act="wl-start" data-r="-1">Mulai latihan kosong</button>';
    (routines || []).forEach(function (r, i) {
      html += '<div class="xoff-card"><b>' + h(r.hari) + '</b><small>' + h(r.items.map(function (x) { return x.gerakan; }).join(', ')) + '</small>' +
        '<button type="button" class="xoff-btn xoff-primary" data-act="wl-start" data-r="' + i + '"' + (who ? ' data-who="' + h(who) + '"' : '') + '>Mulai</button></div>';
    });
    return html;
  }
  function pendingWorkouts(memberId) {
    var p = pendingList('wl', function (x) { return !memberId || x.memberId === memberId; });
    return p.length ? '<p class="xoff-label">Menunggu sinyal</p>' + p.map(function (x) {
      return '<div class="xoff-row"><span>' + h(x.date) + ' · ' + h(x.hari || 'Latihan bebas') + ' · ' + x.entries.length + ' gerakan</span><button type="button" class="xoff-link" data-act="del-q" data-id="' + h(x.id) + '">Hapus</button></div>';
    }).join('') : '';
  }
  function clientWorkout(s) {
    return pendingWorkouts('') + '<p class="xoff-label">Rutinitas</p>' + routinesHtml(s && s.routines);
  }
  function foodView(e) {
    if (e.custom) {
      var n = Math.max(0.1, Math.min(20, num(e.jumlah) || 1)), c = e.custom;
      return { nama: c.nama, porsi: r1(n) + ' porsi', kal: Math.round((num(c.kal) || 0) * n), p: r1((num(c.p) || 0) * n), l: r1((num(c.l) || 0) * n), k: r1((num(c.k) || 0) * n), waktu: e.waktu };
    }
    var f = lib.food && lib.food.items.filter(function (x) { return x.id === e.id; })[0];
    if (!f) return { nama: e.nama || 'Makanan', porsi: e.gram + ' g', kal: 0, p: 0, l: 0, k: 0, waktu: e.waktu };
    var x = e.gram / 100;
    return { nama: f.n, porsi: r1(e.gram / f.por[0][1]) + ' ' + f.por[0][0].replace(/^1 /, ''), kal: Math.round(f.kal * x), p: r1(f.p * x), l: r1(f.l * x), k: r1(f.k * x), waktu: e.waktu };
  }
  function clientFood(s) {
    var today = wib(), log = s && s.log && s.log.tanggal === today ? s.log.items : [];
    var pend = pendingList('food', function (x) { return x.entry.tanggal === today; });
    var items = log.map(function (x) { return Object.assign({ sent: true }, x); }).concat(pend.map(function (x) { return Object.assign({ qid: x.id }, x.view); }));
    var kal = items.reduce(function (a, x) { return a + (x.kal || 0); }, 0), t = s && s.target;
    var html = '<div class="xoff-card xoff-stat"><b>' + kal + '</b><small>kkal dimakan' + (t && t.kal ? ' · target ' + t.kal : '') + '</small></div>';
    MEALS.forEach(function (m) {
      var its = items.filter(function (x) { return x.waktu === m[0]; });
      html += '<div class="xoff-meal"><div class="xoff-row"><b>' + m[1] + '</b><button type="button" class="xoff-btn" data-act="food-add" data-w="' + m[0] + '">+ Tambah</button></div>' +
        its.map(function (x) {
          return '<div class="xoff-row"><span>' + h(x.nama) + ' <small>' + h(x.porsi) + ' · ' + (x.kal || 0) + ' kkal' + (x.qid ? ' · belum terkirim' : '') + '</small></span>' +
            (x.qid ? '<button type="button" class="xoff-link" data-act="del-q" data-id="' + h(x.qid) + '">Hapus</button>' : '') + '</div>';
        }).join('') + '</div>';
    });
    if (state.food.adding) html += foodAddHtml(s);
    return html;
  }
  function foodAddHtml(s) {
    var f = state.food, html = '<div class="xoff-sheet"><p class="xoff-label">Tambah · ' + h((MEALS.filter(function (m) { return m[0] === f.waktu; })[0] || [])[1]) + '</p>';
    if (f.own) {
      html += field('Nama makanan', 'own-n', 'text') + field('Kalori (kkal)', 'own-kal', 'decimal') + field('Protein (g)', 'own-p', 'decimal') + field('Jumlah porsi', 'own-j', 'decimal', '1') +
        '<div class="xoff-actions"><button type="button" class="xoff-btn" data-act="food-cancel">Batal</button><button type="button" class="xoff-btn xoff-primary" data-act="food-own-save">Simpan</button></div>';
    } else if (f.pick) {
      var p = f.pick;
      html += '<b>' + h(p.n) + '</b>' + field('Gram (' + h(p.por[0][0]) + ' = ' + p.por[0][1] + ' g)', 'gram', 'decimal', String(f.gram || p.por[0][1])) +
        '<div class="xoff-actions"><button type="button" class="xoff-btn" data-act="food-back">Kembali</button><button type="button" class="xoff-btn xoff-primary" data-act="food-pick-save">Simpan</button></div>';
    } else {
      html += '<input class="xoff-input" id="xoff-q" type="search" placeholder="Cari makanan" value="' + h(f.q) + '" autocomplete="off">';
      var list = [];
      if (lib.food) { var q = f.q.trim().toLowerCase(); list = lib.food.items.filter(function (x) { return !q || x.n.toLowerCase().indexOf(q) !== -1; }).slice(0, 25); }
      else html += '<p class="xoff-note">Daftar makanan belum tersimpan di HP ini. Pakai "Makanan sendiri".</p>';
      html += list.map(function (x) { return '<button type="button" class="xoff-item" data-act="food-pick" data-id="' + h(x.id) + '">' + h(x.n) + ' <small>' + x.kal + ' kkal / 100 g</small></button>'; }).join('') +
        '<div class="xoff-actions"><button type="button" class="xoff-btn" data-act="food-cancel">Batal</button><button type="button" class="xoff-btn" data-act="food-own">Makanan sendiri</button></div>';
    }
    return html + '</div>';
  }
  function field(label, id, mode, val) {
    return '<label class="xoff-field"><span>' + h(label) + '</span><input class="xoff-input" id="xoff-' + id + '" type="text"' + (mode === 'decimal' ? ' inputmode="decimal"' : '') + ' value="' + h(val || '') + '"></label>';
  }
  function clientSchedule(s) {
    var ses = (s && s.sessions) || [];
    return '<div class="xoff-card xoff-stat"><b>' + (s && s.sisa != null && s.sisa !== '' ? h(s.sisa) : '–') + '</b><small>sisa sesi</small></div>' +
      '<p class="xoff-label">Jadwal mendatang</p>' + (ses.length ? ses.map(function (x) { return '<div class="xoff-row"><span>' + h(fmtTime(x.start)) + (x.coach ? ' · ' + h(x.coach) : '') + '</span></div>'; }).join('') : '<p class="xoff-note">Belum ada jadwal.</p>') +
      '<p class="xoff-note">Booking dan ubah jadwal butuh sinyal.</p>';
  }
  function measuresHtml(m) {
    if (!m || !m.length) return '<p class="xoff-note">Belum ada catatan ukuran.</p>';
    var last = m[m.length - 1], prev = m.length > 1 ? m[m.length - 2] : null, keys = MEASURES;
    return '<p class="xoff-label">Terakhir · ' + h(last.tanggal) + '</p>' + keys.filter(function (k) { return last[k[0]] !== '' && last[k[0]] != null; }).map(function (k) {
      var d = prev && prev[k[0]] !== '' && prev[k[0]] != null ? r1(last[k[0]] - prev[k[0]]) : null;
      return '<div class="xoff-row"><span>' + k[1] + '</span><b>' + h(last[k[0]]) + ' ' + k[2] + (d ? ' <small>(' + (d > 0 ? '+' : '') + d + ')</small>' : '') + '</b></div>';
    }).join('');
  }
  function clientProgress(s) { return measuresHtml(s && s.measures) + '<p class="xoff-note">Catat ukuran baru saat ada sinyal.</p>'; }

  // Coach ───────────────────────────────────────────────────────────────────
  function coachHtml(s) {
    var cl = (s && s.clients) || {};
    if (state.client && cl[state.client]) {
      var c = cl[state.client];
      var html = '<button type="button" class="xoff-link" data-act="client-back">‹ Jadwal</button><h2 class="xoff-title">' + h(c.name) + '</h2>' +
        tabs([['latihan', 'Latihan'], ['ukuran', 'Ukuran'], ['catatan', 'Catatan sesi']]) + '<main class="xoff-body">';
      if (state.tab === 'ukuran') {
        html += measuresHtml(c.measures) + '<div class="xoff-sheet">' + MEASURES.map(function (k) { return field(k[1] + ' (' + k[2] + ')', 'm-' + k[0], 'decimal'); }).join('') +
          '<div class="xoff-actions"><button type="button" class="xoff-btn xoff-primary" data-act="measure-save">Simpan ukuran</button></div></div>' +
          pendingList('measure', function (x) { return x.memberId === state.client; }).map(function (x) { return '<div class="xoff-row"><span>' + h(x.data.tanggal) + ' · menunggu sinyal</span><button type="button" class="xoff-link" data-act="del-q" data-id="' + h(x.id) + '">Hapus</button></div>'; }).join('');
      } else if (state.tab === 'catatan') {
        var ses = ((s && s.today) || []).filter(function (x) { return x.memberId === state.client && x.start.slice(0, 10) <= wib() && wib(Date.parse(x.start)) === wib(); });
        html += ses.length ? ses.map(function (x) {
          return '<div class="xoff-sheet"><p class="xoff-label">Sesi ' + h(fmtTime(x.start)) + '</p>' + field('Yang dilatih', 'n-dilatih-' + x.id, 'text') + field('Fokus berikutnya', 'n-fokus-' + x.id, 'text') + field('RPE (1–10)', 'n-rpe-' + x.id, 'decimal') + field('Catatan pribadi', 'n-pribadi-' + x.id, 'text') +
            '<div class="xoff-actions"><button type="button" class="xoff-btn xoff-primary" data-act="note-save" data-sid="' + h(x.id) + '">Simpan catatan</button></div></div>';
        }).join('') : '<p class="xoff-note">Tidak ada sesi klien ini hari ini.</p>';
      } else {
        html += pendingWorkouts(state.client) + '<p class="xoff-label">Program</p>' + routinesHtml(c.routines, state.client);
      }
      return html + '</main>';
    }
    var today = ((s && s.today) || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var html2 = '<main class="xoff-body"><p class="xoff-label">Jadwal hari ini & besok</p>' + (today.length ? today.map(function (x) {
      return '<button type="button" class="xoff-item" data-act="client" data-id="' + h(x.memberId) + '"' + (cl[x.memberId] ? '' : ' disabled') + '>' + h(fmtTime(x.start)) + ' · <b>' + h(x.name) + '</b></button>';
    }).join('') : '<p class="xoff-note">Tidak ada jadwal.</p>');
    var others = Object.keys(cl).filter(function (id) { return !today.some(function (x) { return x.memberId === id; }); });
    if (others.length) html2 += '<p class="xoff-label">Klien lain</p>' + others.map(function (id) { return '<button type="button" class="xoff-item" data-act="client" data-id="' + h(id) + '">' + h(cl[id].name) + '</button>'; }).join('');
    return html2 + '</main>';
  }

  // Logger latihan (klien dan coach) ─────────────────────────────────────────
  function startWorkout(routine, memberId) {
    var s = snap(), last = (memberId ? (s.clients[memberId] || {}).last : s && s.last) || {};
    var key = function (it) { return it.exId ? 'ex:' + it.exId : 'nm:' + String(it.gerakan).trim().toLowerCase(); };
    state.wl = { memberId: memberId || '', hari: routine ? routine.hari : '', start: Date.now(), entries: (routine ? routine.items : []).map(function (it, i) {
      var l = last[key(it)], sets = l && l.sets && l.sets.length ? l.sets.filter(function (x) { return x.jenis !== 'w'; }).map(function (x) { return { berat: x.berat, rep: x.rep, done: false }; }) : [{ berat: '', rep: '', done: false }];
      return { n: i + 1, hari: routine.hari, exId: it.exId || '', gerakan: it.gerakan, bodyPart: it.bodyPart || '', target: it.target || '', sets: sets.length ? sets : [{ berat: '', rep: '', done: false }] };
    }), q: '' };
    loadLib('ex', EX_URL).then(function () { if (state.wl) render(); });
    render();
  }
  function loggerHtml() {
    var w = state.wl, html = '<main class="xoff-body"><h2 class="xoff-title">' + h(w.hari || 'Latihan bebas') + '</h2>';
    w.entries.forEach(function (e, i) {
      html += '<div class="xoff-card xoff-ex"><div class="xoff-row"><b>' + h(e.gerakan) + '</b><button type="button" class="xoff-link" data-act="ex-del" data-i="' + i + '">Hapus</button></div>' +
        '<div class="xoff-set xoff-set-h"><span>Set</span><span>Kg</span><span>Rep</span><span>✓</span></div>' +
        e.sets.map(function (st, j) {
          return '<div class="xoff-set"><span>' + (j + 1) + '</span><input class="xoff-input" inputmode="decimal" data-set="' + i + ':' + j + ':berat" value="' + h(st.berat) + '" aria-label="Berat set ' + (j + 1) + '">' +
            '<input class="xoff-input" inputmode="numeric" data-set="' + i + ':' + j + ':rep" value="' + h(st.rep) + '" aria-label="Rep set ' + (j + 1) + '">' +
            '<input type="checkbox" class="xoff-check" data-set="' + i + ':' + j + ':done"' + (st.done ? ' checked' : '') + ' aria-label="Selesai set ' + (j + 1) + '"></div>';
        }).join('') + '<button type="button" class="xoff-link" data-act="set-add" data-i="' + i + '">+ Set</button></div>';
    });
    html += '<input class="xoff-input" id="xoff-exq" type="search" placeholder="Tambah gerakan (cari atau ketik nama)" value="' + h(w.q) + '" autocomplete="off">';
    if (w.q.trim()) {
      var q = w.q.trim().toLowerCase(), hits = lib.ex ? lib.ex.items.filter(function (x) { return x.n.toLowerCase().indexOf(q) !== -1; }).slice(0, 15) : [];
      html += hits.map(function (x) { return '<button type="button" class="xoff-item" data-act="ex-add" data-id="' + h(x.id) + '">' + h(x.n) + '</button>'; }).join('') +
        '<button type="button" class="xoff-item" data-act="ex-add" data-id="">+ "' + h(w.q.trim()) + '"</button>';
    }
    return html + '<div class="xoff-actions"><button type="button" class="xoff-btn" data-act="wl-cancel">Batal</button><button type="button" class="xoff-btn xoff-primary" data-act="wl-finish">Selesai</button></div></main>';
  }
  function finishWorkout() {
    var w = state.wl, entries = [];
    w.entries.forEach(function (e) {
      var sets = e.sets.filter(function (st) { return st.done && (st.berat !== '' || st.rep !== ''); }).map(function (st) { return { berat: st.berat === '' ? '' : num(st.berat), rep: st.rep === '' ? '' : Math.round(num(st.rep)), durasi: '', jarak: '', rpe: '', jenis: '' }; });
      if (sets.some(function (st) { return (st.berat !== '' && !(st.berat >= 0 && st.berat <= 500)) || (st.rep !== '' && !(st.rep >= 0 && st.rep <= 999)); })) throw new Error(e.gerakan + ': angka tidak valid.');
      if (sets.length) entries.push({ n: e.n || '', hari: e.hari || '', exId: e.exId, gerakan: e.gerakan, bodyPart: e.bodyPart, target: e.target, catatan: '', sets: sets });
    });
    if (!entries.length) throw new Error('Centang minimal satu set dulu.');
    var id = uid('wl'), now = Date.now();
    var s = snap(), name = w.memberId && s && s.clients[w.memberId] ? s.clients[w.memberId].name : '';
    push({ id: id, kind: 'wl', memberId: w.memberId, name: name, date: wib(w.start), hari: w.hari, entries: entries,
      session: { cid: id, hari: w.hari, mulai: new Date(w.start).toISOString(), selesai: new Date(now).toISOString(), rasa: '', catatan: '' } });
    state.wl = null; state.msg = 'Latihan disimpan di HP. Dikirim saat aplikasi terbuka dengan sinyal.';
  }

  // ── Kejadian ───────────────────────────────────────────────────────────────
  function val(id) { var x = document.getElementById('xoff-' + id); return x ? x.value.trim() : ''; }
  function onInput(ev) {
    var t = ev.target;
    if (t.id === 'xoff-q') { state.food.q = t.value; keepFocus(t, render); return; }
    if (t.id === 'xoff-exq') { state.wl.q = t.value; keepFocus(t, render); return; }
    var k = t.getAttribute('data-set');
    if (k && state.wl) {
      var p = k.split(':'), st = state.wl.entries[+p[0]].sets[+p[1]];
      if (p[2] === 'done') st.done = t.checked; else { st[p[2]] = t.value; if (ev.type === 'change' && t.value !== '') st.done = true; }
    }
  }
  function keepFocus(t, fn) {
    var id = t.id, pos = t.selectionStart; fn();
    var n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function onClick(ev) {
    var b = ev.target.closest('[data-act],[data-tab]'); if (!b) return;
    var act = b.getAttribute('data-act'), s = snap();
    state.msg = '';
    try {
      if (b.hasAttribute('data-tab')) state.tab = b.getAttribute('data-tab');
      else if (act === 'reconnect') { if (window.XNKOffline.onReconnect) window.XNKOffline.onReconnect(); return; }
      else if (act === 'wl-start') {
        var who = b.getAttribute('data-who') || '', i = +b.getAttribute('data-r');
        var rs = who ? ((s && s.clients[who]) || {}).routines : s && s.routines;
        if (MODE === 'coach' && !who) who = state.client;
        startWorkout(i >= 0 && rs ? rs[i] : null, who); return;
      }
      else if (act === 'wl-cancel') state.wl = null;
      else if (act === 'wl-finish') finishWorkout();
      else if (act === 'set-add') { var e = state.wl.entries[+b.getAttribute('data-i')], l = e.sets[e.sets.length - 1]; e.sets.push({ berat: l ? l.berat : '', rep: l ? l.rep : '', done: false }); }
      else if (act === 'ex-del') state.wl.entries.splice(+b.getAttribute('data-i'), 1);
      else if (act === 'ex-add') {
        var id = b.getAttribute('data-id'), x = id && lib.ex ? lib.ex.items.filter(function (y) { return y.id === id; })[0] : null;
        var name = x ? x.n : state.wl.q.trim();
        if (state.wl.entries.length >= 20) throw new Error('Maksimal 20 gerakan sekali catat.');
        state.wl.entries.push({ n: '', hari: state.wl.hari, exId: x ? x.id : '', gerakan: name.slice(0, 80), bodyPart: x ? x.b || '' : '', target: x ? x.t || '' : '', sets: [{ berat: '', rep: '', done: false }] });
        state.wl.q = '';
      }
      else if (act === 'del-q') setQueue(queue().filter(function (x) { return x.id !== b.getAttribute('data-id'); }));
      else if (act === 'food-add') { state.food = { adding: true, waktu: b.getAttribute('data-w'), q: '', pick: null, own: false }; loadLib('food', FOOD_URL).then(function () { if (state.food.adding) render(); }); }
      else if (act === 'food-cancel') state.food = { adding: false };
      else if (act === 'food-own') state.food.own = true;
      else if (act === 'food-back') state.food.pick = null;
      else if (act === 'food-pick') state.food.pick = lib.food.items.filter(function (y) { return y.id === b.getAttribute('data-id'); })[0] || null;
      else if (act === 'food-pick-save') {
        var g = num(val('gram'));
        if (!(g > 0 && g <= 2000)) throw new Error('Porsi harus antara 1 dan 2000 gram.');
        addFood({ waktu: state.food.waktu, id: state.food.pick.id, gram: Math.round(g * 10) / 10 });
      }
      else if (act === 'food-own-save') {
        var nm = val('own-n'), kal = val('own-kal'), pr = val('own-p');
        if (!nm) throw new Error('Isi nama makanan.');
        if (kal !== '' && !(num(kal) >= 0 && num(kal) <= 3000)) throw new Error('Kalori harus antara 0 dan 3000.');
        if (pr !== '' && !(num(pr) >= 0 && num(pr) <= 500)) throw new Error('Protein harus antara 0 dan 500.');
        addFood({ waktu: state.food.waktu, custom: { nama: nm.slice(0, 60), kal: kal, p: pr, l: '', k: '' }, jumlah: val('own-j') || 1 });
      }
      else if (act === 'client') { state.client = b.getAttribute('data-id'); state.tab = 'latihan'; }
      else if (act === 'client-back') { state.client = ''; state.tab = 'jadwal'; }
      else if (act === 'measure-save') {
        var data = { tanggal: wib() }, any = false;
        MEASURES.forEach(function (m) {
          var k = m[0], v = val('m-' + k); data[k] = v;
          if (v !== '') { any = true; if (!(num(v) > 0 && num(v) < 400)) throw new Error('Angka ukuran tidak valid.'); }
        });
        if (!any) throw new Error('Isi minimal satu ukuran.');
        var mid = uid('ms'); data.cid = mid;
        push({ id: mid, kind: 'measure', memberId: state.client, date: data.tanggal, data: data });
        state.msg = 'Ukuran disimpan di HP.';
      }
      else if (act === 'note-save') {
        var sid = b.getAttribute('data-sid'), rpe = val('n-rpe-' + sid);
        if (rpe !== '' && !(num(rpe) >= 1 && num(rpe) <= 10 && Math.floor(num(rpe)) === num(rpe))) throw new Error('RPE harus bilangan bulat 1 sampai 10.');
        var nid = uid('nt');
        push({ id: nid, kind: 'note', memberId: state.client, scheduleId: sid, date: wib(), data: { dilatih: val('n-dilatih-' + sid), fokus: val('n-fokus-' + sid), rpe: rpe, pribadi: val('n-pribadi-' + sid) } });
        state.msg = 'Catatan sesi disimpan di HP.';
      }
    } catch (err) { state.msg = err.message; }
    render();
  }
  function addFood(e) {
    var id = uid('fq');
    e.cid = id; e.tanggal = wib();
    push({ id: id, kind: 'food', date: e.tanggal, entry: e, view: foodView(e) });
    state.food = { adding: false }; state.msg = 'Dicatat di HP.';
  }

  window.XNKOffline = { mode: MODE, message: message, show: show, hide: hide, offerButton: offerButton, hideOffer: hideOffer, isOpen: function () { return state.open; }, pending: function () { return queue().length; }, onReconnect: null };
})();
