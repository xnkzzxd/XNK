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
  'getPriceList', 'getPriceListPublic', 'getCoaches', 'getLandingStats', 'getPublicTestimonials', 'getPublicAvailability', 'getBusinessHours', 'getOpenSlots', 'getCoachStatus', 'getPortalBootstrap', 'pushRelayPull', 'pushRelayAck', 'getServerInfo', 'hubStatus', 'hubExport', 'hubPushKey', 'hubSiteUrl', 'hubReadonly', 'hubPlan',
  'sanitizeValue', 'escapeHtmlTelegram',
];
const ADMIN = [
  'checkAdminSession', 'changeAdminPin', 'getAdminBootstrap', 'getAdminExtras', 'getAdminMore', 'getClientBundle', 'getClientNutrition', 'saveClientNutrition', 'decideNutritionAdvice', 'getClientFoodLog',
  'getMembers', 'getMemberTransactionLog', 'getSchedules', 'exportMyData',
  'addCoach', 'updateCoach', 'deleteCoach', 'uploadCoachPhoto',
  'saveCoach', 'previewCoachProfile', 'getClientCare', 'saveClientNotes', 'getWorkoutLog', 'saveWorkoutLog', 'getWorkoutSummaryMessage', 'snoozeCare', 'saveAssessment', 'saveFitnessTests', 'deleteFitnessTest', 'getTestResultMessage', 'markHealthReviewed', 'getSessionBriefing', 'getContentAdmin', 'saveContent', 'deleteContent', 'getMemberProgram', 'saveMemberProgram', 'getManualExercises', 'saveExerciseAlias', 'getGymCatalog', 'saveGymExercise', 'setGymExerciseActive', 'getProgramGenPreview', 'regenerateProgram', 'setClientProgramAuto', 'setFormOk', 'getProgramTemplates', 'saveProgramTemplate', 'deleteProgramTemplate', 'applyProgramTemplate', 'setTemplateExplore', 'saveSessionNote', 'getSessionNote', 'getCoachHub', 'saveCoachTargets', 'getCoachAvailability', 'saveCoachAvailability', 'addCoachTimeOff', 'deleteCoachTimeOff', 'getCoachesAdmin', 'setCoachActive', 'setSelfCoach', 'assignUnassignedToSelf',
  'addMember', 'updateMemberProfile', 'deleteMember',
  'addSchedule', 'addRecurringSchedule', 'deleteRecurringGroup', 'updateScheduleData', 'updateScheduleCoach',
  'markSchedulesAsRead', 'completeSession', 'deleteSchedule',
  'getPeakHourData', 'getCoachMonthlyStats', 'getPackageTrendStats', 'getRevenueSummary',
  'getAppSettings', 'getSettingsBundle', 'updateAppSettings', 'sendTelegramTest',
  'addTask', 'updateTask', 'deleteTask', 'deleteTaskGroup', 'getTasksForMember', 'getTaskSummary',
  'getTaskTemplates', 'saveTaskTemplate', 'deleteTaskTemplate', 'setMemberMealReminder', 'sendReminderTest',
  'getReminderStatus', 'installReminderTrigger', 'getReminderLog',
  'getAdminPushStatus', 'saveAdminPush', 'removeAdminPush', 'setAdminPushPrefs',
  'previewReminderText', 'setMemberReminderPrefs',
  'getRenewalRequests', 'decideRenewal',
  'setClientHold', 'endClientHold', 'deleteClientHold', 'decideHoldRequest',
  'saveExerciseNote', 'deleteWorkoutEntries', 'getWorkoutExerciseHistory', 'logClientFood', 'deleteClientFood', 'saveFoodFeedback', 'getMemberReport',
  'getMemberProgress', 'saveMemberMeasurement', 'deleteMemberMeasurement', 'getMemberProgressPhoto', 'getMemberShareData',
  'getPriceListAdmin', 'savePackage', 'setPackageActive', 'deletePackage', 'reorderPackages', 'getClassGroups',
  'setCoachPin', 'setMemberCoach', 'assignClientsToCoach',
  'syncFinanceTransactions', 'getBills', 'getBillDetail', 'saveBillAdjust', 'savePayment', 'saveExpense', 'getExpenses', 'getFinanceCategories', 'saveFinanceCategory', 'deleteFinanceCategory', 'archiveFinanceItem', 'restoreFinanceItem', 'saveCoachShare', 'getFinanceOverview', 'getFinancePage', 'uploadFinanceProof', 'getFinanceProof', 'exportFinanceCsv',
];
const MEMBER = [
  'getMemberProfile', 'getMemberSessions', 'getMyPushStatus', 'saveMyPush', 'removeMyPush', 'setMyPushPrefs', 'clientBookSchedule', 'clientBookRecurring',
  'clientRescheduleSchedule', 'uploadMemberPhoto', 'updateMemberPhoto',
  'getMyTasks', 'completeMyTask', 'getMyMealToday',
  'getMyCoach', 'getPortalMore', 'getMyNutrition', 'saveMyNutritionProfile', 'setMyMenuStyle', 'getMyShopping', 'swapMyMenuItem', 'swapMyMenuMeal', 'logMyFood', 'deleteMyFood', 'getMyFoodLog', 'copyMyFoodYesterday', 'getMyContent', 'getMyProgram', 'logMyProgramDay', 'getMyProgramProfile', 'saveMyProgramProfile', 'acceptAutoProgram', 'setMyProgramAuto', 'swapMyProgramExercise', 'saveMyRoutine', 'deleteMyRoutine', 'copyRoutineToMine', 'getMyWorkout', 'logMyWorkout', 'rateSession', 'getMyPackageEval', 'submitMyPackageEval', 'getMyHealthForm', 'submitMyHealthForm', 'getMyAssessment', 'getMyProgress', 'markBadgesSeen', 'requestRenewal', 'getMyRenewal', 'saveMyMeasurement', 'deleteMyMeasurement', 'uploadMyProgressPhoto', 'getMyProgressPhoto', 'deleteMyProgressPhoto', 'getMyShareData', 'createClassGroup', 'joinClassGroup', 'leaveClassGroup', 'getMyClassGroup', 'getMyBills', 'markGuideSeen', 'saveMyProfileCard', 'markNotifSeen',
  'requestMyHold', 'cancelMyHoldRequest', 'endMyHold',
  'getMyReport',
];
const OWNER = [
  'testDriveAccess', 'migrateSplitMembersData', 'pertahankanWABaruMemberData', 'pertahankanWABaru',
  'setupDailyTrigger', 'setupWeeklyReportTrigger', 'testNotif', 'setupReminderTrigger', 'repairDateCells', 'rapikanSheet', 'rapikanSheetSekarang',
];
const TRIGGER = ['sendDailyReminderEmail', 'sendWeeklyReportEmail', 'runReminderTick', 'runWarmTick'];

// In PUBLIC for the completeness test, but not real browser API calls.
const NOT_API = ['doGet', 'doPost', 'include', 'sanitizeValue', 'escapeHtmlTelegram'];
const PUBLIC_API = PUBLIC.filter(n => !NOT_API.includes(n));
// What doPost may dispatch: public API + admin + member. Never OWNER / TRIGGER.
const API_FUNCTIONS = [...PUBLIC_API, ...ADMIN, ...MEMBER];

// T-2251: mode baca saja (langganan coach di hub). Every API function is in exactly one of these two lists
// (tests/readonly.test.js). WRITE is refused while read-only is on (_readonlyGate_ via _apiWrites_ in Api.gs);
// READ_OK keeps working: reads, login, PIN change, device push settings, "seen" markers, tests sends, Pusat/relay calls.
const WRITE = [
  'setCoachPin', 'setMemberCoach', 'assignClientsToCoach',
  // public
  'registerNewClient',
  // admin
  'saveClientNutrition', 'decideNutritionAdvice', 'addCoach', 'updateCoach', 'deleteCoach', 'uploadCoachPhoto', 'saveCoach',
  'saveClientNotes', 'saveWorkoutLog', 'snoozeCare', 'saveAssessment', 'saveFitnessTests', 'deleteFitnessTest', 'markHealthReviewed',
  'saveContent', 'deleteContent', 'saveMemberProgram', 'saveExerciseAlias', 'saveGymExercise', 'setGymExerciseActive',
  'regenerateProgram', 'setClientProgramAuto', 'setFormOk', 'saveProgramTemplate', 'deleteProgramTemplate', 'applyProgramTemplate',
  'setTemplateExplore', 'saveSessionNote', 'saveCoachTargets', 'saveCoachAvailability', 'addCoachTimeOff', 'deleteCoachTimeOff',
  'setCoachActive', 'setSelfCoach', 'assignUnassignedToSelf', 'addMember', 'updateMemberProfile', 'deleteMember',
  'addSchedule', 'addRecurringSchedule', 'deleteRecurringGroup', 'updateScheduleData', 'updateScheduleCoach', 'completeSession', 'deleteSchedule',
  'updateAppSettings', 'addTask', 'updateTask', 'deleteTask', 'deleteTaskGroup', 'saveTaskTemplate', 'deleteTaskTemplate',
  'setMemberMealReminder', 'setMemberReminderPrefs', 'decideRenewal', 'saveMemberMeasurement', 'deleteMemberMeasurement',
  'setClientHold', 'endClientHold', 'deleteClientHold', 'decideHoldRequest',
  'saveExerciseNote', 'deleteWorkoutEntries', 'logClientFood', 'deleteClientFood', 'saveFoodFeedback',
  'savePackage', 'setPackageActive', 'deletePackage', 'reorderPackages',
  'syncFinanceTransactions', 'saveBillAdjust', 'savePayment', 'saveExpense', 'saveFinanceCategory', 'deleteFinanceCategory',
  'archiveFinanceItem', 'restoreFinanceItem', 'saveCoachShare', 'uploadFinanceProof',
  // member
  'clientBookSchedule', 'clientBookRecurring', 'clientRescheduleSchedule', 'uploadMemberPhoto', 'updateMemberPhoto', 'completeMyTask',
  'saveMyNutritionProfile', 'setMyMenuStyle', 'swapMyMenuItem', 'swapMyMenuMeal', 'logMyFood', 'deleteMyFood', 'copyMyFoodYesterday',
  'logMyProgramDay', 'saveMyProgramProfile', 'acceptAutoProgram', 'setMyProgramAuto', 'swapMyProgramExercise', 'saveMyRoutine',
  'deleteMyRoutine', 'copyRoutineToMine', 'logMyWorkout', 'rateSession', 'submitMyPackageEval', 'submitMyHealthForm', 'requestRenewal',
  'saveMyMeasurement', 'deleteMyMeasurement', 'uploadMyProgressPhoto', 'deleteMyProgressPhoto', 'createClassGroup', 'joinClassGroup',
  'leaveClassGroup', 'saveMyProfileCard', 'requestMyHold', 'cancelMyHoldRequest', 'endMyHold',
];
const READ_OK = [
  'exportMyData',   // T-2255: read-only export, allowed in read-only mode
  'adminLogin', 'memberLoginByPhone', 'memberLoginByKey', 'getPublicSchedules', 'getPriceList', 'getPriceListPublic',
  'getCoaches', 'getLandingStats', 'getPublicTestimonials', 'getPublicAvailability', 'getBusinessHours', 'getOpenSlots',
  'getCoachStatus', 'getPortalBootstrap', 'pushRelayPull', 'pushRelayAck', 'getServerInfo', 'hubStatus', 'hubExport',
  'hubPushKey', 'hubSiteUrl', 'hubReadonly', 'hubPlan', 'checkAdminSession', 'changeAdminPin', 'getAdminBootstrap', 'getAdminExtras',
  'getAdminMore', 'getClientBundle', 'getClientNutrition', 'getClientFoodLog', 'getMembers', 'getMemberTransactionLog',
  'getSchedules', 'previewCoachProfile', 'getClientCare', 'getWorkoutLog', 'getWorkoutSummaryMessage', 'getTestResultMessage',
  'getSessionBriefing', 'getContentAdmin', 'getMemberProgram', 'getManualExercises', 'getGymCatalog', 'getProgramGenPreview',
  'getProgramTemplates', 'getSessionNote', 'getCoachHub', 'getCoachAvailability', 'getCoachesAdmin', 'markSchedulesAsRead',
  'getPeakHourData', 'getCoachMonthlyStats', 'getPackageTrendStats', 'getRevenueSummary', 'getAppSettings', 'getSettingsBundle', 'sendTelegramTest',
  'getTasksForMember', 'getTaskSummary', 'getTaskTemplates', 'sendReminderTest', 'getReminderStatus', 'installReminderTrigger',
  'getReminderLog', 'getAdminPushStatus', 'saveAdminPush', 'removeAdminPush', 'setAdminPushPrefs', 'previewReminderText',
  'getRenewalRequests', 'getMemberProgress', 'getMemberProgressPhoto', 'getMemberShareData', 'getPriceListAdmin',
  'getClassGroups', 'getBills', 'getBillDetail', 'getExpenses', 'getFinanceCategories', 'getFinanceOverview', 'getFinancePage', 'getFinanceProof',
  'exportFinanceCsv', 'getMemberProfile', 'getMemberSessions', 'getMyPushStatus', 'saveMyPush', 'removeMyPush', 'setMyPushPrefs',
  'getMyTasks', 'getMyMealToday', 'getMyCoach', 'getPortalMore', 'getMyNutrition', 'getMyShopping', 'getMyFoodLog',
  'getMyContent', 'getMyProgram', 'getMyProgramProfile', 'getMyWorkout', 'getMyPackageEval', 'getMyHealthForm',
  'getMyAssessment', 'getMyProgress', 'markBadgesSeen', 'getMyRenewal', 'getMyProgressPhoto', 'getMyShareData',
  'getMyClassGroup', 'getMyBills', 'markGuideSeen', 'markNotifSeen', 'getWorkoutExerciseHistory', 'getMyReport', 'getMemberReport',
];

module.exports = { WRITE, READ_OK, PUBLIC, ADMIN, MEMBER, OWNER, TRIGGER, NOT_API, PUBLIC_API, API_FUNCTIONS };
