'use strict';
// Shared seed data + helpers for server tests.
const { createEnv } = require('./harness');

const MEMBERDATA_HEADERS = ['ID', 'Nama', 'No WA', 'Tujuan (Goal)', 'Tanggal Gabung', 'Foto URL', 'Paket ID Aktif',
  'Nama Paket Aktif', 'Total Sesi', 'Sesi Terpakai', 'Coach ID', 'Nama Coach', 'Tanggal Update Terakhir', 'Kunci Link'];
const SCHEDULE_HEADERS = ['ID', 'Member ID', 'Nama Member', 'No WA', 'Waktu Mulai', 'Waktu Selesai', 'Catatan', 'Status',
  'Coach ID', 'Nama Coach', 'Completed At', 'Recurring Group ID'];
const PRICELIST_HEADERS = ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'];

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);
const ADMIN_PIN = '246810';

const inDays = d => new Date(Date.now() + d * 86400000).toISOString();

function seededEnv(opts) {
  const env = createEnv(opts);
  env.props.ADMIN_PIN = ADMIN_PIN;
  env.props.TELEGRAM_BOT_TOKEN = '1:x';
  env.props.TELEGRAM_CHAT_IDS = '111';
  env.ss.seed('MemberData', [
    MEMBERDATA_HEADERS,
    ['PT-A', 'Ani Anggraini', '6281111111111', 'Weight Loss', '1/1/2026', '', 'P1', 'Regular 8', 10, 5, '', '', '1/1/2026', KEY_A],
    ['PT-B', 'Budi', '081222222222', 'Strength', '2/1/2026', '', 'P1', 'Regular 8', 10, 2, '', '', '2/1/2026', KEY_B],
    // Old client row from before this change: no link key yet (13 columns).
    ['PT-C', 'Citra', '6283333333333', 'General', '3/1/2026', '', '', '', 10, 0, '', '', '3/1/2026'],
  ]);
  env.ss.seed('Schedules', [
    SCHEDULE_HEADERS,
    ['SCH-A1', 'PT-A', 'Ani Anggraini', '6281111111111', inDays(2), inDays(2.04), 'Rahasia Ani', 'read', 'C-1', 'Rizky', '', ''],
    ['SCH-B1', 'PT-B', 'Budi', '081222222222', inDays(3), inDays(3.04), 'Catatan Budi', 'unread', 'C-1', 'Rizky', '', ''],
  ]);
  env.ss.seed('PriceList', [
    PRICELIST_HEADERS,
    ['P1', 'Regular 8', 'regular', 800000, 8, '1 Bulan', 'desc', 'a,b', true],
    ['P2', 'Flex', 'premium', 1500000, '', '1 Bulan', 'desc', 'a', true],
    ['P3', 'Lama', 'regular', 100000, 4, '1 Bulan', 'desc', 'a', false],
  ]);
  env.ss.seed('Coaches', [
    ['ID', 'Nama Coach', 'No WA', 'Spesialisasi', 'Foto URL', 'Bio', 'Pengalaman'],
    ['C-1', 'Rizky', '6281112223334', 'Strength', '', 'Bio', '3 Tahun'],
  ]);
  env.adminToken = () => env.call('adminLogin', ADMIN_PIN).token;
  env.memberToken = key => env.call('memberLoginByKey', key).token;
  env.memberRow = id => env.sheet('MemberData').rows.find(r => r[0] === id);
  return env;
}

module.exports = { seededEnv, KEY_A, KEY_B, ADMIN_PIN, inDays, MEMBERDATA_HEADERS, SCHEDULE_HEADERS };
