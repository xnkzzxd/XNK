'use strict';
// Gelombang 2 (antrean simpan, 2026-11-20): pengguna web tidak boleh melihat teks galat mentah dari Google untuk
// gangguan sementara. Simpanan yang dulu menunggu kini lewat optimistic({q}); yang sengaja menunggu memakai waitErr(err).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'parts', 'app');
const parts = fs.readdirSync(DIR).filter(f => f.endsWith('.part')).map(f => ({ f, t: fs.readFileSync(path.join(DIR, f), 'utf8') }));

test('tidak ada toast galat mentah ("Gagal: " + err.message / authMessage) di bagian app', () => {
  const bad = [];
  const re = /showToast\(\s*(?:'Gagal: '\s*\+\s*)?(?:window\.authMessage\(err\)|err\.message)\s*\)/g;
  for (const { f, t } of parts) for (const m of t.matchAll(re)) bad.push(f + ': ' + m[0]);
  assert.deepStrictEqual(bad, [], 'Use waitErr(err[, prefix]) or optimistic({q}) instead:\n' + bad.join('\n'));
});

test('simpanan panel coach yang dijadikan langsung tidak kembali ke adminCall yang menunggu', () => {
  // Nama fungsi → bagian tempat ia sekarang lewat antrean simpan.
  const instant = { deleteSchedule: '04', updateScheduleCoach: '04', deleteRecurringGroup: '04', deleteTask: '06', deleteTaskTemplate: '06',
    setMemberReminderPrefs: '06', setMemberMealReminder: '06', deleteMember: '06', deleteCoachTimeOff: '06', saveClientNotes: '09', markHealthReviewed: '09',
    saveClientNutrition: '09', decideNutritionAdvice: '09', saveAssessment: '09', deleteProgramTemplate: '09', setFormOk: '07', deleteContent: '07',
    snoozeCare: '10', setCoachActive: '10', setSelfCoach: '10', deleteMemberMeasurement: '11', decideRenewal: '11',
    setPackageActive: '02', reorderPackages: '02', deletePackage: '02', savePackage: '02',
    restoreFinanceItem: '14', archiveFinanceItem: '14', saveBillAdjust: '14', saveCoachShare: '14', deleteFinanceCategory: '14' };
  const left = [];
  for (const [fn, pre] of Object.entries(instant)) {
    const p = parts.find(x => x.f.startsWith(pre + '-'));
    assert.ok(p, 'part ' + pre);
    if (new RegExp("adminCall\\(\\s*'" + fn + "'").test(p.t)) left.push(fn + ' (' + p.f + ')');
    assert.ok(new RegExp("fn:\\s*'" + fn + "'").test(p.t), fn + ' should be queued in ' + p.f);
  }
  assert.deepStrictEqual(left, [], 'These went back to a waiting adminCall: ' + left.join(', '));
});

test('gelombang 3: tidak ada teks galat mentah (e.message / err.message) di toast atau kotak galat', () => {
  const bad = [];
  const re = /(?:showToast\(\s*(?:e|err)\.message\b|textContent\s*=\s*(?:e|err)\.message\b)/g;
  for (const { f, t } of parts) for (const m of t.matchAll(re)) bad.push(f + ': ' + m[0]);
  assert.deepStrictEqual(bad, [], 'Use waitErr(err[, prefix]):\n' + bad.join('\n'));
});

test('gelombang 3: simpanan portal klien yang dijadikan langsung tetap lewat antrean', () => {
  const instant = { rateSession: '10', submitMyPackageEval: '10', requestRenewal: '10', completeMyTask: '11', deleteMyProgressPhoto: '11',
    markBadgesSeen: '11', deleteMyRoutine: '11', leaveClassGroup: '13', markGuideSeen: '13', markNotifSeen: '16' };
  const left = [];
  for (const [fn, pre] of Object.entries(instant)) {
    const p = parts.find(x => x.f.startsWith(pre + '-'));
    if (new RegExp("memberCall\\(\\s*'" + fn + "'").test(p.t)) left.push(fn + ' (' + p.f + ')');
    assert.ok(new RegExp("mode: 'member', fn:\\s*'" + fn + "'").test(p.t), fn + ' should be queued in ' + p.f);
  }
  assert.deepStrictEqual(left, [], 'Back to a waiting memberCall: ' + left.join(', '));
});
