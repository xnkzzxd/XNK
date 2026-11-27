'use strict';
// T-2265: paket dan harga XNK untuk halaman depan xnk.web.id (bagian #harga, isian paket di form daftar, data terstruktur).
// SATU sumber untuk landing. Angkanya HARUS sama dengan PUSAT_TIERS / PUSAT_SETUP di apps-script/xnk-pusat/src/Pusat.gs
// (XNK HQ); tests/hub.test.js membandingkan keduanya. Ubah keduanya bersama bila harga berubah.
// Isi mengikuti "XNK Proposal Coach" (29 Okt 2026), dengan teks yang benar untuk hub hari ini. Keputusan pemilik: halaman depan
// TIDAK menyebut Google atau spreadsheet (tests/hub.test.js memeriksanya); tempat data cukup disebut "tempat data khusus". Akun dan data
// coach dibuatkan pemilik (docs/library/Akun.md), halaman info publik ada di semua paket, notifikasi coach lewat push/email.

const TIERS = [
  {
    key: 'starter', name: 'Starter', bulanan: 149000, tahunan: 1490000, lifetime: 3900000, putus: 2900000,
    limit: '1 coach · sampai 15 klien aktif',
    items: ['Booking & jadwal mandiri oleh klien', 'Mode latihan & rekor', 'Berat & ukuran tubuh', 'Pengingat sesi & booking'],
    fit: 'Untuk PT yang baru mulai merapikan klien.',
  },
  {
    key: 'pro', name: 'Pro', bulanan: 249000, tahunan: 2490000, lifetime: 6900000, putus: 4900000, popular: true,
    limit: '1 coach · klien tanpa batas',
    items: ['Semua di Starter', 'Keuangan & tagihan', 'Gizi & target kalori', 'Foto progres, asesmen, catatan sesi', 'Laporan PDF progres klien', 'Kartu bagikan & template program'],
    fit: 'Untuk PT full-time yang ingin klien bertahan lama.',
  },
  {
    key: 'studio', name: 'Studio', bulanan: 549000, tahunan: 5490000, lifetime: 14900000, putus: 10900000,
    limit: 'Sampai 5 coach · klien tanpa batas',
    items: ['Semua di Pro', 'Banyak coach, klien pilih coach', 'Kelas grup & bagi hasil coach', 'Nama, logo & warna sendiri'],
    fit: 'Untuk tim kecil atau studio privat. Wajib setup Custom.',
  },
];

const SETUP = {
  standar: {
    name: 'Setup Standar', price: 400000, lead: 'Aplikasi siap pakai dengan tampilan XNK.',
    items: ['Aplikasi dan tempat data khusus, kami yang siapkan', 'Impor data klien dari Excel / catatan', 'Atur paket, harga, jam operasional', 'Pelatihan online 1 jam'],
  },
  custom: {
    name: 'Setup Custom', price: 2100000, lead: 'Semua di Standar, plus sesuai permintaan Anda.',
    items: ['Nama, logo & warna brand Anda sendiri', 'Halaman info & booking dengan brand Anda', 'Penyesuaian fitur, teks & tampilan', 'Impor riwayat lama, pelatihan 2 sesi'],
  },
};

// Bayar bulanan: tagihan pertama sebulan setelah aplikasi siap (pemilik mengisi jatuh tempo pertama di XNK HQ).
const FIRST_MONTH_FREE = true;

// Tabel "Bandingkan semua fitur": true = ✓, false = —, teks = isi sel. Urutan kolom = TIERS.
const COMPARE = [
  ['Dasar', [
    ['Panel coach + portal klien', true, true, true],
    ['Klien aktif', '15', 'Tanpa batas', 'Tanpa batas'],
    ['Jumlah coach', '1', '1', 's.d. 5'],
    ['Booking & reschedule mandiri oleh klien', true, true, true],
    ['Jadwal, kalender, sisa sesi otomatis', true, true, true],
    ['Paket & harga, jam operasional', true, true, true],
    ['Halaman info publik (paket, jam kosong, daftar)', true, true, true],
    ['Notifikasi ke coach (push, email, Telegram)', true, true, true],
  ]],
  ['Latihan & progres', [
    ['Mode latihan, timer istirahat, rekor (PR)', true, true, true],
    ['Program latihan per klien', true, true, true],
    ['Program latihan otomatis', false, true, true],
    ['Template program & Jelajahi', false, true, true],
    ['Berat & ukuran tubuh, grafik', true, true, true],
    ['Foto progres privat, rapor tubuh, badge', false, true, true],
    ['Catatan sesi, rating & evaluasi paket', false, true, true],
    ['Asesmen & tes kebugaran', false, true, true],
    ['Laporan PDF progres klien', false, true, true],
  ]],
  ['Bisnis & klien', [
    ['Pengingat WhatsApp siap kirim', 'Sesi & booking', 'Semua jenis', 'Semua jenis'],
    ['Gizi: target kalori, menu, catat makan', false, true, true],
    ['Keuangan: tagihan, pembayaran, laporan, CSV', false, true, true],
    ['Kartu bagikan untuk Instagram', false, true, true],
    ['Info & tips untuk klien', false, true, true],
    ['Banyak coach, klien pilih coach', false, false, true],
    ['Kelas grup & bagi hasil coach', false, false, true],
    ['Nama, logo & warna sendiri', 'Setup Custom', 'Setup Custom', 'Setup Custom'],
    ['Dukungan', 'Jam kerja', 'Prioritas', 'Prioritas + review'],
  ]],
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Rp 149.000" (titik ribuan, tanpa desimal; spasi tak terputus setelah "Rp"). */
function rp(n) { return 'Rp\u00a0' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
/** Ringkas: "Rp 149rb", "Rp 1,49 jt", "Rp 2,1 jt", "Rp 14,9 jt" (spasi sebelum "jt" tidak terputus). */
function rpShort(n) {
  // Spasi tak terputus sebelum "jt": di kolom sempit baris hanya patah setelah "Rp", tidak sebelum "jt".
  if (n >= 1e6) return 'Rp\u00a0' + String(Math.round(n / 1e4) / 100).replace('.', ',') + '\u00a0jt';
  return 'Rp\u00a0' + Math.round(n / 1000) + 'rb';
}
/** Harga bulanan termurah, ringkas ("Rp 149rb"): dipakai "Mulai …" di hero dan deskripsi. */
function mulai() { return rpShort(Math.min.apply(null, TIERS.map(t => t.bulanan))); }
/** Angka saja, dalam bentuk PUSAT_TIERS / PUSAT_SETUP (untuk tes dan hub-check). */
function pusatShape() {
  const tiers = {};
  for (const t of TIERS) tiers[t.key] = { name: t.name, bulanan: t.bulanan, tahunan: t.tahunan, lifetime: t.lifetime, putus: t.putus };
  return { tiers, setup: { standar: SETUP.standar.price, custom: SETUP.custom.price } };
}

const yes = '<span class="ok" role="img" aria-label="Ya">✓</span>';
const no = '<span class="no" role="img" aria-label="Tidak">—</span>';
const cell = v => v === true ? yes : v === false ? no : esc(v);
const ticks = items => '<ul class="ticks">' + items.map(i => `<li>${esc(i)}</li>`).join('') + '</ul>';

/** Isi bagian #harga (dipasang di <!--HARGA--> hub-site/index.html). */
function render() {
  const pro = TIERS.find(t => t.key === 'pro');
  const cyc = '<div class="cyc" id="cyc" role="group" aria-label="Cara bayar">' +
    '<button type="button" data-cyc="bulanan" aria-pressed="true">Bulanan</button>' +
    '<button type="button" data-cyc="tahunan" aria-pressed="false">Tahunan<span>gratis 2 bulan</span></button></div>';
  const cards = '<div class="tiers">' + TIERS.map(t =>
    `<article class="card tier${t.popular ? ' ink' : ''}" id="paket-${t.key}" aria-labelledby="paket-${t.key}-h">` +
    `<div class="tier-head"><h3 id="paket-${t.key}-h">${esc(t.name)}</h3>${t.popular ? '<span class="tag">Disarankan</span>' : ''}</div>` +
    `<p class="lim">${esc(t.limit)}</p>` +
    `<p class="price m"><b>${rp(t.bulanan)}</b><span>/bulan</span></p>` +
    `<p class="price y"><b>${rp(t.tahunan)}</b><span>/tahun</span></p>` +
    (FIRST_MONTH_FREE ? '<p class="psub m"><span class="free">Bulan pertama gratis</span></p>' : '<p class="psub m">Bayar tiap bulan, berhenti kapan saja</p>') +
    `<p class="psub y">± ${rpShort(t.tahunan / 12)}/bulan · gratis 2 bulan</p>` +
    ticks(t.items) +
    `<p class="fit">${esc(t.fit)}</p>` +
    `<a class="btn" href="#daftar" data-plan="${t.key}">Pilih ${esc(t.name)}</a></article>`).join('') + '</div>';
  const setups = '<p class="kicker sub">Biaya setup · sekali bayar</p><div class="grid2 setups">' + ['standar', 'custom'].map((k, i) => {
    const s = SETUP[k];
    return `<div class="card${i ? ' ink' : ''}"><h3>${esc(s.name)}</h3><p class="price"><b>${rp(s.price)}</b></p><p class="lead2">${esc(s.lead)}</p>${ticks(s.items)}</div>`;
  }).join('') + '</div>';
  const head = '<thead><tr><th scope="col"><span class="vh">Fitur</span></th>' + TIERS.map(t =>
    `<th scope="col"${t.popular ? ' class="p"' : ''}>${esc(t.name)}<small>${rpShort(t.bulanan)}/bln</small></th>`).join('') + '</tr></thead>';
  const body = '<tbody>' + COMPARE.map(([g, rows]) =>
    `<tr class="grp"><th colspan="${TIERS.length + 1}" scope="colgroup">${esc(g)}</th></tr>` + rows.map(r =>
      `<tr><th scope="row">${esc(r[0])}</th>` + TIERS.map((t, i) => `<td${t.popular ? ' class="p"' : ''}>${cell(r[i + 1])}</td>`).join('') + '</tr>').join('')).join('') +
    '<tr class="tot"><th scope="row">Biaya setup (sekali)</th>' + TIERS.map(t =>
      `<td${t.popular ? ' class="p"' : ''}>${t.key === 'studio' ? rpShort(SETUP.custom.price) : 'mulai ' + rpShort(SETUP.standar.price)}</td>`).join('') + '</tr></tbody>';
  const cmp = `<details class="more" id="banding"><summary>Bandingkan semua fitur</summary><table class="cmp">${head}${body}</table></details>`;
  const other = '<details class="more" id="bayar-lain"><summary>Pilihan bayar lain: lifetime dan beli putus</summary><table class="cmp pay">' +
    '<thead><tr><th scope="col"><span class="vh">Cara bayar</span></th>' + TIERS.map(t => `<th scope="col"${t.popular ? ' class="p"' : ''}>${esc(t.name)}</th>`).join('') + '</tr></thead><tbody>' +
    [['bulanan', 'Bulanan', 'Bayar tiap bulan, berhenti kapan saja' + (FIRST_MONTH_FREE ? '. Bulan pertama gratis.' : '.')],
      ['tahunan', 'Tahunan', '12 bulan di muka, gratis 2 bulan.'],
      ['lifetime', 'Lifetime', 'Bayar sekali; update dan dukungan selama layanan XNK berjalan. Setup Standar gratis.'],
      ['putus', 'Beli putus', 'Bayar sekali, aplikasi jadi milik Anda; garansi perbaikan 30 hari, tanpa update dan dukungan setelahnya.']].map(([k, n, d]) =>
      `<tr><th scope="row">${n}<small>${esc(d)}</small></th>` + TIERS.map(t => `<td${t.popular ? ' class="p"' : ''}>${rpShort(t[k])}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>' +
    `<p class="note">Bulanan, tahunan, dan beli putus ditambah biaya setup (Standar ${rp(SETUP.standar.price)} atau Custom ${rp(SETUP.custom.price)}). ` +
    `Lifetime sudah termasuk setup Standar; setup Custom tetap ${rp(SETUP.custom.price)}. Lifetime dan beli putus adalah lisensi untuk satu coach atau studio, tidak untuk dijual ulang.</p></details>`;
  const sesi = Math.ceil(pro.bulanan / 50000) * 50000;
  const payback = '<div class="card payback"><div><p class="kicker">Hitung balik modal</p><b>± 1 sesi / bulan</b></div>' +
    `<p>Kalau satu sesi PT Anda sekitar ${rp(sesi)}, satu sesi tambahan per bulan, dari klien yang tidak jadi berhenti atau dari jam admin yang kini bisa dipakai melatih, sudah menutup paket Pro.</p></div>`;
  const notes = '<p class="note">' + (FIRST_MONTH_FREE ? 'Bulan pertama gratis untuk bayar bulanan: tagihan pertama jatuh sebulan setelah aplikasi Anda siap. ' : '') +
    'Domain sendiri (misalnya namaanda.com) tidak termasuk; biayanya mengikuti penyedia domain dan dibayar langsung oleh coach.</p>';
  return cyc + cards + setups + payback + cmp + other + notes;
}

/** <option> paket untuk form daftar. */
function planOptions() {
  return '<option value="">Belum tahu</option>' + TIERS.map(t => `<option value="${t.key}">${esc(t.name)}</option>`).join('');
}

/** Penawaran (schema.org Offer) per paket, harga bulanan, untuk data terstruktur landing. */
function offers(url) {
  return TIERS.map(t => ({
    '@type': 'Offer', name: t.name, url: url + '#paket-' + t.key, price: String(t.bulanan), priceCurrency: 'IDR',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: t.bulanan, priceCurrency: 'IDR', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
  }));
}

module.exports = { TIERS, SETUP, COMPARE, FIRST_MONTH_FREE, rp, rpShort, mulai, pusatShape, render, planOptions, offers };
