'use strict';
// T-2255: "Unduh data saya" — exportMyData (admin, hanya membaca) dan penulis .xlsx di browser (part 18).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { seededEnv } = require('./fixtures');

const post = (env, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn: 'exportMyData', args }) } }).content);

test('exportMyData: butuh token admin (token klien / kosong ditolak)', () => {
  const env = seededEnv();
  assert.throws(() => env.call('exportMyData', '', null));
  assert.throws(() => env.call('exportMyData', 'salah', { sheet: 'MemberData', from: 1 }));
  assert.equal(post(env, ['salah', null]).ok, false);
  const r = post(env, [env.adminToken(), null]);
  assert.equal(r.ok, true);
});

test('exportMyData: daftar sheet tanpa ProgressPhotos / PushSubs / PushOutbox dan tanpa Script Properties', () => {
  const env = seededEnv();
  env.props.ADMIN_PIN_HASH = 'rahasia-pin-hash-xyz';
  env.ss.seed('ProgressPhotos', [['ID', 'File ID'], ['p1', 'drive-file-rahasia']]);
  env.ss.seed('PushSubs', [['ID', 'Endpoint'], ['s1', 'https://push.example/rahasia']]);
  env.ss.seed('PushOutbox', [['Key'], ['k']]);
  const tok = env.adminToken();
  const r = env.call('exportMyData', tok, null);
  const names = r.sheets.map(s => s.name);
  assert.ok(names.includes('MemberData'));
  for (const n of ['ProgressPhotos', 'PushSubs', 'PushOutbox']) {
    assert.ok(!names.includes(n), n + ' tidak ikut');
    assert.throws(() => env.call('exportMyData', tok, { sheet: n, from: 1 }), /Sheet tidak ditemukan/);
  }
  assert.deepEqual(names, env.ss.getSheets().map(s => s.getName()).filter(n => !['ProgressPhotos', 'PushSubs', 'PushOutbox'].includes(n)));
  const md = r.sheets.find(s => s.name === 'MemberData');
  assert.equal(md.rows, env.ss.getSheetByName('MemberData').getLastRow());
  const text = JSON.stringify(r) + JSON.stringify(env.call('exportMyData', tok, { sheet: 'MemberData', from: 1 }));
  assert.ok(!text.includes('rahasia-pin-hash-xyz'), 'Script Properties tidak pernah ikut');
});

test('exportMyData: teks tampilan, per halaman 2000 baris, next = 0 di akhir; tidak mengubah sheet', () => {
  const env = seededEnv();
  const rows = [['Tanggal', 'Angka']];
  for (let i = 1; i < 2500; i++) rows.push([new Date(2026, 0, 1 + (i % 28), 9, 30), i]);
  env.ss.seed('Besar', rows);
  const tok = env.adminToken();
  const before = JSON.stringify(env.ss.getSheetByName('Besar').getDataRange().getValues());
  const a = env.call('exportMyData', tok, { sheet: 'Besar', from: 1 });
  assert.equal(a.rows.length, 2000);
  assert.equal(a.next, 2001);
  assert.ok(a.rows.every(r => r.every(c => typeof c === 'string')), 'semua sel teks');
  const b = env.call('exportMyData', tok, { sheet: 'Besar', from: a.next });
  assert.equal(b.rows.length, 500);
  assert.equal(b.next, 0);
  assert.deepEqual(env.call('exportMyData', tok, { sheet: 'Besar', from: 9999 }), { rows: [], cols: 2, next: 0 });
  assert.equal(JSON.stringify(env.ss.getSheetByName('Besar').getDataRange().getValues()), before, 'hanya membaca');
  assert.throws(() => env.call('exportMyData', tok, { sheet: 'Besar', from: 0 }), /tidak valid/);
  assert.throws(() => env.call('exportMyData', tok, { sheet: 'Besar', from: 1.5 }), /tidak valid/);
  assert.throws(() => env.call('exportMyData', tok, { sheet: 'TidakAda', from: 1 }), /Sheet tidak ditemukan/);
});

// ── Penulis .xlsx (part 18): jalankan kodenya di Node lalu buka zip-nya. ──
function loadWriter() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'parts', 'app', '18-unduh-data-saya.part'), 'utf8');
  const start = src.indexOf('  // ── Penulis .xlsx');
  const end = src.indexOf('  window.xlsxBlob = xlsxBlob;');
  assert.ok(start > 0 && end > start);
  return new Function(src.slice(start, end) + '\nreturn { xlsxBlob, xlCol, xlSheetNames };')();
}
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'akhir zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    assert.equal(buf.readUInt32LE(off), 0x04034b50);
    const data = buf.slice(off + 30 + buf.readUInt16LE(off + 26), off + 30 + buf.readUInt16LE(off + 26) + csize);
    const raw = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.equal(raw.length, usize, name + ' ukuran');
    assert.equal(zlib.crc32 ? zlib.crc32(raw) >>> 0 : crc, crc, name + ' CRC');
    out[name] = raw.toString('utf8');
    p += 46 + nlen;
  }
  return out;
}

test('xlsx: zip sah, nama sheet aman dan unik, teks di-escape, angka bulat pendek saja jadi angka', async () => {
  const w = loadWriter();
  assert.equal(w.xlCol(0), 'A'); assert.equal(w.xlCol(25), 'Z'); assert.equal(w.xlCol(26), 'AA'); assert.equal(w.xlCol(701), 'ZZ'); assert.equal(w.xlCol(702), 'AAA');
  assert.deepEqual(w.xlSheetNames([{ name: 'a/b' }, { name: 'A b' }, { name: 'x'.repeat(40) }, { name: '' }]), ['a b', 'A b (2)', 'x'.repeat(31), 'Sheet4']);
  const blob = await w.xlsxBlob([
    { name: 'MemberData', rows: [['Nama', 'No WA', 'Harga', 'Catatan'], ['Sari <&> "Kak"', '6281234567890', '1.500', 'baris\u0001aneh'], ['Budi', '', '150000', '']] },
    { name: 'Kosong', rows: [] },
  ]);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = unzip(Buffer.from(await blob.arrayBuffer()));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(files[f], f);
  assert.match(files['xl/workbook.xml'], /<sheet name="MemberData" sheetId="1" r:id="rId1"\/><sheet name="Kosong" sheetId="2" r:id="rId2"\/>/);
  const s1 = files['xl/worksheets/sheet1.xml'];
  assert.match(s1, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Nama<\/t>/, 'judul tebal');
  assert.match(s1, /Sari &lt;&amp;&gt; &quot;Kak&quot;/);
  assert.match(s1, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">6281234567890<\/t>/, 'nomor WA tetap teks');
  assert.match(s1, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">1\.500<\/t>/, '"1.500" tetap teks');
  assert.match(s1, /<c r="C3"><v>150000<\/v><\/c>/, 'bilangan bulat pendek jadi angka');
  assert.ok(!s1.includes('\u0001'), 'karakter kendali dibuang');
  assert.ok(!/r="B3"/.test(s1), 'sel kosong dilewati');
  assert.match(s1, /state="frozen"/);
  assert.match(files['xl/worksheets/sheet2.xml'], /<sheetData><\/sheetData>/);
});
