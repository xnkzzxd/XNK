'use strict';
// Fase W: _wibDate_ = Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd') tanpa panggilan layanan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

test('_wibDate_ matches Utilities.formatDate in Asia/Jakarta, including the UTC midnight boundary', () => {
  const env = seededEnv();
  const cases = ['2026-11-07T16:59:59Z', '2026-11-07T17:00:00Z', '2026-11-07T23:59:59Z', '2026-12-31T17:00:00Z', '2024-02-28T17:30:00Z', '2026-01-01T00:00:00Z'];
  for (const c of cases) {
    const d = new Date(c);
    const want = env.callRaw('_wibParts_', d).date;   // formatDate in Asia/Jakarta
    assert.equal(env.callRaw('_wibDate_', d), want, c);
    assert.equal(env.callRaw('_wibDate_', c), want, c + ' as text');
  }
  assert.equal(env.callRaw('_wibDate_', 'bukan tanggal'), '');
});
