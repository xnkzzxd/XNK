'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./harness');

test('Telegram is skipped (not crashed) when Script Properties are not set', () => {
  const env = createEnv();
  env.call('kirimNotifTelegram', 'halo');
  assert.equal(env.fetches.length, 0);
  assert.ok(env.logs.some(l => l.includes('TELEGRAM_BOT_TOKEN')));
});

test('Telegram sends one message per chat id from Script Properties', () => {
  const env = createEnv();
  env.props.TELEGRAM_BOT_TOKEN = '123456:TEST_TOKEN_VALUE_abcdefghijklmnop';
  env.props.TELEGRAM_CHAT_IDS = '111, 222';
  env.call('kirimNotifTelegram', '<b>halo</b>');
  assert.equal(env.fetches.length, 2);
  assert.ok(env.fetches[0].url.endsWith('/bot123456:TEST_TOKEN_VALUE_abcdefghijklmnop/sendMessage'));
  const chats = env.fetches.map(f => JSON.parse(f.options.payload).chat_id);
  assert.deepEqual(chats, ['111', '222']);
});

test('no bot token is hardcoded in the source', () => {
  const fs = require('fs');
  const path = require('path');
  const src = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(src)) {
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    assert.doesNotMatch(text, /\d{6,}:[A-Za-z0-9_-]{30,}/, `${f} looks like it contains a Telegram bot token`);
  }
});
