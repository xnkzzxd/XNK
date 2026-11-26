# Phase AC — Coach kit: client hold, measurement guide, coach logger, PDF report (PRD)

Status: **planned** (2026-11-26). Tasks: [TODO.md](TODO.md) (T-2300…T-2399). How: [Design.md](Design.md).

The owner asked for four things (2026-11-26). They ship as four parts that can be built and merged on their own:

| Part | What | Why |
| --- | --- | --- |
| AC1 | **Hold a client**: Cuti, Sakit, Berhenti (with dates), plus the client asking for a hold from the portal | Today a client is "Aktif" only because sessions are left. A client on holiday or sick still gets reminders, their streak breaks, and the coach cannot see who is really active. |
| AC2 | **Measurement guide + Pinggul**: a **?** button per body measure that shows where and how to measure; hip becomes a normal measure | Measuring is a bare number form. Hip is stored only in the coach's assessment and is never shown or charted. |
| AC3 | **Coach logger upgrade** (coach panel only): faster workout logging, machine settings and cues, history per exercise, the coach logging and commenting on food | The coach can log workouts but has few shortcuts, and food is read-only for 7 days. |
| AC4 | **PDF report on demand**: a button for the client and the coach that builds a readable report for a chosen period | The analysis lives in small cards. A report the client can read slowly makes the coaching feel real. Made only when someone taps the button. |

Build order: **AC2 → AC1 → AC3 → AC4** (AC2 is small; the report uses holds and the hip measure).

Not in scope (owner said no, 2026-11-26): package expiry, cancellation policy, weekly check-in, goals with a date, photo comparison, waitlist.

---

## AC1 — Hold a client

### Users and stories
- **Coach**: "Sari is in Bali until 12 Dec. I put her on Cuti; she gets no reminders, her booked sessions in that week are cancelled, and on 13 Dec she is active again without me remembering."
- **Coach**: "Budi is sick, I don't know for how long." → Sakit with no end date; the panel keeps reminding me he is on hold.
- **Coach**: "Rina stopped." → Berhenti. She leaves the active list but nothing is deleted; I can reactivate her any time.
- **Client (optional part)**: "I'm going home for Lebaran." → asks for Cuti in the portal, the coach approves with one tap, like a renewal.
- **Client**: "I'm back early." → "Saya sudah kembali" ends a hold at once.

### Hold types
| Type | End date | Shown as | Meaning |
| --- | --- | --- | --- |
| `cuti` | required (client request) / optional (coach) | "Cuti s/d 12 Des" | holiday, travel, busy period |
| `sakit` | optional | "Sakit" / "Sakit s/d 3 Des" | sick or injured |
| `berhenti` | none | "Nonaktif" | stopped; reactivated by the coach |

A hold has a start date (today or later, or up to 30 days back for the coach), an optional end date (last day of the hold), a private note, and who made it. A hold that starts in the future is **planned**; it becomes active on its start date. Status is computed from dates, so the return happens by itself at 00:00 WIB the day after the end date.

### What a hold changes (while active)
1. **Klien list**: new filter chip **Ditahan** with count; the state pill says "Cuti s/d 12 Des", "Sakit" or "Nonaktif"; **Aktif / Hampir habis / Habis** no longer count held clients; the page subtitle says "N aktif · M ditahan".
2. **Client page**: a band under the hero ("Cuti sampai Jum 12 Des · Ubah · Akhiri"), and a hold history list (Ringkasan tab).
3. **WhatsApp reminders (Telegram digest)**: every client type skips held clients, **except `ulang-tahun`** (owner can change this; see open questions). The digest footer lists "Ditahan: Sari, Budi" so the coach knows why they're missing.
4. **Web Push**: no client push to a held client; the coach's own pushes skip them too.
5. **Booking**: a client cannot book a session inside a hold (soft conflict with the message "Kamu sedang cuti sampai 12 Des."); the coach gets a warning but may still book. Booking after the end date is normal. `berhenti` clients cannot book at all ("Hubungi coach untuk aktif lagi.").
6. **Sessions already booked inside the hold**: when the coach sets a hold, the sheet lists them with a check box each (checked by default) → cancelled in the same save; the quota comes back because they never happened.
7. **Streak**: a week mostly inside a hold (≥ 4 of 7 days) neither breaks nor adds to the streak. Training during a hold still counts.
8. **Monthly challenge**: the target shrinks with the held days (rounded up); hidden when fewer than 7 days of the month are not held.
9. **Coach hub / signals**: no "lama tidak latihan" or "perlu perhatian" flags for held clients; the hub shows a small "Ditahan (2)" fold with "berakhir besok" hints.
10. **Automatic program**: the daily review skips held clients. After a hold of 14 days or more, the first sessions back get a lighter start (rule to be sourced in program/Rules.md before it ships; until then the generator is unchanged).
11. **Warm cache**: skips held clients.
12. **Portal**: Hari ini shows a calm card ("Selamat istirahat. Cuti sampai Jum 12 Des.") with **Saya sudah kembali**. Logging workouts and food still works (nothing is locked); reminders and nudges stop.
13. **On the return day**: the coach gets one Telegram line ("Sari aktif lagi hari ini") with a `wa.me` button carrying a welcome-back message to the client (new manual-send type `kembali-latihan`, **off by default**, rule 5), plus a coach push when push is installed.

Not changed: finance bills and the `tagihan` reminder (money is still owed), packages and quota numbers, the client's data.

### AC1b — the client asks for a hold (optional part, owner wants it)
- Portal **Saya → Ajukan cuti** (also in the ＋ sheet): type Cuti or Sakit, start, end (required for Cuti, max `HOLD_REQUEST_MAX_DAYS`, default 60), short note.
- One open request per client; no overlap with an existing hold.
- The coach gets Telegram (first name + type + dates, **never the note**) and a push `cuti`; the panel Dashboard shows a "Minta cuti" card with **Setujui / Tolak** (same pattern as "Minta perpanjang").
- On approve, the booked sessions inside the range are listed for the coach to cancel (checked by default). The client sees "Cuti disetujui" or "Belum disetujui" in the portal.
- The client may cancel a pending request and end an active hold early, without approval.

### Privacy
The hold **note** can hold health information (Sakit). It is care data: admin only, never in Telegram, email, push, `xnk_admin_cache`, public answers or the PDF. Type and dates are not sensitive and may appear in the digest footer (first name only).

### Success
- The Klien list "Aktif" count matches reality without the coach checking WhatsApp.
- Zero reminders or pushes reach a held client (tested for every job in `REMINDER_JOBS` and every push kind).
- A holiday never breaks a streak.

---

## AC2 — Measurement guide + Pinggul

- Every body measure in the entry sheet (client and coach) and in the assessment sheet gets a **?** button. It opens a small sheet: a body figure with the tape line drawn at the right height (front or side view), 2–3 short steps in Indonesian, and the general rules (same time of day, before eating, tape snug but not pressing, measure twice).
- One "Cara mengukur" link at the top of the sheet opens all measures in one scrollable guide.
- **Pinggul** (hip) becomes the ninth measure: client and coach can enter it, it is charted, it shows in Progres, insights, share cards and the report. The assessment's hip field writes to the same place. Old hip values from Assessments are copied once into Progress so the history is complete.
- Texts follow cited measuring protocols (WHO STEPS for waist and hip, ISAK for arm, chest, thigh); each step has a source in [Design.md](Design.md) §AC2.
- Works offline (the figure and texts ship with the app), phone first.

---

## AC3 — Coach logger upgrade (coach panel only)

The client logger and the client food log are **not changed** (the client side is being re-planned in another session; this part only adds coach screens and coach-only server functions, and at most a read-only line on the client side where marked). The owner picks the items; all are listed so any can be struck.

### Workout (coach)
- **W1 Simpan & selesaikan**: when the logger was opened from a session, Selesai offers "Selesaikan sesi juga" (one tap: log saved and session completed; the session note opens after, as today).
- **W2 Ulangi terakhir**: "Isi seperti terakhir" per exercise and "Ulangi latihan terakhir" for the whole workout; a +2.5 / +5 kg chip per exercise using the server suggestion.
- **W3 Setelan alat & cue**: per client per exercise, a machine setting ("kursi 4, sandaran 2") and a coaching cue ("lutut ke luar"). Shown at the top of that exercise in the coach logger every time. Optional: the client sees the same line read-only in their logger (one added line, owner decides).
- **W4 Hapus / perbaiki riwayat**: delete one exercise or a whole day from the client's history, with undo.
- **W5 Riwayat per gerakan**: on the client page, pick an exercise → a table of every session (date × sets) and the estimated-1RM line; client-logged and coach-logged rows marked.
- **W6 Dua klien satu sesi**: for semi-private or class sessions, a client switcher in the logger's top bar; each client keeps their own draft; Selesai saves all.

### Food (coach)
- **F1 Catat untuk klien**: the coach adds or deletes food entries for a client (e.g. the client sent a photo on WhatsApp). Entries show "dicatat coach".
- **F2 Tanggapan harian**: per day a mark (Pas · Kurang · Lebih) and a short note ("protein kurang, tambah telur"). The client sees it on that day in Makan (one read-only line).
- **F3 30 hari**: the Gizi tab shows 30 days: a calendar of days logged and target hit, weekly averages (kcal, protein, days logged), most-logged foods.

Success: logging a full session for a client takes fewer taps than today (measured in browser-check), and the coach can answer "how did Sari eat this month?" from one screen.

---

## AC4 — PDF report on demand

- A **Laporan PDF** button: portal (Progres page and Saya) for the client; the client page (top-bar menu) for the coach. **Nothing is generated, stored or sent until someone taps it.** Nothing is uploaded; the PDF is built on the device.
- The sheet asks: period (4 minggu terakhir · Bulan ini · Bulan lalu · Sejak mulai · Pilih tanggal), sections on/off, and for the coach an optional message to the client (2–600 characters, kept as a draft on the device only).
- Then **Buat PDF** → a preview → Bagikan (WhatsApp etc. through the wrappers' share), Unduh.
- Content (A4 portrait, 3–6 pages, black and white with the client's accent colour as the only colour):
  1. Cover: name, coach, period, logo / brand name.
  2. Ringkasan: 4–6 headline numbers with the change against the previous period of the same length, and 3–5 sentences of plain-language interpretation from the server.
  3. Kehadiran: sessions done, streak, a calendar strip, holds in the period ("Cuti 5–12 Des").
  4. Latihan: workouts logged, weekly volume, top 3 lifts' strength trend, personal records, muscle groups trained.
  5. Tubuh: weight chart, measures table (start · end · change) including Pinggul, fitness tests.
  6. Makan (only when Gizi is on and there are logs): days logged, average kcal vs target, protein adherence.
  7. Dari coach: the coach's message (coach-made reports) and the "dilatih / fokus" notes from completed sessions.
  8. Rencana ke depan: next focus from the server interpretation.
- Privacy: no phone number, no RPE or private notes, no hold notes, no progress photos (photos may come later as an off-by-default switch, never in this phase).
- The coach's report uses the **client tone** (it is written for the client), not the coach insight text.

Success: a client can open the PDF on a phone and read it without the app; generating takes under 5 s on a mid-range phone after the data arrives.

---

## Open questions for the owner
1. Birthday greeting during a hold: keep sending (proposed) or skip?
2. `kembali-latihan` welcome-back WhatsApp text: off by default (proposed), or on?
3. AC3 W3 and F2: show the coach's cue / food note to the client (proposed yes, read-only), or coach-only?
4. AC3: which of W1–W6 and F1–F3 to build (all proposed; W6 and F3 are the largest).
5. AC4: should the client be allowed to make their own report (proposed yes), or only the coach?
