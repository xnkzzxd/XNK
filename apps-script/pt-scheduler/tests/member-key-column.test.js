'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, MEMBERDATA_HEADERS } = require('./fixtures');

const OLD_HEADERS = MEMBERDATA_HEADERS.slice(0, 13); // sheet from before this change

test('old MemberData sheet (13 columns) gets the "Kunci Link" header added', () => {
  const env = seededEnv();
  env.ss.seed('MemberData', [OLD_HEADERS, ['PT-X', 'Xena', '6287777777777', 'g', '1/1/2026', '', '', '', 10, 0, '', '', '1/1/2026']]);
  const res = env.call('adminGetMemberLink', env.adminToken(), 'PT-X');
  assert.equal(env.sheet('MemberData').rows[0][13], 'Kunci Link');
  assert.match(res.link, /k=[a-f0-9]{32}$/);
});

test('a column N the owner already uses is never overwritten', () => {
  const env = seededEnv();
  env.ss.seed('MemberData', [
    [...OLD_HEADERS, 'Catatan Owner'],
    ['PT-X', 'Xena', '6287777777777', 'g', '1/1/2026', '', '', '', 10, 0, '', '', '1/1/2026', 'alergi kacang'],
  ]);
  const admin = env.adminToken();
  assert.throws(() => env.call('adminGetMemberLink', admin, 'PT-X'), /Kolom N di sheet MemberData sudah dipakai untuk "Catatan Owner"/);
  assert.throws(() => env.call('memberLoginByKey', 'a'.repeat(32)), /AUTH_REQUIRED/);

  // Adding / renewing clients still works and leaves column N alone.
  env.call('addMember', admin, { name: 'Xena', phone: '6287777777777', goal: 'g2', packageId: 'P1' });
  const res = env.call('addMember', admin, { name: 'Yosi', phone: '6288888888888', goal: 'g', packageId: 'P1' });
  const rows = env.sheet('MemberData').rows;
  assert.equal(rows[0][13], 'Catatan Owner');
  assert.equal(rows[1][13], 'alergi kacang');
  assert.equal(rows.find(r => r[0] === res.id)[13], undefined);
  assert.equal(res.memberLink, 'https://book.xnkbooking.my.id');
});
