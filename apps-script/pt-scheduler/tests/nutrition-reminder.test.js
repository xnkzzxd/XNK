'use strict';
// Phase P / T-1030: calorie line in the meal reminders and the global switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

function ready(env) {
  const admin = env.adminToken(), ani = env.memberToken(KEY_A);
  env.call('saveMyMeasurement', ani, { berat: 70, pinggang: 80 });
  env.call('saveClientNotes', admin, 'PT-A', { flag: '', notes: '', birthDate: '1996-03-10' });
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga' });
  return { admin, ani };
}

test('the line is a plain calorie sentence with a thousands dot', () => {
  const env = seededEnv();
  assert.equal(env.callRaw('_nutReminderLine_', 2000), '\n\nTarget hari ini 2.000 kkal.');
  assert.equal(env.callRaw('_nutReminderLine_', 1850.4), '\n\nTarget hari ini 1.850 kkal.');
  assert.equal(env.callRaw('_nutReminderLine_', 0), '');
  assert.equal(env.callRaw('_nutReminderLine_', undefined), '');
});

test('bulk calories: only active clients with a complete profile', () => {
  const env = seededEnv();
  assert.deepEqual(j(env.callRaw('_nutBulkCalories_')), {});          // nobody has data yet
  ready(env);
  const m = j(env.callRaw('_nutBulkCalories_'));
  assert.deepEqual(Object.keys(m), ['PT-A']);
  assert.equal(m['PT-A'], j(env.call('getClientNutrition', env.adminToken(), 'PT-A')).target.kal);
  env.call('saveClientNutrition', env.adminToken(), 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', aktif: false });
  assert.deepEqual(j(env.callRaw('_nutBulkCalories_')), {});          // per-client switch
  env.call('saveClientNutrition', env.adminToken(), 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga' });
  env.props.NUTRITION_ENABLED = 'false';
  assert.deepEqual(j(env.callRaw('_nutBulkCalories_')), {});          // global switch
});

test('bulk calories reads each sheet once, not once per client', () => {
  const env = seededEnv();
  ready(env);
  env.resetReads(); env.callRaw('_nutBulkCalories_');
  const few = env.reads().total;
  for (let i = 0; i < 20; i++) env.sheet('MemberData').rows.push(['PT-X' + i, 'Klien ' + i, '62811' + (1000 + i), 'Goal', '1/1/2026', '', 'P1', 'Regular 8', 10, 1, '', '', '1/1/2026', 'K' + i]);
  env.resetReads(); env.callRaw('_nutBulkCalories_');
  assert.equal(env.reads().total, few);
});

const { runInContext } = require('node:vm');
const ctx = env => ({ now: runInContext("new Date('2026-09-30T12:00:00Z')", env.context) });
const buttons = env => env.fetches.map(f => JSON.parse(f.options.payload)).flatMap(m => (m.reply_markup ? m.reply_markup.inline_keyboard.map(r => r[0]) : []));
const waText = b => decodeURIComponent(new URL(b.url).searchParams.get('text'));

test('the real meal digest adds the calorie line only for the client with a complete profile', () => {
  const env = seededEnv();
  ready(env);
  const kal = j(env.call('getClientNutrition', env.adminToken(), 'PT-A')).target.kal;
  assert.equal(env.callRaw('sendMakanPagiDigest_', ctx(env)), true);
  const bs = buttons(env);
  const ani = bs.find(b => b.text.startsWith('Ani')), budi = bs.find(b => b.text.startsWith('Budi'));
  assert.match(waText(ani), new RegExp('Target hari ini ' + String(kal).replace(/\B(?=(\d{3})+(?!\d))/g, '\\.') + ' kkal\\.$'));
  assert.ok(!/Target hari ini/.test(waText(budi)));
  const added = waText(ani).slice(waText(ani).lastIndexOf('\n\n') + 2);      // the only thing this feature adds
  assert.match(added, /^Target hari ini [\d.]+ kkal\.$/);
});

test('switching Gizi off (globally or for the client) removes the line; the digest still goes out', () => {
  const env = seededEnv();
  ready(env);
  env.props.NUTRITION_ENABLED = 'false';
  assert.equal(env.callRaw('sendMakanPagiDigest_', ctx(env)), true);
  assert.ok(buttons(env).length >= 1 && buttons(env).every(b => !/Target hari ini/.test(waText(b))));
  delete env.props.NUTRITION_ENABLED;
  env.call('saveClientNutrition', env.adminToken(), 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', aktif: false });
  env.fetches.length = 0;
  env.callRaw('sendMakanSoreDigest_', ctx(env));
  assert.ok(buttons(env).every(b => !/Target hari ini/.test(waText(b))));
});

test('settings: nutritionEnabled round trips and defaults to on', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  assert.equal(j(env.call('getAppSettings', admin)).nutritionEnabled, true);
  assert.equal(j(env.call('updateAppSettings', admin, { nutritionEnabled: false })).nutritionEnabled, false);
  assert.equal(env.props.NUTRITION_ENABLED, 'false');
  assert.equal(j(env.call('updateAppSettings', admin, { nutritionEnabled: true })).nutritionEnabled, true);
  assert.equal(env.props.NUTRITION_ENABLED, undefined);
});
