'use strict';
// Classification of every browser-callable server function (top-level, no
// trailing "_"). One source for tests/security.test.js and for the doPost
// gateway generator (tools/build-api.js, T-1703). Add a new public function
// to exactly one list.
//
//   PUBLIC  - no token needed (login, landing data). Entries in NOT_API are
//             entry points / helpers that must never be reachable through doPost.
//   ADMIN   - first statement is requireAdmin_(token)
//   MEMBER  - reads the member from the token (requireMember_)
//   OWNER   - requireOwner_(): script editor only
//   TRIGGER - time-driven trigger handlers

const PUBLIC = [
  'doGet', 'doPost', 'include', 'adminLogin', 'memberLoginByPhone', 'memberLoginByKey', 'registerNewClient', 'getPublicSchedules',
  'getPriceList', 'getPriceListPublic', 'getCoaches', 'getLandingStats', 'getPublicTestimonials', 'getPublicAvailability', 'getBusinessHours', 'getOpenSlots', 'getCoachStatus', 'getPortalBootstrap',
  'sanitizeValue', 'escapeHtmlTelegram',
];
const ADMIN = [
  'checkAdminSession', 'changeAdminPin', 'getAdminBootstrap', 'getAdminExtras', 'getAdminMore', 'getClientBundle', 'getClientNutrition', 'saveClientNutrition', 'decideNutritionAdvice', 'getClientFoodLog',
  'getMembers', 'getMemberTransactionLog', 'getSchedules',
  'addCoach', 'updateCoach', 'deleteCoach', 'uploadCoachPhoto',
  'saveCoach', 'previewCoachProfile', 'getClientCare', 'saveClientNotes', 'getWorkoutLog', 'saveWorkoutLog', 'getWorkoutSummaryMessage', 'snoozeCare', 'saveAssessment', 'saveFitnessTests', 'deleteFitnessTest', 'getTestResultMessage', 'markHealthReviewed', 'getSessionBriefing', 'getContentAdmin', 'saveContent', 'deleteContent', 'getMemberProgram', 'saveMemberProgram', 'getManualExercises', 'saveExerciseAlias', 'getGymCatalog', 'saveGymExercise', 'setGymExerciseActive', 'getProgramGenPreview', 'regenerateProgram', 'setClientProgramAuto', 'setFormOk', 'getProgramTemplates', 'saveProgramTemplate', 'deleteProgramTemplate', 'applyProgramTemplate', 'setTemplateExplore', 'saveSessionNote', 'getSessionNote', 'getCoachHub', 'saveCoachTargets', 'getCoachAvailability', 'saveCoachAvailability', 'addCoachTimeOff', 'deleteCoachTimeOff', 'getCoachesAdmin', 'setCoachActive', 'setSelfCoach', 'assignUnassignedToSelf',
  'addMember', 'updateMemberProfile', 'deleteMember',
  'addSchedule', 'addRecurringSchedule', 'deleteRecurringGroup', 'updateScheduleData', 'updateScheduleCoach',
  'markSchedulesAsRead', 'completeSession', 'deleteSchedule',
  'getPeakHourData', 'getCoachMonthlyStats', 'getPackageTrendStats', 'getRevenueSummary',
  'getAppSettings', 'updateAppSettings', 'sendTelegramTest',
  'addTask', 'updateTask', 'deleteTask', 'deleteTaskGroup', 'getTasksForMember', 'getTaskSummary',
  'getTaskTemplates', 'saveTaskTemplate', 'deleteTaskTemplate', 'setMemberMealReminder', 'sendReminderTest',
  'getReminderStatus', 'installReminderTrigger', 'getReminderLog',
  'previewReminderText', 'setMemberReminderPrefs',
  'getRenewalRequests', 'decideRenewal',
  'getMemberProgress', 'saveMemberMeasurement', 'deleteMemberMeasurement', 'getMemberProgressPhoto', 'getMemberShareData',
  'getPriceListAdmin', 'savePackage', 'setPackageActive', 'deletePackage', 'reorderPackages', 'getClassGroups',
  'syncFinanceTransactions', 'getBills', 'getBillDetail', 'saveBillAdjust', 'savePayment', 'saveExpense', 'getExpenses', 'getFinanceCategories', 'saveFinanceCategory', 'deleteFinanceCategory', 'archiveFinanceItem', 'restoreFinanceItem', 'saveCoachShare', 'getFinanceOverview', 'uploadFinanceProof', 'getFinanceProof', 'exportFinanceCsv',
];
const MEMBER = [
  'getMemberProfile', 'getMemberSessions', 'clientBookSchedule', 'clientBookRecurring',
  'clientRescheduleSchedule', 'uploadMemberPhoto', 'updateMemberPhoto',
  'getMyTasks', 'completeMyTask', 'getMyMealToday',
  'getMyCoach', 'getPortalMore', 'getMyNutrition', 'saveMyNutritionProfile', 'getMyShopping', 'swapMyMenuItem', 'logMyFood', 'deleteMyFood', 'getMyFoodLog', 'copyMyFoodYesterday', 'getMyContent', 'getMyProgram', 'logMyProgramDay', 'getMyProgramProfile', 'saveMyProgramProfile', 'acceptAutoProgram', 'setMyProgramAuto', 'swapMyProgramExercise', 'saveMyRoutine', 'deleteMyRoutine', 'copyRoutineToMine', 'getMyWorkout', 'logMyWorkout', 'rateSession', 'getMyPackageEval', 'submitMyPackageEval', 'getMyHealthForm', 'submitMyHealthForm', 'getMyAssessment', 'getMyProgress', 'markBadgesSeen', 'requestRenewal', 'getMyRenewal', 'saveMyMeasurement', 'deleteMyMeasurement', 'uploadMyProgressPhoto', 'getMyProgressPhoto', 'deleteMyProgressPhoto', 'getMyShareData', 'createClassGroup', 'joinClassGroup', 'leaveClassGroup', 'getMyClassGroup', 'getMyBills', 'markGuideSeen',
];
const OWNER = [
  'testDriveAccess', 'migrateSplitMembersData', 'pertahankanWABaruMemberData', 'pertahankanWABaru',
  'setupDailyTrigger', 'setupWeeklyReportTrigger', 'testNotif', 'setupReminderTrigger', 'repairDateCells',
];
const TRIGGER = ['sendDailyReminderEmail', 'sendWeeklyReportEmail', 'runReminderTick', 'runWarmTick'];

// In PUBLIC for the completeness test, but not real browser API calls.
const NOT_API = ['doGet', 'doPost', 'include', 'sanitizeValue', 'escapeHtmlTelegram'];
const PUBLIC_API = PUBLIC.filter(n => !NOT_API.includes(n));
// What doPost may dispatch: public API + admin + member. Never OWNER / TRIGGER.
const API_FUNCTIONS = [...PUBLIC_API, ...ADMIN, ...MEMBER];

module.exports = { PUBLIC, ADMIN, MEMBER, OWNER, TRIGGER, NOT_API, PUBLIC_API, API_FUNCTIONS };
