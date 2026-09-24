'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

test('new client: sessions come from the Price List, not the browser', () => {
  const env = seededEnv();
  const res = env.call('registerNewClient', {
    name: 'Dewi', phone: '0814 4444 4444', goal: 'Weight Loss',
    packageId: 'P1', sessions: 999, packageSessions: 999, price: 'Rp 1',
  });
  assert.equal(res.status, 'success');
  assert.match(res.memberLink, /k=[a-f0-9]{32}$/);
  const row = env.memberRow(res.id);
  assert.equal(row[1], 'Dewi');
  assert.equal(row[6], 'P1');
  assert.equal(row[8], 8);  // Total Sesi from package P1
  assert.equal(row[9], 0);  // Sesi Terpakai
  assert.match(row[13], /^[a-f0-9]{32}$/);
  // The returned link logs the new client in.
  const key = res.memberLink.match(/k=([a-f0-9]{32})$/)[1];
  assert.equal(env.call('memberLoginByKey', key).member.id, res.id);
});

test('flexible package (no session count) gets 1 session, as before', () => {
  const env = seededEnv();
  const res = env.call('registerNewClient', { name: 'Eka', phone: '6285555555555', goal: 'x', packageId: 'P2' });
  assert.equal(env.memberRow(res.id)[8], 1);
});

test('existing phone number: quota untouched, no link returned, PT notified', () => {
  const env = seededEnv();
  const before = env.memberRow('PT-A').slice();
  // Same number in a different format than stored.
  const res = env.call('registerNewClient', { name: 'Penyusup', phone: '+62 811-1111-1111', goal: 'x', packageId: 'P1' });
  assert.deepEqual(res, { status: 'exists' });
  assert.deepEqual(env.memberRow('PT-A'), before);
  assert.equal(env.sheet('MemberData').rows.length, 4);
  assert.ok(env.fetches.some(f => JSON.parse(f.options.payload).text.includes('KLIEN LAMA MINTA PERPANJANG')));
  assert.ok(env.mails.some(m => m.subject.includes('Permintaan Perpanjang')));
});

test('old WA formats (08…) are matched as the same client', () => {
  const env = seededEnv();
  // PT-B is stored as 081222222222.
  const res = env.call('registerNewClient', { name: 'B', phone: '6281222222222', goal: 'x', packageId: 'P1' });
  assert.equal(res.status, 'exists');
});

test('rejects unknown / inactive packages and bad input', () => {
  const env = seededEnv();
  assert.throws(() => env.call('registerNewClient', { name: 'X', phone: '6281999999999', packageId: 'NOPE' }), /Paket tidak ditemukan/);
  assert.throws(() => env.call('registerNewClient', { name: 'X', phone: '6281999999999', packageId: 'P3' }), /Paket tidak ditemukan/);
  assert.throws(() => env.call('registerNewClient', { name: '', phone: '6281999999999', packageId: 'P1' }), /Nama wajib/);
  assert.throws(() => env.call('registerNewClient', { name: 'X', phone: '123', packageId: 'P1' }), /WhatsApp tidak valid/);
});

test('names typed on the public form are escaped in email and Telegram', () => {
  const env = seededEnv();
  env.call('registerNewClient', { name: '<img src=x onerror=alert(1)>', phone: '6286666666666', goal: '"><b>', packageId: 'P1' });
  const mail = env.mails[env.mails.length - 1].htmlBody;
  assert.ok(!mail.includes('<img src=x'));
  assert.ok(mail.includes('&lt;img src=x onerror=alert(1)&gt;'));
  const tg = JSON.parse(env.fetches[env.fetches.length - 1].options.payload).text;
  assert.ok(!tg.includes('<img'));
});

test('admin addMember still renews an existing client (resets quota, keeps key)', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const res = env.call('addMember', token, { name: 'Ani', phone: '6281111111111', goal: 'Lanjut', packageId: 'P1', coachId: 'C-1' });
  assert.equal(res.renewed, true);
  const row = env.memberRow('PT-A');
  assert.equal(row[8], 8);
  assert.equal(row[9], 0);
  assert.equal(row[13], 'a'.repeat(32));
  assert.match(res.memberLink, /k=a{32}$/);
  assert.ok(decodeURIComponent(res.waLink).includes(res.memberLink));
});

test('admin addMember gives old clients without a key a new one', () => {
  const env = seededEnv();
  const res = env.call('addMember', env.adminToken(), { name: 'Citra', phone: '6283333333333', goal: 'x', packageId: 'P1' });
  assert.match(env.memberRow('PT-C')[13], /^[a-f0-9]{32}$/);
  assert.ok(res.memberLink.endsWith(env.memberRow('PT-C')[13]));
});
