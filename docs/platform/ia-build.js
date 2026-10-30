#!/usr/bin/env node
// T-1401: builds docs/platform/IA.md and docs/platform/ia-map.html from one screen tree (below).
// The tree is hand-written from App.html / Index.html / Landing*.html (NAV, PUBLIC_TABS, MORE_GROUP,
// navigate / openSheet / openDetail ids, GUIDE_STEPS). The data sheets per RPC are derived from the
// .gs call graph (string literals of sheet names, 5 calls deep; auth helpers left out), so they are
// an approximation: good for planning, not a contract.
//
//   node docs/platform/ia-build.js           # write both files
//   node docs/platform/ia-build.js --check   # exit 1 when an RPC in the tree is unknown or a file is stale
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'apps-script', 'pt-scheduler', 'src');
const SEC = path.join(ROOT, 'apps-script', 'pt-scheduler', 'tests', 'security.test.js');

// ── Roles ────────────────────────────────────────────────────────────────────
// C = coach / owner (panel, PIN), K = client (portal, logged in), G = guest (portal, not logged in), V = visitor (landing)
const ROLE = { C: 'Coach', K: 'Klien', G: 'Tamu portal', V: 'Pengunjung' };

// ── Tree ─────────────────────────────────────────────────────────────────────
// k: site | view | tab | sub | detail | sheet | overlay | menu | section
// rpc: server functions the node calls (reads and writes). "getPortalMore.progress" = data that arrives
//      in a bootstrap part (no call on open). f: flags (dup:<topic>, long). Deep paths are computed.
function n(id, l, k, r, rpc, note, c, f) { return { id, l, k, r, rpc: rpc || [], note: note || '', c: c || [], f: f || [] }; }

const TREE = n('xnk', 'XNK', 'site', 'CKGV', [], 'One Apps Script deployment, three sites. Data in Google Sheets.', [

  // ── Landing ────────────────────────────────────────────────────────────────
  n('landing', 'Landing (xnkbooking.my.id)', 'site', 'V', [], '/exec?view=Landing. Landing.html + LandingScript.html.', [
    n('l-hero', 'Hero + statistik', 'section', 'V', ['getLandingStats']),
    n('l-coach', 'Coach', 'section', 'V', ['getCoaches'], 'Shared cache (K3).', [], ['dup:coach']),
    n('l-program', 'Program', 'section', 'V', [], 'Static text.'),
    n('l-testi', 'Testimoni', 'section', 'V', ['getPublicTestimonials'], 'From the package-evaluation Form answers.'),
    n('l-paket', 'Paket', 'section', 'V', ['getPriceListPublic', 'getPriceList'], 'Categories with onLanding; same JSON as /exec?view=prices (BookingPT static page).', [], ['dup:paket']),
    n('l-jadwal', 'Jadwal kosong', 'section', 'V', ['getOpenSlots'], 'Coach chips first with 2+ coaches; refresh every 2 min.', [], ['dup:slots']),
    n('l-cta', 'Daftar / masuk', 'sheet', 'V', ['registerNewClient', 'memberLoginByPhone'], 'Registration form, then the portal opens logged in.')
  ]),

  // ── Portal ─────────────────────────────────────────────────────────────────
  n('portal', 'Portal klien (book.xnkbooking.my.id)', 'site', 'KG', ['getPortalBootstrap', 'getPortalMore'],
    '/exec?view=public. Opens from xnk_portal_cache; getPortalMore only when moreVer / day changed. Tab switches make no calls.', [
    n('p-chrome', 'Bar bawah + sidebar', 'menu', 'KG', [], 'Phone: Beranda · Jadwal · + · Progres · Lainnya (PUBLIC_TABS). Desktop sidebar: NAV.public (7). Guests: GUEST_NAV (Masuk, Jadwal, Paket, Coach).', [
      n('p-plus', '+ Mau apa?', 'sheet', 'K', [], 'sheet-quick-client: Booking · Mulai latihan · Catat yang lewat (clientQuick).'),
      n('p-settings', 'Tampilan / Pengaturan', 'sheet', 'KG', [], 'sheet-settings: theme, Keluar. Also reachable from Lainnya → Tampilan and the sidebar foot.', [], ['dup:tema']),
      n('p-guide', 'Panduan klien baru', 'overlay', 'K', ['markGuideSeen'], 'GUIDE_STEPS over 8 pages (beranda, booking, jadwal, paket, coach, progres, program, info). Self-registered clients only.'),
      n('p-a2hs', 'Hint Home Screen (iOS)', 'overlay', 'KG', [], '#a2hs, once per device.'),
      n('p-offline', 'Layar offline (wrapper)', 'overlay', 'K', ['logMyWorkout', 'logMyFood'], 'offline-host.js in BookingPT-Client: Latihan, Makan, Jadwal (read-only), Progres (read-only). Queue imported on reconnect.')
    ]),
    n('p-login', 'Masuk member', 'view', 'G', ['memberLoginByPhone', 'memberLoginByKey'], 'public-login.', [
      n('p-register', 'Daftar klien baru', 'sheet', 'G', ['registerNewClient', 'getOpenSlots'], 'modal-public-register; coach required with 2+ coaches.'),
      n('p-notmember', 'Belum terdaftar', 'sheet', 'G', [], 'modal-not-member.')
    ]),
    n('p-beranda', 'Beranda', 'view', 'K', ['getPortalBootstrap', 'getPortalMore.week', 'getPortalMore.insight'], 'public-dashboard. 12 slots stacked on the phone.', [
      n('p-b-next', 'Sesi berikutnya + countdown', 'section', 'K', ['getPortalBootstrap'], '', [
        n('p-b-addcal', 'Tambah ke kalender', 'sheet', 'K', [], 'modal-add-cal: .ics (buildIcs) or Google Calendar link. Browser only.')
      ], ['dup:sesi']),
      n('p-b-quota', 'Sisa sesi (ring)', 'section', 'K', ['getPortalBootstrap'], '', [], ['dup:paket']),
      n('p-b-renew', 'Perpanjang / beli paket', 'sheet', 'K', ['requestRenewal', 'getPortalMore.renewal'], 'sheet-renew (also from Paket). Optimistic send.', [], ['dup:paket']),
      n('p-b-bill', 'Tagihan', 'section', 'K', ['getPortalMore.bills', 'getMyBills'], 'Only with FIN_PORTAL_VISIBLE.'),
      n('p-b-week', 'Minggu ini', 'section', 'K', ['getPortalMore.week'], 'Strip of the week.', [], ['dup:streak']),
      n('p-b-class', 'Kelas / grup', 'section', 'K', ['getPortalMore.classGroup', 'getMyClassGroup', 'createClassGroup', 'leaveClassGroup'], 'In a fold with the coach card.', [
        n('p-b-classjoin', 'Gabung grup', 'sheet', 'K', ['joinClassGroup'], 'sheet-class-join.')
      ]),
      n('p-b-coach', 'Coach saya (lipatan)', 'section', 'K', ['getMyCoach', 'getCoachStatus'], '', [], ['dup:coach']),
      n('p-b-feedback', 'Nilai sesi / evaluasi paket', 'section', 'K', ['rateSession', 'getPortalBootstrap'], 'pendingRating, packageEval.eligible.', [
        n('p-b-pkgeval', 'Evaluasi paket', 'sheet', 'K', ['getMyPackageEval', 'submitMyPackageEval'], 'modal-pkg-eval, five aspects.')
      ]),
      n('p-b-care', 'Form kesehatan', 'section', 'K', ['getPortalMore.healthForm', 'getMyHealthForm'], 'pub-care-wrap.', [
        n('p-b-health', 'Isi form kesehatan', 'sheet', 'K', ['submitMyHealthForm'], 'modal-portal-health.')
      ], ['dup:tes']),
      n('p-b-todaywl', 'Latihan hari ini', 'section', 'K', ['getPortalMore.workout'], 'pub-today-wl.', [], ['dup:latihan']),
      n('p-b-teasers', 'Teaser tab lain', 'section', 'K', ['getPortalMore'], 'pub-teasers: links to Progres / Latihan / Info.'),
      n('p-b-jadwalku', 'Jadwalku', 'section', 'K', ['getPortalBootstrap'], 'Own upcoming sessions.', [], ['dup:sesi']),
      n('p-b-badge', 'Perayaan badge', 'overlay', 'K', ['getMyProgress', 'markBadgesSeen'], 'sheet-badge after loadMyProgress.', [], ['dup:streak']),
      n('p-b-profile', 'Profil saya', 'sheet', 'K', [], 'sheet-my-profile (avatar button).', [
        n('p-b-crop', 'Foto profil', 'sheet', 'K', ['uploadMemberPhoto', 'updateMemberPhoto'], 'modal-crop-avatar.')
      ])
    ], ['long']),
    n('p-jadwal', 'Jadwal', 'view', 'KG', ['getPortalBootstrap', 'getOpenSlots'], 'calendar (client mode). Free-hours grid loaded on open, reused 2 min.', [
      n('p-j-grid', 'Pilih hari + jam', 'section', 'KG', ['getOpenSlots'], 'Coach chips first with 2+ coaches.', [], ['dup:slots']),
      n('p-j-book', 'Booking (satu / rutin)', 'sheet', 'K', ['clientBookSchedule', 'clientBookRecurring'], 'opts.soft: a conflict returns alternatives + fresh openSlots.'),
      n('p-j-mine', 'Sesi saya', 'section', 'K', ['getPortalBootstrap'], 'Upcoming own sessions.', [
        n('p-j-resched', 'Pindah jadwal', 'sheet', 'K', ['clientRescheduleSchedule'], 'modal-edit-schedule (client mode).'),
        n('p-j-addcal', 'Tambah ke kalender', 'sheet', 'K', [], 'modal-add-cal.')
      ], ['dup:sesi'])
    ]),
    n('p-progres', 'Progres', 'view', 'K', ['getPortalMore.progress', 'getPortalMore.insight'], 'public-progress. Black hero + sub-tabs (pgSeg).', [
      n('p-pg-ring', 'Ringkasan', 'sub', 'K', ['getPortalMore.insight', 'getPortalMore.progress'], 'Body report, streak and sessions tiles, challenge of the month.', [], ['dup:berat', 'dup:streak']),
      n('p-pg-ukuran', 'Ukuran', 'sub', 'K', ['getMyProgress'], 'Weight, waist, 8 body measures, chart, photos.', [
        n('p-pg-entry', 'Catat ukuran', 'sheet', 'K', ['saveMyMeasurement'], 'sheet-progress.'),
        n('p-pg-photos', 'Foto progres', 'sheet', 'K', ['uploadMyProgressPhoto', 'deleteMyProgressPhoto'], 'sheet-progress-photos (private, data URLs).', [
          n('p-pg-photoview', 'Lihat foto', 'sheet', 'K', ['getMyProgressPhoto'], 'sheet-photo-view.')
        ])
      ], ['dup:berat']),
      n('p-pg-tes', 'Tes', 'sub', 'K', ['getPortalMore.assessment', 'getMyAssessment'], 'Fitness tests with trend charts, assessment.', [], ['dup:tes']),
      n('p-pg-riwayat', 'Riwayat', 'sub', 'K', ['getPortalMore.progress', 'getPortalMore.workout'], 'Badges, workout stats (1RM, volume, body parts), session history.', [], ['dup:streak', 'dup:latihan', 'dup:sesi'])
    ]),
    n('p-more', 'Lainnya', 'view', 'K', [], 'public-more. Lights for MORE_GROUP (Latihan, Info, Paket, Coach).', [
      n('p-latihan', 'Latihan', 'view', 'K', ['getPortalMore.program', 'getPortalMore.workout', 'getPortalMore.tasks', 'getPortalMore.nutrition'], 'public-program. Segment Latihan | Makan.', [
        n('p-lt-latihan', 'Latihan', 'sub', 'K', ['getMyProgram', 'getMyWorkout'], 'Mulai latihan kosong, Dari coach, Rutinitas saya, PR.', [
          n('p-lt-routine', 'Detail rutinitas', 'detail', 'K', ['getMyProgram'], 'Chart volume / reps / duration (routineHist).', [
            n('p-lt-edit', 'Ubah rutinitas', 'sheet', 'K', ['saveMyRoutine', 'deleteMyRoutine', 'copyRoutineToMine'], 'modal-program (client mode), max 10 own routines.', [
              n('p-lt-exsearch', 'Cari gerakan', 'sheet', 'K', [], 'ex-search: exercises.min.json (GitHub Pages), filters, recent chips.')
            ])
          ]),
          n('p-lt-explore', 'Jelajahi', 'sub', 'K', ['getMyProgram', 'copyRoutineToMine'], 'Templates with Jelajahi on.'),
          n('p-lt-logger', 'Logger latihan', 'overlay', 'K', ['getMyWorkout', 'logMyWorkout'], 'wl-screen full screen; draft in xnk_wl_<scope>, queue xnk_wl_queue.', [
            n('p-lt-wlsheet', 'Menu gerakan / riwayat / istirahat', 'sheet', 'K', [], 'modal-wl.'),
            n('p-lt-wlex', 'Tambah gerakan', 'sheet', 'K', [], 'ex-search.')
          ], ['long']),
          n('p-lt-tasks', 'PR (task)', 'section', 'K', ['getMyTasks'], '', [
            n('p-lt-taskdone', 'Tandai selesai', 'sheet', 'K', ['completeMyTask'], 'modal-task-done.')
          ], ['dup:pr']),
          n('p-lt-meal', 'Makan hari ini (tips)', 'section', 'K', ['getMyMealToday'], 'pub-meal-slot.', [], ['dup:gizi'])
        ]),
        n('p-lt-makan', 'Makan', 'sub', 'K', ['getPortalMore.nutrition', 'getMyNutrition'], 'Ring, macro bars, Tubuhmu, Menu hari ini, log, Aturan makan.', [
          n('p-mk-onb', 'Lengkapi data (3 langkah)', 'sheet', 'K', ['saveMyMeasurement', 'saveMyNutritionProfile'], 'modal-nut-onb; also asks weight.', [], ['dup:berat']),
          n('p-mk-add', 'Catat makan', 'sheet', 'K', ['logMyFood', 'copyMyFoodYesterday'], 'modal-nut-add; foods.min.json search, offline queue xnk_food_queue.'),
          n('p-mk-edit', 'Ubah / hapus catatan', 'sheet', 'K', ['deleteMyFood', 'logMyFood'], 'modal-nut-edit.'),
          n('p-mk-swap', 'Ganti menu', 'sheet', 'K', ['swapMyMenuItem'], 'modal-nut-swap.'),
          n('p-mk-shop', 'Daftar belanja', 'sheet', 'K', ['getMyShopping'], 'modal-nut-shop.'),
          n('p-mk-info', 'Sumber (i)', 'sheet', 'K', [], 'modal-nut-info.')
        ], ['long', 'dup:gizi'])
      ]),
      n('p-info', 'Info & Tips', 'view', 'K', ['getPortalMore.content', 'getMyContent'], 'public-info. Announcements, tips, videos; "new" dots via info.latestAt.'),
      n('p-share', 'Kartu saya', 'view', 'K', ['getMyShareData'], 'public-share gallery (SHARE_ENABLED).', [
        n('p-sh-editor', 'Editor kartu', 'sheet', 'K', ['getMyShareData', 'getMyProgressPhoto'], 'sheet-share full screen: 11 cards, 5 styles, 3 sizes, 8 tools.', [], ['long', 'dup:berat', 'dup:streak', 'dup:latihan', 'dup:gizi'])
      ]),
      n('p-paket', 'Paket', 'view', 'KG', ['getPriceList'], 'public-catalog.', [
        n('p-pk-renew', 'Pilih paket → perpanjang', 'sheet', 'K', ['requestRenewal'], 'sheet-renew with that package picked.'),
        n('p-pk-register', 'Pilih paket (tamu) → daftar', 'sheet', 'G', ['registerNewClient'], 'modal-public-register.')
      ], ['dup:paket']),
      n('p-coach', 'Coach', 'view', 'KG', ['getMyCoach', 'getCoachStatus', 'getPublicTestimonials'], 'public-coaches.', [
        n('p-co-sheet', 'Profil coach', 'sheet', 'KG', [], 'sheet-coach-profile.')
      ], ['dup:coach']),
      n('p-m-theme', 'Tampilan', 'menu', 'K', [], 'Opens sheet-settings.', [], ['dup:tema']),
      n('p-m-logout', 'Keluar', 'menu', 'K', [], 'Clears device copies and queues.')
    ])
  ]),

  // ── Panel ──────────────────────────────────────────────────────────────────
  n('panel', 'Panel coach (xnk.my.id)', 'site', 'C', ['adminLogin', 'getAdminBootstrap', 'getAdminMore'],
    '/exec. PIN login. Opens from xnk_admin_cache; client pages from xnk_client_cache.', [
    n('a-chrome', 'Bar bawah + sidebar + topbar', 'menu', 'C', [], 'Phone: Dashboard · Jadwal · + · Klien · Coach (NAV.admin). Sidebar adds Konten, Keuangan (when on), Pengaturan.', [
      n('a-quick', '+ Tambah cepat', 'sheet', 'C', [], 'sheet-quick: Booking · Klien · Coach · Konten · Pembayaran · Pengeluaran.'),
      n('a-notif', 'Booking baru (lonceng)', 'sheet', 'C', ['markSchedulesAsRead'], 'modal-notifications.', [], ['dup:sesi']),
      n('a-offline', 'Layar offline (wrapper)', 'overlay', 'C', ['saveMemberMeasurement', 'saveSessionNote', 'saveWorkoutLog'], 'index.html: today\'s schedule → client → Latihan, Ukuran, Catatan sesi.')
    ]),
    n('a-dash', 'Dashboard', 'view', 'C', ['getAdminBootstrap', 'getAdminMore'], 'dashboard.', [
      n('a-d-today', 'Hari ini / sesi berikutnya', 'section', 'C', ['getAdminBootstrap'], '', [], ['dup:sesi']),
      n('a-d-new', 'Booking baru', 'section', 'C', ['markSchedulesAsRead'], '', [], ['dup:sesi']),
      n('a-d-att', 'Perlu perhatian', 'section', 'C', ['getAdminMore.signals', 'getTaskSummary'], 'Flags; links to Klien filters.', [], ['dup:sinyal']),
      n('a-d-renew', 'Minta perpanjang', 'section', 'C', ['getRenewalRequests', 'decideRenewal'], 'Approve / reject (optimistic).'),
      n('a-d-stats', 'Statistik (lipat)', 'section', 'C', ['getRevenueSummary', 'getFinanceOverview', 'getPackageTrendStats'], 'Revenue KPI, weekly chart, peak-hour heatmap, package trend, coach leaderboard.', [], ['long', 'dup:uang'])
    ], ['long']),
    n('a-jadwal', 'Jadwal', 'view', 'C', ['getAdminBootstrap', 'updateScheduleData'], 'calendar (admin): week / day, drag to move.', [
      n('a-j-form', 'Tambah / ubah jadwal', 'sheet', 'C', ['addSchedule', 'addRecurringSchedule', 'updateScheduleData', 'getSchedules'], 'modal-edit-schedule (+ modal-sch-title).'),
      n('a-j-detail', 'Detail sesi', 'detail', 'C', ['getSessionBriefing', 'completeSession', 'updateScheduleCoach', 'deleteSchedule', 'deleteRecurringGroup', 'getMembers'], 'openDetail(session:). Briefing shows last focus.', [
        n('a-j-note', 'Catatan sesi', 'sheet', 'C', ['getSessionNote', 'saveSessionNote'], 'modal-session-note; returns pasca-sesi WhatsApp text.'),
        n('a-j-wl', 'Catat latihan klien', 'overlay', 'C', ['getWorkoutLog', 'getMemberProgram', 'saveWorkoutLog'], 'wl-screen (admin scope).', [], ['dup:latihan']),
        n('a-j-client', '→ Profil klien', 'menu', 'C', [], 'Hops to the client page (same detail panel).')
      ])
    ]),
    n('a-klien', 'Klien', 'view', 'C', ['getAdminBootstrap', 'getAdminMore.signals', 'getAdminMore.memberVers'], 'clients. List (phone) / card grid (≥ 768 px), search, filters, KPI tiles, flags, 4-week bars, weight delta.', [
      n('a-k-add', 'Klien baru', 'sheet', 'C', ['addMember'], 'modal-add-member.'),
      n('a-k-page', 'Profil klien', 'detail', 'C', ['getClientBundle'], 'openDetail(client:). One call; copy in xnk_client_cache. Four tabs.', [
        n('a-k-ring', 'Ringkasan', 'tab', 'C', ['getClientBundle'], 'Sorotan, data, PR, upcoming, history, WhatsApp reminders.', [
          n('a-k-sorotan', 'Sorotan', 'section', 'C', ['getClientBundle.insight'], 'Last / next session, weight 30 days, own training this week, flags.', [], ['dup:berat', 'dup:sesi', 'dup:sinyal']),
          n('a-k-edit', 'Ubah data / hapus klien', 'sheet', 'C', ['updateMemberProfile', 'deleteMember'], 'modal-edit-profile, modal-confirm.'),
          n('a-k-pr', 'PR (Task)', 'section', 'C', ['getTasksForMember', 'updateTask', 'deleteTask'], 'Fold.', [
            n('a-k-task', 'Tambah / ubah PR', 'sheet', 'C', ['addTask', 'updateTask', 'getTaskTemplates', 'saveTaskTemplate', 'deleteTaskTemplate'], 'modal-task.')
          ], ['dup:pr']),
          n('a-k-upcoming', 'Jadwal mendatang', 'section', 'C', ['getAdminBootstrap'], 'Fold, 5 rows.', [], ['dup:sesi']),
          n('a-k-history', 'Riwayat', 'section', 'C', ['getAdminBootstrap'], 'Fold, 12 rows.', [], ['dup:sesi']),
          n('a-k-rem', 'Pengingat WhatsApp', 'section', 'C', ['setMemberReminderPrefs', 'setMemberMealReminder'], 'Per-client off switches.', [], ['dup:pengingat'])
        ]),
        n('a-k-prog', 'Progres', 'tab', 'C', ['getClientBundle.progress', 'getClientBundle.care', 'getMemberProgress'], 'Rapor tubuh hero → tiles → entries → folds → care. Longest tab.', [
          n('a-k-pghero', 'Rapor tubuh + tiles', 'section', 'C', ['getClientBundle.insight'], 'Streak, sessions done.', [], ['dup:berat', 'dup:streak']),
          n('a-k-pgentries', 'Catatan progres', 'section', 'C', ['getMemberProgress', 'saveMemberMeasurement', 'deleteMemberMeasurement'], 'Chart, entries, photos.', [
            n('a-k-pgentry', 'Catat ukuran', 'sheet', 'C', ['saveMemberMeasurement'], 'sheet-progress (admin).'),
            n('a-k-pgphoto', 'Lihat foto', 'sheet', 'C', ['getMemberProgressPhoto'], 'sheet-photo-view.')
          ], ['dup:berat']),
          n('a-k-pgfolds', 'Lingkar badan & simetri / yang berkaitan', 'section', 'C', ['getClientBundle.insight'], 'Folds.', [], ['dup:berat']),
          n('a-k-care', 'Perawatan: kesehatan, asesmen, tes, catatan', 'section', 'C', ['getClientCare', 'markHealthReviewed', 'snoozeCare', 'getTestResultMessage'], 'Admin-only care data.', [
            n('a-k-health', 'Form kesehatan', 'sheet', 'C', ['markHealthReviewed'], 'modal-care-health.', [], ['dup:tes']),
            n('a-k-assess', 'Asesmen', 'sheet', 'C', ['saveAssessment'], 'modal-care-assess; also writes body measures to Progress.', [], ['dup:berat']),
            n('a-k-tests', 'Tes kebugaran (+ timer)', 'sheet', 'C', ['saveFitnessTests'], 'modal-care-tests.', [], ['dup:tes']),
            n('a-k-notes', 'Catatan coach', 'sheet', 'C', ['saveClientNotes'], 'modal-care-notes.')
          ])
        ], ['long']),
        n('a-k-lat', 'Latihan', 'tab', 'C', ['getClientBundle.program', 'getClientBundle.workout', 'getMemberProgram'], 'Minggu ini hero, activity / strength / balance cards, program, workout log + stats.', [
          n('a-k-prog-ed', 'Editor program', 'sheet', 'C', ['saveMemberProgram', 'getProgramTemplates', 'saveProgramTemplate', 'deleteProgramTemplate'], 'modal-program (form).', [
            n('a-k-exsearch', 'Cari gerakan', 'sheet', 'C', [], 'ex-search.')
          ]),
          n('a-k-wl', 'Logger latihan', 'overlay', 'C', ['getWorkoutLog', 'saveWorkoutLog', 'getWorkoutSummaryMessage'], 'wl-screen (admin scope).', [], ['dup:latihan']),
          n('a-k-share', 'Kartu bagikan', 'sheet', 'C', ['getMemberShareData'], 'sheet-share (admin).')
        ], ['long']),
        n('a-k-gizi', 'Gizi', 'tab', 'C', ['getClientBundle.nutrition', 'getClientBundle.foodLog', 'getClientNutrition'], 'Gizi hero, target, inputs, food log, suggestions.', [
          n('a-k-nutedit', 'Ubah data gizi', 'sheet', 'C', ['saveClientNutrition'], 'modal-nut-edit (admin).', [], ['dup:berat']),
          n('a-k-nutadv', 'Saran ±125 kkal', 'section', 'C', ['decideNutritionAdvice'], '', [], ['dup:gizi'])
        ])
      ], ['long'])
    ]),
    n('a-coach', 'Coach', 'view', 'C', ['getCoachHub', 'getCoachesAdmin'], 'coaches. Segment Klien | Coach (coachTab).', [
      n('a-c-hub', 'Klien (hub)', 'tab', 'C', ['getCoachHub', 'getAdminMore.coachHub'], 'Hari ini, Target bulan ini, Latihan klien (7 hari), Penilaian sesi (30 hari), Saran target gizi.', [
        n('a-c-targets', 'Atur target', 'sheet', 'C', ['saveCoachTargets'], 'modal-coach-targets.'),
        n('a-c-assign', 'Ambil sesi tanpa coach', 'menu', 'C', ['assignUnassignedToSelf'], '')
      ], ['dup:sesi', 'dup:latihan', 'dup:gizi']),
      n('a-c-list', 'Coach', 'tab', 'C', ['getCoachesAdmin'], 'Coach list.', [
        n('a-c-add', 'Tambah / ubah coach', 'sheet', 'C', ['saveCoach', 'uploadCoachPhoto'], 'modal-add-coach.'),
        n('a-c-detail', 'Profil coach', 'detail', 'C', ['setCoachActive', 'setSelfCoach', 'deleteCoach'], 'openDetail(coach:).', [
          n('a-c-preview', 'Pratinjau profil', 'sheet', 'C', ['previewCoachProfile'], 'modal-coach-preview.'),
          n('a-c-hours', 'Jam kerja', 'detail', 'C', ['getCoachAvailability'], 'openDetail(hours).', [
            n('a-c-hoursed', 'Ubah jam', 'sheet', 'C', ['saveCoachAvailability'], 'modal-coach-hours.'),
            n('a-c-timeoff', 'Cuti', 'sheet', 'C', ['addCoachTimeOff', 'deleteCoachTimeOff'], 'modal-coach-timeoff.')
          ])
        ])
      ])
    ]),
    n('a-konten', 'Konten', 'view', 'C', ['getContentAdmin'], 'content (sidebar, + sheet). Pengumuman / tips / video.', [
      n('a-kn-ed', 'Editor konten', 'sheet', 'C', ['saveContent', 'deleteContent'], 'modal-content.')
    ]),
    n('a-uang', 'Keuangan', 'view', 'C', ['getFinanceOverview'], 'finance (FIN_ENABLED). Month picker, KPI tiles.', [
      n('a-u-bills', 'Tagihan', 'tab', 'C', ['getBills', 'exportFinanceCsv', 'restoreFinanceItem', 'syncFinanceTransactions'], '', [
        n('a-u-bill', 'Detail tagihan', 'detail', 'C', ['getBillDetail', 'saveBillAdjust', 'archiveFinanceItem'], 'openDetail(bill:) / sheet-fin-bill.', [
          n('a-u-pay', 'Pembayaran', 'sheet', 'C', ['getBills', 'savePayment', 'archiveFinanceItem', 'getFinanceCategories', 'uploadFinanceProof'], 'sheet-fin-payment.', [
            n('a-u-proof', 'Bukti', 'sheet', 'C', ['getFinanceProof'], 'Private proof viewer.')
          ])
        ])
      ]),
      n('a-u-exps', 'Pengeluaran', 'tab', 'C', ['getExpenses'], '', [
        n('a-u-exp', 'Pengeluaran', 'sheet', 'C', ['saveExpense', 'archiveFinanceItem', 'getFinanceCategories', 'uploadFinanceProof'], 'sheet-fin-expense.')
      ]),
      n('a-u-report', 'Laporan', 'tab', 'C', ['getFinanceOverview'], 'Bars, coach share.', [], ['dup:uang'])
    ]),
    n('a-set', 'Pengaturan', 'view', 'C', ['getAppSettings', 'getReminderStatus', 'getPriceListAdmin'], 'settings. 8 sections (SET_SECTIONS), per-section save, dirty tracking.', [
      n('a-s-tampilan', 'Tampilan', 'sub', 'C', ['updateAppSettings'], 'Theme + feature switches: Gizi, feedback, kartu bagikan (+ QR), panduan klien.'),
      n('a-s-paket', 'Paket & Harga', 'sub', 'C', ['getPriceListAdmin', 'setPackageActive', 'reorderPackages', 'deletePackage', 'getPriceList'], '', [
        n('a-s-pkg', 'Editor paket', 'sheet', 'C', ['savePackage'], 'sheet-package (class fields too).'),
        n('a-s-pkgmenu', 'Menu paket', 'sheet', 'C', [], 'sheet-pkg-menu: edit, duplicate, move, (de)activate, delete.')
      ], ['dup:paket']),
      n('a-s-rmd', 'Pengingat Klien', 'sub', 'C', ['updateAppSettings', 'getReminderStatus', 'getReminderLog', 'installReminderTrigger', 'previewReminderText', 'sendReminderTest'], '13 job cards, each with hour, template, preview, test.', [], ['long', 'dup:pengingat']),
      n('a-s-notif', 'Notifikasi Admin', 'sub', 'C', ['updateAppSettings', 'sendTelegramTest'], 'Telegram, masked token.'),
      n('a-s-jam', 'Jam Operasional', 'sub', 'C', ['updateAppSettings'], 'Business hours per day.'),
      n('a-s-uang', 'Keuangan', 'sub', 'C', ['updateAppSettings', 'getFinanceCategories', 'getCoachesAdmin', 'saveFinanceCategory', 'deleteFinanceCategory', 'saveCoachShare', 'syncFinanceTransactions'], 'On/off, portal card, categories, methods, coach share.', [], ['long']),
      n('a-s-aman', 'Keamanan', 'sub', 'C', ['updateAppSettings', 'changeAdminPin'], 'Session days, change PIN.'),
      n('a-s-akun', 'Akun', 'sub', 'C', [], 'Keluar on this device.')
    ], ['long'])
  ])
]);

// ── Findings for V9 (D65–D67) ────────────────────────────────────────────────
const DUP = {
  berat: 'Weight / body measures',
  sesi: 'Sessions (upcoming, history, today)',
  streak: 'Streak, badges, week strip',
  latihan: 'Workout log and stats',
  tes: 'Fitness tests, assessment, health form',
  paket: 'Package, remaining sessions, renewal',
  gizi: 'Calories / nutrition',
  coach: 'Coach profile',
  pr: 'PR (tasks)',
  slots: 'Free hours grid',
  sinyal: 'Client signals / flags',
  uang: 'Revenue / finance numbers',
  pengingat: 'WhatsApp reminder switches',
  tema: 'Theme setting'
};

const NOTES = [
  '**Coach client page (D67).** One detail panel holds four tabs and ~20 blocks. Progres alone stacks a hero, tiles, entries, two folds and four care blocks; weight appears in Ringkasan (Sorotan), Progres (hero, entries, folds, asesmen) and Gizi (inputs). On the phone the panel is one column, on wide desktop the same blocks reflow into two columns via container queries, so the order differs by width.',
  '**Pengaturan (D67).** Eight sections; Pengingat Klien alone has 13 job cards with an accordion each, and feature switches (Gizi, feedback, kartu, panduan) live under Tampilan rather than next to the feature. Per-client reminder switches live on the client page, global ones here.',
  '**Client Beranda + Lainnya (D67).** Beranda stacks up to 12 slots (next session, quota, renew, bill, week, class, coach, feedback, health form, today\'s workout, teasers, Jadwalku). Lainnya is a list of 7 rows, of which Latihan is a full second home (segment Latihan | Makan, routines, logger, nutrition) two taps deep.',
  '**Two "+" menus** (sheet-quick, sheet-quick-client) repeat in-page buttons (Booking, Klien baru, Mulai latihan). Fine as shortcuts; keep them in the same place in every pattern.',
  '**Shared overlays.** wl-screen, ex-search, modal-program, sheet-share, sheet-progress and modal-nut-edit serve both roles with a scope switch; a V9 pattern change must cover both.',
  '**Server already bundles.** Screens read bootstrap parts (getPortalMore, getClientBundle, getAdminMore); a regroup of menus does not need new RPCs, only a different place to render the same part.'
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const SHEETS = ['Members', 'MemberData', 'MembersLog', 'PriceList', 'Schedules', 'Tasks', 'TaskTemplates', 'ReminderLog', 'MealTips', 'Progress', 'ProgressPhotos', 'RenewalRequests', 'Coaches', 'CoachAvailability', 'CoachTimeOff', 'Assessments', 'FitnessTests', 'HealthScreening', 'ClassGroups', 'SessionNotes', 'SessionRatings', 'PackageEvaluations', 'ProgramItems', 'ProgramLog', 'Content', 'WorkoutLog', 'WorkoutSessions', 'FoodLog', 'NutritionAdvice', 'Tagihan', 'Pembayaran', 'Pengeluaran', 'KategoriKeuangan', 'Logs'];
const SKIP = /^(require[A-Za-z]*_|_bump[A-Za-z]*_|_bustS[a-z]*_|kirim[A-Za-z]*_|_locked_)$/;

function sheetMap() {
  const fns = Object.create(null);
  fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).forEach(function (f) {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/mg; const idx = []; let m;
    while ((m = re.exec(t))) idx.push([m[1], m.index]);
    idx.forEach(function (x, i) { fns[x[0]] = t.slice(x[1], i + 1 < idx.length ? idx[i + 1][1] : t.length); });
  });
  const direct = Object.create(null), calls = Object.create(null);
  Object.keys(fns).forEach(function (k) {
    const b = fns[k];
    const s = new Set(SHEETS.filter(x => new RegExp('[\'"]' + x + '[\'"]').test(b)));
    if (/RMD_VARIASI_SHEET/.test(b)) s.add('PesanVariasi');
    if (/EVAL_SHEET_ID/.test(b)) s.add('Form evaluasi');
    (b.match(/_finSheet_\(\s*'([A-Za-z]+)'/g) || []).forEach(x => s.add(x.match(/'([A-Za-z]+)'/)[1]));
    direct[k] = s;
    calls[k] = new Set((b.match(/\b[A-Za-z0-9_$]+(?=\s*\()|\b[A-Za-z0-9_$]+Impl_\b/g) || []).filter(c => c !== k && fns[c] && !SKIP.test(c)));
  });
  const walk = function (k, d, seen) {
    const out = new Set(direct[k]);
    if (d <= 0) return out;
    calls[k].forEach(function (c) { if (seen.has(c)) return; seen.add(c); walk(c, d - 1, seen).forEach(s => out.add(s)); });
    return out;
  };
  const res = Object.create(null);
  Object.keys(fns).filter(k => !/_$/.test(k)).forEach(k => { res[k] = Array.from(walk(k, 5, new Set([k]))).sort(); });
  return res;
}

function authMap() {
  const t = fs.readFileSync(SEC, 'utf8'), res = Object.create(null);
  [['PUBLIC', 'public'], ['ADMIN', 'admin'], ['MEMBER', 'member'], ['OWNER', 'owner']].forEach(function (p) {
    const m = t.match(new RegExp('const ' + p[0] + ' = \\[([\\s\\S]*?)\\];'));
    if (m) (m[1].match(/'([A-Za-z0-9_]+)'/g) || []).forEach(x => { res[x.slice(1, -1)] = p[1]; });
  });
  return res;
}

const rpcName = s => s.split(/[ .]/)[0];
const TAPLESS = { site: 1, section: 1 };

function annotate(node, depth, trail) {
  node.taps = depth;
  node.path = trail.concat(node.l);
  if (node.taps >= 4) node.f = node.f.concat(['deep']);
  node.c.forEach(ch => annotate(ch, depth + (TAPLESS[ch.k] ? 0 : 1), node.k === 'site' && node.id === 'xnk' ? [] : node.path));
}
function walkAll(node, fn) { fn(node); node.c.forEach(ch => walkAll(ch, fn)); }

// ── Build ────────────────────────────────────────────────────────────────────
function build() {
  const sheets = sheetMap(), auth = authMap(), errors = [];
  annotate(TREE, 0, []);
  const rpcInfo = {};
  walkAll(TREE, function (nd) {
    nd.rpc.forEach(function (r) {
      const k = rpcName(r);
      if (!sheets[k]) { if (r.indexOf('(part)') === -1) errors.push(nd.id + ': unknown RPC ' + k); return; }
      rpcInfo[k] = { auth: auth[k] || '?', sheets: sheets[k] };
    });
  });

  // IA.md
  const kindIcon = { site: '🌐', view: '▣', tab: '▤', sub: '▥', detail: '◧', sheet: '▭', overlay: '◳', menu: '☰', section: '·' };
  const flagTxt = f => f.map(x => x === 'long' ? '**long**' : x === 'deep' ? '**deep**' : x.indexOf('dup:') === 0 ? '⧉ ' + x.slice(4) : x).join(', ');
  const lines = [];
  lines.push('# Information architecture: every screen (T-1401)', '');
  lines.push('Inventory of the live XNK app for Phase V (D31) and the V9 tidy-up (D65–D67). It describes what exists today; nothing here is a redesign. Interactive mind map: [ia-map.html](ia-map.html) (open the file in a browser; zoom, pan, collapse, click a node for its RPCs).', '');
  lines.push('Generated by `node docs/platform/ia-build.js` from the tree in that script (hand-read from `App.html`, `Index.html`, `Landing*.html`: `NAV`, `PUBLIC_TABS`, `MORE_GROUP`, `GUEST_NAV`, `SET_SECTIONS`, `navigate` / `openSheet` / `openDetail` ids, `GUIDE_STEPS`). Edit the tree there and re-run; `--check` fails when an RPC in the tree no longer exists. **Data sheets are derived** from the `.gs` call graph (sheet-name literals up to 5 calls deep; the `requireMember_` / `requireAdmin_` reads of `MemberData` / `Members` for auth are left out), so read them as "touches", not as an exact contract.', '');
  lines.push('**Legend.** Roles: ' + Object.keys(ROLE).map(k => '`' + k + '` ' + ROLE[k]).join(', ') + '. Kinds: ' + Object.keys(kindIcon).map(k => kindIcon[k] + ' ' + k).join(', ') + '. Flags: ⧉ *topic* = the same data is shown in another screen (see §3), **long** = long screen, **deep** = 4 or more taps from the site root. RPC `getPortalMore.progress` = data that arrives in a bootstrap part, no call on open.', '');
  lines.push('## 1. Tree', '');
  walkAll(TREE, function (nd) {
    if (nd === TREE) return;
    const ind = '  '.repeat(nd.path.length - 1);
    const rp = nd.rpc.length ? ' — `' + nd.rpc.join('`, `') + '`' : '';
    const fl = nd.f.length ? ' — ' + flagTxt(nd.f) : '';
    lines.push(ind + '- ' + kindIcon[nd.k] + ' **' + nd.l + '** `' + nd.r + '`' + rp + fl + (nd.note ? '  \n' + ind + '  ' + nd.note : ''));
  });
  lines.push('', '## 2. Screen → RPCs → data sheets', '');
  lines.push('| Screen (path) | Kind | Role | RPCs | Data sheets |', '|---|---|---|---|---|');
  walkAll(TREE, function (nd) {
    if (nd === TREE || !nd.rpc.length) return;
    const sh = new Set();
    nd.rpc.forEach(r => { const i = rpcInfo[rpcName(r)]; if (i) i.sheets.forEach(s => sh.add(s)); });
    lines.push('| ' + nd.path.join(' › ') + ' | ' + nd.k + ' | ' + nd.r + ' | ' + nd.rpc.map(r => '`' + r + '`').join(' ') + ' | ' + (Array.from(sh).sort().join(', ') || '–') + ' |');
  });
  lines.push('', '## 3. Duplicated or overlapping data', '');
  lines.push('| Topic | Shown in |', '|---|---|');
  Object.keys(DUP).forEach(function (t) {
    const where = [];
    walkAll(TREE, nd => { if (nd.f.indexOf('dup:' + t) !== -1) where.push(nd.path.join(' › ')); });
    if (where.length) lines.push('| ⧉ ' + t + ': ' + DUP[t] + ' (' + where.length + ') | ' + where.join('<br>') + ' |');
  });
  lines.push('', '## 4. Long screens and deep paths', '');
  lines.push('**Long screens**', '');
  walkAll(TREE, nd => { if (nd.f.indexOf('long') !== -1) lines.push('- ' + nd.path.join(' › ') + (nd.note ? ': ' + nd.note : '')); });
  lines.push('', '**Deep paths** (4+ taps on the phone; sections don\'t count as taps). On desktop the portal sidebar (`NAV.public`) opens Latihan, Info & Tips, Paket and Coach in one tap, so portal paths under Lainnya are one tap shorter there.', '');
  walkAll(TREE, nd => { if (nd.f.indexOf('deep') !== -1) lines.push('- ' + nd.taps + ' taps: ' + nd.path.join(' › ')); });
  lines.push('', '## 5. Notes for V9 (D65–D67)', '');
  NOTES.forEach(x => lines.push('- ' + x));
  lines.push('', '## 6. RPC index', '');
  lines.push('| RPC | Auth | Data sheets |', '|---|---|---|');
  Object.keys(rpcInfo).sort().forEach(k => lines.push('| `' + k + '` | ' + rpcInfo[k].auth + ' | ' + (rpcInfo[k].sheets.join(', ') || '–') + ' |'));
  const unused = Object.keys(sheets).filter(k => !rpcInfo[k] && auth[k] && auth[k] !== 'owner').sort();
  lines.push('', 'Public functions that no screen in this tree calls (kept for refresh, old callers or maintenance): ' + unused.map(x => '`' + x + '`').join(', ') + '.', '');
  const md = lines.join('\n');

  // ia-map.html
  const slim = function (nd) {
    const o = { id: nd.id, l: nd.l, k: nd.k, r: nd.r, t: nd.taps };
    if (nd.rpc.length) o.p = nd.rpc;
    if (nd.note) o.n = nd.note;
    if (nd.f.length) o.f = nd.f;
    if (nd.c.length) o.c = nd.c.map(slim);
    return o;
  };
  const data = JSON.stringify({ tree: slim(TREE), rpc: rpcInfo, dup: DUP, role: ROLE });
  const tpl = fs.readFileSync(path.join(__dirname, 'ia-map.template.html'), 'utf8');
  const html = tpl.replace('/*IA_DATA*/null', data.replace(/</g, '\\u003c'));
  return { md, html, errors };
}

const out = build();
if (out.errors.length) { console.error(out.errors.join('\n')); process.exit(1); }
const mdPath = path.join(__dirname, 'IA.md'), htmlPath = path.join(__dirname, 'ia-map.html');
if (process.argv.indexOf('--check') !== -1) {
  const stale = [[mdPath, out.md], [htmlPath, out.html]].filter(p => !fs.existsSync(p[0]) || fs.readFileSync(p[0], 'utf8') !== p[1]).map(p => path.basename(p[0]));
  if (stale.length) { console.error('Stale: ' + stale.join(', ') + ' (run node docs/platform/ia-build.js)'); process.exit(1); }
  console.log('IA files up to date.');
} else {
  fs.writeFileSync(mdPath, out.md);
  fs.writeFileSync(htmlPath, out.html);
  console.log('Wrote IA.md and ia-map.html');
}
