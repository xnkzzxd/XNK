'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./harness');

const OWNER = 'owner@example.com';
const configFile = (content, owner = OWNER) =>
  ({ name: 'xnk-pt-config.json', owner, content: typeof content === 'string' ? content : JSON.stringify(content), trashed: false });

test('an owner config file is copied into Script Properties and trashed', () => {
  const env = createEnv();
  const file = configFile({ ADMIN_PIN: ' 135790 ', TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_CHAT_IDS: '11,22' });
  env.driveFiles.push(file);
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.ADMIN_PIN, '135790');
  assert.equal(env.props.TELEGRAM_BOT_TOKEN, '1:abc');
  assert.equal(env.props.TELEGRAM_CHAT_IDS, '11,22');
  assert.equal(file.trashed, true);
  // Log names the keys, never the values.
  assert.ok(env.logs.some(l => l.includes('ADMIN_PIN')));
  assert.ok(!env.logs.some(l => l.includes('135790') || l.includes('1:abc')));
  // Telegram notice goes out with the new settings.
  assert.equal(env.fetches.length, 2);
  assert.match(JSON.parse(env.fetches[0].options.payload).text, /Pengaturan aplikasi diperbarui/);
});

test('a config file owned by someone else is ignored', () => {
  const env = createEnv();
  const file = configFile({ ADMIN_PIN: '999999' }, 'attacker@example.com');
  env.driveFiles.push(file);
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.ADMIN_PIN, undefined);
  assert.equal(file.trashed, false);
  assert.throws(() => env.call('adminLogin', '999999'), /PIN admin belum diatur/);
});

test('unknown keys and invalid values are not applied', () => {
  const env = createEnv();
  env.props.ADMIN_PIN = '246810';
  env.props.SESSION_SECRET = 'keep-me';
  env.driveFiles.push(configFile({ ADMIN_PIN: '123', SESSION_SECRET: 'x', MEMBER_LINK_BASE: 'https://evil.example', TELEGRAM_CHAT_IDS: '5' }));
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.ADMIN_PIN, '246810');
  assert.equal(env.props.SESSION_SECRET, 'keep-me');
  assert.equal(env.props.MEMBER_LINK_BASE, undefined);
  assert.equal(env.props.TELEGRAM_CHAT_IDS, '5');
});

test('null removes a property', () => {
  const env = createEnv();
  env.props.TELEGRAM_CHAT_IDS = '1,2';
  env.driveFiles.push(configFile({ TELEGRAM_CHAT_IDS: null }));
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.TELEGRAM_CHAT_IDS, undefined);
});

test('a config file that is not valid JSON is left alone', () => {
  const env = createEnv();
  const file = configFile('{ADMIN_PIN: 135790');
  env.driveFiles.push(file);
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.ADMIN_PIN, undefined);
  assert.equal(file.trashed, false);
});

test('Drive is checked at most once per 5 minutes, but a login without a PIN checks right away', () => {
  const env = createEnv();
  env.call('doGet', { parameter: {} }); // nothing there yet, sets the throttle
  env.driveFiles.push(configFile({ ADMIN_PIN: '135790' }));
  env.call('doGet', { parameter: {} });
  assert.equal(env.props.ADMIN_PIN, undefined);
  assert.ok(env.call('adminLogin', '135790').token);
  assert.equal(env.props.ADMIN_PIN, '135790');
});

test('the page still loads when Drive fails', () => {
  const env = createEnv();
  env.driveError = 'Drive down';
  const out = env.context.doGet({ parameter: { view: 'Landing' } });
  assert.ok(out.getContent().length > 0);
  assert.ok(env.logs.some(l => l.includes('Drive down')));
});

test('the config loader is private', () => {
  const env = createEnv();
  assert.equal(typeof env.context._applyPendingConfig_, 'function');
  assert.equal(typeof env.context.applyPendingConfig, 'undefined');
});
