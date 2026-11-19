'use strict';
// T-2243: hubSiteUrl (dijaga HUB_SECRET) menyimpan alamat situs coach yang baru setelah pemilik mengganti slug di hub.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const SECRET = 'h'.repeat(40);

test('hubSiteUrl: tanpa HUB_SECRET atau rahasia salah = ditolak, tidak ada yang ditulis', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubSiteUrl', SECRET, 'https://xnk.web.id/baru'), /Permintaan tidak valid/, 'produksi tanpa HUB_SECRET');
  env.props.HUB_SECRET = SECRET;
  assert.throws(() => env.call('hubSiteUrl', 'x'.repeat(40), 'https://xnk.web.id/baru'), /Permintaan tidak valid/);
  for (const bad of ['', 'http://xnk.web.id/baru', 'https://xnk.web.id/ba ru', 'javascript:alert(1)', 'https://xnk.web.id/a?b=1', 'https://x/' + 'a'.repeat(300)]) {
    assert.throws(() => env.call('hubSiteUrl', SECRET, bad), /Alamat situs tidak valid/, bad);
  }
  assert.equal(env.props.SITE_URL, undefined);
});

test('hubSiteUrl: menyimpan alamat (tanpa /klien dan garis miring), menaikkan versi data semua klien', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.props.SITE_URL = 'https://xnk.web.id/lama';
  const v0 = env.call('getPortalBootstrap', env.memberToken(KEY_A)).moreVer;
  const r = env.call('hubSiteUrl', SECRET, 'https://xnk.web.id/baru/klien/');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { siteUrl: 'https://xnk.web.id/baru', changed: true });
  assert.equal(env.props.SITE_URL, 'https://xnk.web.id/baru');
  assert.notEqual(env.call('getPortalBootstrap', env.memberToken(KEY_A)).moreVer, v0, 'cached answers carrying the portal link are rebuilt');
  assert.equal(env.call('hubSiteUrl', SECRET, 'https://xnk.web.id/baru').changed, false, 'same address again = no change');
});
