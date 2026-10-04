# Office Hours — Policy Alignment & UX Refactor Plan (v2)

**Written:** 2026-10-04
**Branch:** `feat/office-hours-policy-refactor` (from `origin/main` e84056cb)
**Source of truth:** *Memo: Office Hours Policy* (Administration → all staff, 01 Oct 2026, effective **05 Oct 2026**), file `NGA-Office-Hours-Policy.pdf`.
**Builds on:** `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` (v1, shipped 2026-10-03 as MIS #53, migration 102) and `docs/OFFICE_HOURS.md`.
**Audience:** developers and Claude Code sessions doing the work. School leadership: read §1, §3 and §11 (the decisions).

> **Status:** plan only. No code has changed on this branch yet.

---

## Contents

1. What the policy requires (rules R1–R12)
2. How the current module compares (gap analysis)
3. The root problem: two different models
4. Target model
5. Friendly workflows (before → after)
6. UI/UX design
7. Data model: migration `103_office_hours_policy.sql`
8. Backend changes
9. Frontend changes
10. Notifications, reports and integrations
11. Decisions for the school
12. Getting through 05 October (interim)
13. Phases and task checklist
14. Testing
15. Rollout, data conversion and risks

---

## 1. What the policy requires

The memo is short. Every rule below can be traced to one line of it.

| # | Rule | Memo text |
|---|---|---|
| **R1** | Office hours run **every weekday, 16:20–17:20, in the Academy Hall**. One fixed time, one fixed place. | "take place daily from 4:20 PM to 5:20 PM in the Academy Hall" |
| **R2** | **Every instructor holds office hours on exactly two days a week.** | "Every instructor holds office hours two days each week" · "Set two office-hours days per week" |
| **R3** | The instructor **shares the days with all their students** and **submits them to the administration by 05 Oct 2026**. | "Share them with all your students and send them to the administration by 05 October 2026" |
| **R4** | The instructor **holds them as scheduled**. | "Hold them as scheduled" |
| **R5** | If they must cancel, they **tell students in advance** and **offer another time in the same week**. | "If you must cancel, tell students in advance and offer another time that week" |
| **R6** | **Voluntary attendance:** any student may come on their own to ask for help. | "Voluntary: a student comes to your office hours on their own" |
| **R7** | **Mandatory attendance:** the instructor directs a student to attend, **assigned through MIS**. | "Mandatory: you direct a student to attend, assigned through MIS" |
| **R8** | **No double assignment.** A student who already has an assignment **cannot be assigned again**, so nobody is sent to two instructors at once. If blocked, **coordinate with the instructor who assigned them**. | §3 bullets 1–2 |
| **R9** | When assigning, **tell the student the day, time, place and reason**. | "Tell the student the day, time, place, and reason" |
| **R10** | **Record attendance for every session, on the day**, noting whether each visit was **voluntary or assigned**. | §4 bullet 1 |
| **R11** | **Assigned students who don't attend are marked absent.** | §4 bullet 2 |
| **R12** | Administration uses the records to see **who attends consistently** and to **follow up with students who miss assigned sessions**. | §4 bullet 3 |

**Implied by the memo:**
- **R3** replaces the Google Form in "Next steps". The MIS should make that form unnecessary, and the administration should still be able to download the list.
- The policy is *teacher-centred*: office hours are a teacher's **open availability**. Assigned students are an *exception* layered on top.

---

## 2. How the current module compares

v1 was designed before the memo, from a brief about **mandatory** office hours: a teacher creates a *group* of named students who must come on chosen days.

| Rule | Current implementation (v1) | Fit | Gap → action |
|---|---|---|---|
| R1 fixed time | Band 16:20–17:20 is the default, but times are **editable** inside 16:00–18:00 (D7). | 🟡 | Lock the time to the band. Remove the time inputs. |
| R1 fixed place | Free-text **Room** per schedule (e.g. "B4"). | 🔴 | Setting `default_location = "Academy Hall"`. No room input. |
| R2 exactly 2 days | 1–5 days per schedule, and **any number of schedules** per teacher. | 🔴 | **One availability per teacher per term, exactly `days_per_teacher` (2) weekdays.** |
| R3 share + submit by deadline | Students see office hours **only if assigned**. Leadership "Coverage" counts students, not teachers. There is no deadline or submission tracking. | 🔴 | Student-facing **"Teachers in the hall" directory**. Admin **Declarations** board (submitted / missing, Remind, CSV). Deadline setting. |
| R4 hold as scheduled | Sessions materialise; missing registers are listed; register reminders run. | 🟢 | Keep. Add a **teacher compliance** view (held / on-day register / replaced cancellations). |
| R5 cancel → replace same week | **Cancel** (notifies) and **Move** exist as separate actions. Move can go to any date. Nothing requires a replacement or keeps it in the same week. | 🟡 | One **"Can't hold it"** flow: pick a replacement day in the **same week** (or record why that's impossible). Admin sees unreplaced cancellations. |
| R6 voluntary | A register "Add a student who came" (`is_drop_in`) exists, but **only inside a schedule that already has students**. A teacher with no assigned students has no session, so there is nothing to record against. | 🔴 | Sessions exist for **every declared day**, whether or not anyone is assigned. Adding a visitor is the register's **primary** action. |
| R7 assigned via MIS | Assigning means: create a schedule → pick days, times, dates, subject, title, purpose, room, capacity → draft → picker → publish. | 🟡 | **Assign** is a direct teacher action: *student(s) → which session(s) → reason*. No schedule to build first. |
| R8 no double assignment | DB-enforced lock `OfficeHourStudentLock` (term, student, weekday), TERM mode by default. Conflict shows the holder. "Ask to transfer" exists. | 🟢 | Keep the lock (it is the strongest part of v1). Lock for the life of the **assignment** (one-off assignments free the student after their session). Rename the transfer flow to "Ask Mr K to release". Drop WEEKDAY mode from the UI. |
| R9 day, time, place, reason | Notice says day/time/room. **The reason is hidden from students by design** (v1 §4.7, §18). | 🔴 | **Show the reason to the student** (policy overrides v1's privacy default). Reasons become student-facing wording. See decision P5. |
| R10 record on the day, voluntary vs assigned | Register opens 15 min before start and stays editable **7 days** (`register_edit_days`). Voluntary/assigned is stored (`is_drop_in`) but reports barely use it. | 🟡 | Default edit window: **the same day**. A later save is allowed but flagged **late**. Voluntary vs assigned appears in every register, report and export. |
| R11 no-show = absent | Rows left unmarked stay `NULL`; the UI asks "mark them absent?". Auto-close is off by default. | 🟡 | **On save, assigned students left unmarked become ABSENT** (with the count shown before saving). |
| R12 consistency + follow-up | Consistency bands, escalation ladder, digests, reports. All rates assume everyone is assigned. | 🟢/🟡 | Keep the engine. Count **assigned** attendance for absence and follow-up. Count **voluntary** visits as *usage*, never as absences. Admin "Follow-up" list. |

**Things v1 built that the policy does not ask for**, and that add steps and weight: per-schedule titles, purposes, rooms, capacity, date windows, drafts/publish, multiple schedules per teacher, WEEKDAY lock mode, editable times, term rollover of schedules, outcomes/follow-up flags, and a nine-tab oversight console. §9.3 lists what is hidden, kept or removed.

---

## 3. The root problem: two different models

```
v1  (shipped)                              Policy
─────────────────────────────────────      ──────────────────────────────────────────
Schedule = "a group of named students      Availability = "Ms A is in the Academy Hall
  who must come on chosen days"              every Tue & Thu, 16:20–17:20"
                                             (one per teacher, exactly 2 days, open to all)
No students → no schedule → no session     Every declared day → a session, even if empty
Walk-ins are an add-on                     Voluntary visits are the main traffic
Everything is mandatory                    Mandatory = a referral placed on top of
                                             a teacher's availability
```

Patching UI on top of v1 would keep the wrong mental model ("create office hours" = "build a student group"). The refactor therefore **re-interprets the existing tables** instead of adding new ones:

- `OfficeHourSchedule` becomes **the teacher's availability for a term**, at most one live row per (term, teacher).
- `OfficeHourAssignment` becomes a **referral**: a student sent to that teacher's office hours, either once or weekly.
- `OfficeHourSession` and `OfficeHourAttendance` stay as they are. `is_drop_in` already means "voluntary".

The engine is kept: the lock table, materialisation, closures, register versioning, metrics, escalation, reports, notifications and the scheduler. What changes is the meaning of the rows, the validation rules and nearly all of the UI.

---

## 4. Target model

### 4.1 Concepts

```
OfficeHourSetting        days_per_teacher=2 · band 16:20–17:20 (fixed) · default_location="Academy Hall"
                         declaration_deadline=2026-10-05 · register_same_day=1
OfficeHourSchedule       ONE per (term, teacher): "Ms A · Tue & Thu · Academy Hall"   ← availability
 ├─ OfficeHourScheduleDay   exactly 2 rows (setting)
 ├─ OfficeHourSession       one per declared date (sweep) — exists with or without students
 │    └─ OfficeHourAttendance  student × session · visit = ASSIGNED | VOLUNTARY (is_drop_in)
 └─ OfficeHourAssignment    referral: student → this teacher · ONCE (a date) | WEEKLY (days, until)
      └─ OfficeHourStudentLock  term × student × weekday 1–5 → "one active referral at a time"
```

### 4.2 Rules

**Availability (R1–R4)**
- One live availability per (term, teacher). Saving again *edits* it. It is never a second row.
- Exactly `days_per_teacher` distinct weekdays (Mon–Fri). Time = band. Location = `default_location`.
- `submitted_at` is set on first save. The admin board compares it with `declaration_deadline`.
- **Changing days mid-term** takes effect from the next school week, so this week's sessions stay as students were told. Admin is notified. Weekly referrals on a dropped day are listed for the teacher to move or release (decision P3).
- A teacher's two days must not clash with their own lessons (impossible inside the band, kept as a guard) or with an `OFFICE_HOURS` closure.

**Sessions (R4, R5)**
- Materialised for every declared date (the existing sweep, `ensureSessions`), **independent of assignments**.
- **Can't hold it** is allowed until the session starts. The teacher must pick a **replacement date in the same Mon–Fri week**, after today and not on a closure. The replacement may be any weekday, including the other declared day (then that day holds both, which is one session). If no day is left, the teacher must give a reason; this is recorded as `cancel_reason = NOT_REPLACED`, notifies admin, and counts against teacher compliance.
- Implementation: the existing **move** (`moved_from_session_id`, original `CANCELLED/MOVED`) when replaced; the existing **cancel** when not.
- After the session has started, there is no cancel. An unrecorded session becomes a *missing register* (v1 behaviour).

**Referrals (R7–R9)**
- A teacher refers **students they teach** (D2 unchanged; leadership may refer anyone, to any teacher's office hours).
- **Mode:**
  - `ONCE`: one dated session, defaulting to the teacher's next session after the 14:00 cut-off (D10 kept).
  - `WEEKLY`: every session on chosen declared day(s) until an end date (default 4 weeks, capped at term end) or until released.
- **Lock:** while a referral is ACTIVE the student holds locks on weekdays 1–5 for the term (TERM mode, unchanged code). A second teacher is blocked: *"Already referred by Mr K — Thu 9 Oct · Mathematics. [Message Mr K] [Ask to release]"*.
- **Completion frees the lock:**
  - a ONCE referral **completes** when its session's register is saved (attended or absent), or when the session is cancelled without replacement;
  - a WEEKLY referral completes at its end date, or when released;
  - a replaced session carries its ONCE referrals to the replacement date automatically.
- **Reason (R9):** a required reason chip (`NEEDS_HELP_TOPIC`, `MISSED_WORK`, `LOW_RESULTS`, `CATCH_UP_ABSENCE`, `ASSESSMENT_PREP`, `OTHER`) plus an optional short message. **Both are shown to the student**, worded for students (e.g. *"Catch up on missed work"*). There is no hidden staff-only reason (decision P5).

**Attendance (R10–R12)**
- Opens at band start − 15 min. **Same-day editing** by default. A save after the day is accepted but stamped `register_late = 1`; after `register_edit_days` it needs MANAGE_ANY.
- Visit type: `ASSIGNED` (row has `assignment_id`) or `VOLUNTARY` (`is_drop_in = 1`, never locks, never counts as absent).
- **On save, assigned rows still unmarked become ABSENT** (R11). The save bar shows it first: *"2 assigned students not marked → will be absent"*.
- **Primary statuses are Present / Absent.** Late and Excused stay available under "⋯" (decision P4); D3 semantics are unchanged.
- An assigned student marked absent feeds the existing escalation ladder. Voluntary visits feed **usage** metrics only.

---

## 5. Friendly workflows (before → after)

### 5.1 Teacher: declare my two days (R2, R3)

| | Before (v1) | After |
|---|---|---|
| Steps | New office hours → days, start, end, from, until, subject, title, purpose, room, capacity, notes → save draft → students → review → publish | **Pick 2 days → Save** |
| Inputs | ~12 fields, 3 screens | **2 taps + 1 button**, 1 card |
| Result | One student group | Shared with all my students; admin sees "submitted"; sessions exist for both days all term |

Interactive details:
- Day chips show the **hall load** live ("Tue · 7 teachers"), so teachers balance themselves.
- Save is enabled only at exactly 2 days, with a counter ("1 of 2 picked").
- The confirmation reads: *"Tuesdays & Thursdays, 16:20–17:20, Academy Hall. Your students can see this now."*

### 5.2 Teacher: assign a student (R7–R9)

| | Before | After |
|---|---|---|
| Path | Open a schedule → Students tab → picker → save → (publish if draft) | **Assign** button (hub, register, student 360, or a Task Mentor suggestion) |
| Steps | 3–5 | **2: Who → When & why** |

1. **Who.** Search box + "My classes" chips. Each row shows availability inline: `Free` · `Referred by Mr K (Thu)` (disabled, with *Message* / *Ask to release*) · `With you`. *Suggested* lists students with evidence (existing suggestions service).
2. **When & why.** Session chips (my next 4 sessions: "Tue 7 Oct", "Thu 9 Oct" …), with **Once / Every week until [date]**, a reason chip and an optional message. A live preview shows exactly what the student will receive:
   > *Office hours with Ms A — Tue 7 Oct, 16:20–17:20, Academy Hall. Reason: Catch up on missed work.*

   **Assign.** The toast reads: "3 referred · 1 already referred by Mr K".

### 5.3 Teacher: take attendance (R10, R11)

- Opened from the hub's **Today** card, the band cell on the timetable, or the 16:25 push reminder.
- The **"+ Add a visitor"** search sits at the top with focus. Type 3 letters, press Enter, and the student is added as *Present · Voluntary*. A recent-visitors row (students who came voluntarily before) makes the repeat tap one touch.
- Below it, **Assigned** students show a Present/Absent toggle each, with "All present".
- Footer: `4 assigned · 3 present · 1 absent · 9 visitors` → **Save**. Unmarked assigned students → absent, with a confirmation line.
- It works offline (existing queue).

### 5.4 Teacher: can't hold a session (R5)

**Can't hold Tue 7 Oct** → one sheet:
- **Replacement this week:** chips Wed 8 · Thu 9 (your day) · Fri 10, each with hall load, or "No day possible" + reason;
- an optional message;
- **Confirm.**

The MIS then notifies the assigned students, puts the change on every affected timetable band and the directory, and records it for admin. Two decisions, one screen.

### 5.5 Student

- **Timetable band** (the main surface):
  - on a day with a referral: *"Office hours · Ms A · Academy Hall — assigned"*, highlighted;
  - otherwise: *"Academy Hall · 3 of your teachers"*, and a tap lists them.
- **My office hours** page:
  1. **Assigned to you** (if any): teacher, date, time, place, reason, and an *"I can't come"* button (existing).
  2. **Your teachers this week:** a Mon–Fri strip of who is in the hall, with *your* teachers (subject teachers, class teacher) first and a search for anyone else.
  3. **History:** visits, voluntary vs assigned, and attendance on assigned sessions.

### 5.6 Administration (R3, R12)

| Tab | Purpose | Key interaction |
|---|---|---|
| **Today** | Live hall view: teachers expected today, registers taken, assigned vs visitors so far | Auto-refresh. A tap on a teacher opens their register (read-only) |
| **Teachers** | Declarations (submitted / missing vs deadline), weekday load chart, compliance per teacher (held, on-day registers, cancellations replaced) | **Remind missing**, **Download CSV** (replaces the Google Form sheet), set a day for a teacher (MANAGE_ANY) |
| **Students** | Follow-up: missed assigned sessions (escalations), consistency bands, voluntary usage, students never seen | **Acknowledge / note**, refer to discipline (existing) |
| **Reports** | Existing period engine and exports, with an assigned/voluntary split everywhere | Period picker, CSV/Excel/PDF |
| ⚙ | Settings (fewer fields) and Closures | — |

The console goes from nine tabs to four plus settings. Transfers move into the Students tab as a filter. Coverage is replaced by Teachers (load) and Students (never seen).

---

## 6. UI/UX design

### 6.1 Principles

1. **One screen per role.** The teacher hub is a single page with no tabs for daily use. Reports stay one link away.
2. **Defaults over fields.** Time, place, dates, capacity and title are decided by the policy, so they are never asked for.
3. **Two steps at most** for any frequent action: declare (1), assign (2), register (1), cancel (1).
4. **Show consequences before commit.** Live student-message preview, hall-load counts, and "will be marked absent" counts.
5. **Inline conflicts, never error pages.** The lock conflict sits on the student row with the next action (Message / Ask to release).
6. **Progressive disclosure.** Late, Excused, notes and history sit behind "⋯".
7. **Interactive feedback.** Optimistic toggles, an undo toast for removal and release, skeleton loading, and keyboard shortcuts kept (1/2 = present/absent, ⌘↵ save).
8. **House style.** Keep the `ohUi.tsx` primitives (Card, pills, buttons), the `--status-*` colours, dark mode, phone width at 390 px and axe AA (the existing e2e harness).

### 6.2 Teacher hub `/office-hours` (wireframe)

```
┌───────────────────────────────────────────────────────────────┐
│ Office hours                         Academy Hall · 16:20–17:20│
│ Your days: [Tue] [Thu]   ✎ Change                [+ Assign]   │
├───────────────────────────────────────────────────────────────┤
│ TODAY · Tue 7 Oct                                              │
│  4 assigned · 0 visitors          [ Take attendance ]   ⋯      │
│                                   (⋯ = Can't hold it)          │
├───────────────────────────────────────────────────────────────┤
│ THIS WEEK   Tue 7 ● today   Thu 9 ○ 2 assigned                 │
├───────────────────────────────────────────────────────────────┤
│ ASSIGNED STUDENTS (6)                                          │
│  Aline M. · S4A · Thu 9 · Catch up on missed work   ⋯ Release  │
│  ...                                                           │
├───────────────────────────────────────────────────────────────┤
│ ⚠ 1 register missing (Thu 2 Oct)  [Record]                     │
│ ↔ Mr K asks you to release Eric N.  [Release] [Keep]           │
└───────────────────────────────────────────────────────────────┘
```

**First visit (no days yet)** replaces the whole page body with one card:

```
┌────────────────────────────────────────────┐
│ Pick your two office-hours days            │
│ 16:20–17:20 · Academy Hall                 │
│ [Mon 5] [Tue 7] [Wed 3] [Thu 6] [Fri 2]    │  ← teachers already on that day
│ 1 of 2 picked             [ Save my days ] │
│ Due by Mon 5 Oct · shared with your students│
└────────────────────────────────────────────┘
```

### 6.3 Assign sheet (2 steps, right drawer; full screen on phones)

```
Step 1 · Who                         Step 2 · When & why
[Search name or reg no… ]            Session: (Tue 7)(Thu 9)(Tue 14)(Thu 16)
(S4A)(S4B)(S5 Maths)  Suggested(3)   ( Once )  ( Every week until [14 Nov] )
☑ Aline M.   S4A   Free              Reason: (Missed work)(Low results)(Topic help)…
☐ Eric N.    S4A   Referred by Mr K  Message (optional): [                ]
              Thu ▸ Message · Ask   ┌ Preview ─────────────────────────────┐
                                     │ Office hours with Ms A — Tue 7 Oct,  │
2 selected            [Next →]       │ 16:20–17:20, Academy Hall.           │
                                     │ Reason: Catch up on missed work.     │
                                     └──────────────────────────────────────┘
                                     [← Back]                 [Assign 2]
```

### 6.4 Register sheet

```
Tue 7 Oct · 16:20–17:20 · Academy Hall                     ● saved 16:41
[+ Add a visitor: type a name…                    ]  Recent: (Jean)(Grace)
ASSIGNED (4)                                         [All present]
 Aline M.   S4A   (Present)( Absent )   ⋯
 Eric N.    S4B   ( Present)(Absent )   ⋯
VISITORS (9) — voluntary
 Jean P.    S5    Present ✕
────────────────────────────────────────────────────────────────
4 assigned · 3 present · 1 not marked → absent · 9 visitors   [ Save ]
```

### 6.5 Student "My office hours"

```
ASSIGNED TO YOU
 Ms A · Mathematics — Tue 7 Oct, 16:20–17:20, Academy Hall
 Reason: Catch up on missed work                  [I can't come]
YOUR TEACHERS THIS WEEK                          [Search a teacher]
 Mon  Mr K (Physics)
 Tue  Ms A (Maths) · Mr D (English)
 Thu  Ms A (Maths)
 ...
HISTORY   12 visits · 3 assigned (3/3 attended) · 9 voluntary
```

---

## 7. Data model: migration `103_office_hours_policy.sql`

The migration is idempotent and runs on MySQL 5.7 and 8, using the information_schema-guarded `ALTER`s that 102 uses. It is **additive only**: no column is dropped, so a rollback of the code stays safe.

| Table | Change | Why |
|---|---|---|
| `OfficeHourSetting` | `+ days_per_teacher TINYINT NOT NULL DEFAULT 2`<br>`+ default_location VARCHAR(100) NOT NULL DEFAULT 'Academy Hall'`<br>`+ declaration_deadline DATE NULL` (seeded `2026-10-05`)<br>`+ band_locked TINYINT NOT NULL DEFAULT 1`<br>`+ weekly_referral_default_weeks TINYINT NOT NULL DEFAULT 4`<br>`UPDATE … SET student_lock_mode='TERM', register_edit_days=1` | R1, R2, R3, R10 |
| `OfficeHourSchedule` | `+ kind ENUM('AVAILABILITY','LEGACY') NOT NULL DEFAULT 'AVAILABILITY'`<br>`+ submitted_at DATETIME NULL`<br>`+ live_key VARCHAR(40) NULL` + `UNIQUE (live_key)` | One live availability per teacher-term. `live_key = '<term>:<teacher>'` while status is ACTIVE/DRAFT and NULL once ENDED/CANCELLED. MySQL has no partial unique index, and this is the same trick as the lock PK: the DB, not an `if`, enforces it. |
| `OfficeHourAssignment` | `+ mode ENUM('ONCE','WEEKLY') NOT NULL DEFAULT 'WEEKLY'`<br>`+ target_session_id BIGINT NULL`<br>`+ student_message VARCHAR(300) NULL`<br>status enum `+ 'COMPLETED'` | Referral semantics (R7, R9) |
| `OfficeHourSession` | `+ register_late TINYINT NOT NULL DEFAULT 0`<br>`cancel_reason` gains `NOT_REPLACED` (varchar, no DDL) | R5, R10 compliance |
| `OfficeHourAttendance` | none. `is_drop_in` = voluntary. | — |

Index: `OfficeHourSession (session_date, status)` already supports the directory and Today queries. Check this with `EXPLAIN` during P1.

**Data conversion** (`scripts/office-hours-policy-convert.ts`, `--dry-run` by default) for rows written under v1 (prod went live 2026-10-03):
- per (term, teacher): if exactly one live schedule → `AVAILABILITY`, `location = default_location`, set `live_key` and `submitted_at = created_at`;
- with several live schedules → keep the earliest as `AVAILABILITY` (union of days), mark the rest `LEGACY` (still readable, read-only), and re-point their ACTIVE assignments to the availability schedule (locks are keyed on the assignment, so nothing is lost);
- availability with ≠ 2 days → keep, and list it on the admin **Teachers** board as *"needs 2 days"*;
- `DRAFT` schedules with zero assignments → `CANCELLED`.

The report is printed and written to `backups/`.

---

## 8. Backend changes

### 8.1 Services (`backend/src/services/officeHours/`)

| File | Change |
|---|---|
| `settings.ts` | New fields + validation. `publicConfig` exposes `days_per_teacher`, `default_location`, `declaration_deadline` and `band_locked`. Remove `WEEKDAY` from accepted values (the column is kept). |
| **`availability.ts`** (new) | `getMyAvailability(actor, term)`, `saveAvailability(actor, term, days)`. Upsert by `live_key` under `withDeadlockRetry`. Exactly N distinct days. Time and location forced. `submitted_at`. A mid-term change takes effect next Monday and calls `materialise`, which cancels sessions no longer matching with `SCHEDULE_CHANGED` (v1 logic). Returns `affected_weekly_referrals[]`. `hallLoad(term)` → teachers per weekday. |
| `schedules.ts` | `createSchedule`/`updateSchedule` become internal helpers used by `availability.ts`. The public create/update/publish/rollover paths are retired (§8.2). `serializeSchedules` drops title/purpose/capacity from the payload. The title is generated: "Office hours — {teacher}". |
| `assignments.ts` | `referStudents({ actor, teacherId, studentIds, mode, sessionIds \| days, until, reason_code, message })`, which resolves the teacher's availability schedule and reuses the existing lock/partial-success core (`assigned / conflicts / ineligible / already_assigned`). Capacity checks are removed (the hall has no per-teacher cap). `completeOnceReferrals(sessionId)` is new and is called from `saveRegister` and from cancel-without-replacement. Conflicts include the holder's teacher id, so the UI can show *Message*. |
| `sessions.ts` + `modern.ts` | `cantHold(sessionId, { replacementDate \| notReplacedReason, message })`. It validates same Mon–Fri week, future, not a closure and before start, then calls `moveSession` (existing) or `cancelSession(NOT_REPLACED)`. ONCE referrals targeting the session move with it. |
| `register.ts` | Same-day window + `register_late`. `saveRegister(..., { unmarkedAssignedAbsent: true })`. The response returns `visit` (`ASSIGNED`/`VOLUNTARY`). `recentVisitors(teacherId)`. |
| `views.ts` | `directory(term, weekStart, viewer)`: teachers by weekday, ranked with the viewer's own teachers first; staff get counts. `studentOverview` adds the referral reason/message (R9) and voluntary history. `bandFor` adds hall entries for students. |
| `metrics.ts` / `reports.ts` | Split every rate into **assigned attendance** (present ÷ assigned held) and **voluntary visits** (count, unique students). Absence and escalation use assigned only. New `teacherCompliance(period)`: declared ✓, sessions held/expected, on-day registers %, cancellations replaced %. New `declarations(term)`. |
| `escalation.ts`, `digests.ts`, `notify.ts` | Assigned-only triggers (already true in practice, made explicit). Referral notice text includes day, time, place and reason. New events: `availability_saved` (admin digest, not per-event), `session_replaced`, `declaration_reminder`. |
| `scheduler.ts` | New job: **declaration reminders**, daily 07:30 until every teacher has declared (bell + push to missing teachers; summary to admin). The morning roster text gains visitors. |
| `reconcile.ts` | Repairs `live_key` drift, completes past ONCE referrals whose session ended without a register (status `COMPLETED`, attendance left missing = teacher compliance, not student absence; see P6). |

### 8.2 Routes (`backend/src/routes/officeHours.ts`)

**New**

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/my-days` | MANAGE_OWN | My availability, hall load, deadline |
| PUT | `/my-days` | MANAGE_OWN | `{ days: [2,4] }` |
| GET | `/directory?week=YYYY-MM-DD` | any signed-in user | Teachers in the hall per weekday (student/staff shapes) |
| POST | `/referrals` | MANAGE_OWN (own) / MANAGE_ANY (`teacher_id`) | Assign (partial success) |
| POST | `/referrals/:id/release` | owner / MANAGE_ANY | Release (frees the lock) |
| POST | `/sessions/:id/cant-hold` | host / MANAGE_ANY | Replace in the same week or not-replaced |
| GET | `/sessions/:id/recent-visitors` | host | Quick-add row |
| GET | `/admin/declarations` | VIEW | Submitted/missing, load, CSV data |
| POST | `/admin/declarations/remind` | MANAGE_ANY | Nudge missing teachers |
| PUT | `/admin/teachers/:id/days` | MANAGE_ANY | Set days for a teacher (absent staff, corrections) |
| GET | `/reports/compliance` | VIEW | Teacher compliance |

**Changed:** `GET /my` (adds availability, referrals, next sessions even if empty), `PUT /sessions/:id/register` (auto-absent, late flag), `GET /me` (directory + reason), `GET /band`, `GET /config`.

**Retired** (kept for one release as thin aliases returning `410 OFFICE_HOURS_V2` with a hint, then deleted): `POST /schedules`, `PATCH /schedules/:id`, `POST /schedules/:id/publish`, `POST /schedules/:id/rollover`, `POST /schedules/:id/assignments` (→ `/referrals`), `POST /sessions/:id/move` and `/cancel` for teachers (→ `/cant-hold`; admin keeps `/cancel` for closures and voids). `GET /schedules/:id` stays for the 360 and report links.

### 8.3 Access control

There is no new permission. `OFFICE_HOURS_MANAGE_OWN` = declare days, refer own students, record own registers. `MANAGE_ANY` = set anyone's days, refer to anyone's office hours, override, closures. `VIEW` with summary/detail depth is unchanged. The directory needs only authentication, because teacher names and days are not sensitive and R3 requires sharing them. It never returns student data.

---

## 9. Frontend changes (`frontend/src/components/officeHours/`)

### 9.1 New

| File | What |
|---|---|
| `DayPicker.tsx` | The 2-day card (first run + "Change"), with hall-load chips and a counter. Shared with the admin "set days" action. |
| `AssignSheet.tsx` | 2-step drawer (§6.3). It reuses `StudentPicker` internals (row availability chips, search, class chips, suggestions) and adds session chips, mode, reason and a live preview. Openable from the hub, register, Person360 and the timetable band. |
| `CantHoldSheet.tsx` | Same-week replacement chips + not-replaced reason. |
| `TeacherDirectory.tsx` | Week strip of teachers per day (student page, band popover, Home card). |
| `admin/TeachersTab.tsx` | Declarations, load chart (following the `dataviz` skill), compliance table, Remind, CSV. |
| `admin/StudentsTab.tsx` | Follow-up (escalations + transfers filter), consistency, voluntary usage, never seen. |

### 9.2 Rewritten

| File | Change |
|---|---|
| `OfficeHoursHub.tsx` | The single page of §6.2. The tabs go away (Reports becomes a header link). The `?new=1&day=` deep link becomes `?assign=1` / `?days=1`. |
| `RegisterSheet.tsx` | Visitor quick-add first, assigned section with Present/Absent, auto-absent footer, recent visitors. Late/Excused/notes under ⋯. The offline queue is unchanged. |
| `MyOfficeHours.tsx` | §6.5: assigned card with reason, directory, history split. Parents see the same per child. |
| `OfficeHoursBandCells.tsx` / `useOfficeHoursBand.ts` | Teacher: "Academy Hall · 4 assigned" on their days, "+ Pick your days" on the first run. Student: assigned highlight or "3 of your teachers". Admin grid: teachers per day. |
| `admin/OfficeHoursAdmin.tsx` | 4 tabs + ⚙. `OverviewTab` becomes Today. `SettingsTab` is trimmed (§9.3). |
| `reports/*` | Assigned/voluntary columns, compliance report, export headers. |
| `api/officeHours.ts` | New endpoints and types, with retired calls removed. |

### 9.3 Hidden, kept or removed

| v1 feature | Fate |
|---|---|
| `ScheduleDrawer.tsx` (3-step create), `ScheduleDetail.tsx` | **Removed.** Replaced by DayPicker + AssignSheet + hub. The schedule detail route redirects to `/office-hours`. |
| Title, purpose, room, capacity, time and date window inputs | **Removed from the UI.** Columns stay. |
| Drafts / publish | **Removed.** Days save instantly, and referrals notify instantly. |
| WEEKDAY lock mode, allowed window, default/max capacity, roster settings shown to admins | **Hidden from Settings.** Cut-off, edit days, escalation thresholds, bands, parent notifications and QR remain. |
| Term rollover | **Replaced** by a prompt at the start of a term: *"Keep Tue & Thu for Term 2?"* (one tap). |
| Substitute host | **Admin only** (MANAGE_ANY), from the Today tab. |
| Outcomes / follow-up flags in the register | **Hidden under ⋯ → More.** |
| QR self check-in, live SSE register, "I can't come", suggestions, discipline referral | **Kept.** QR gains a P5 option: one **hall QR** where a student picks the teacher, which suits voluntary traffic (decision P7). |

---

## 10. Notifications, reports and integrations

### 10.1 Notification matrix (changes only)

| Event | To | Channel | Text |
|---|---|---|---|
| Days saved (first time) | Teacher | toast | "Shared with your students" |
| Days saved / changed | Admin | Friday digest + Teachers tab | "Ms A: Tue & Thu (changed from Mon & Thu, from 13 Oct)" |
| Declaration missing | Teacher | bell + push, daily 07:30 | "Pick your two office-hours days — due Mon 5 Oct" |
| Referral created | Student (parents only through escalations, D4) | bell + push (mandatory path) | "Office hours with Ms A — Tue 7 Oct, 16:20–17:20, Academy Hall. Reason: …" |
| Referral released / completed | Student | bell | "You no longer need to attend office hours with Ms A" |
| Session replaced | Assigned students, admin digest | bell + push | "Ms A moved Tue 7 Oct office hours to Wed 8 Oct, same time, Academy Hall" |
| Not replaced | Assigned students; admin | bell + push; admin bell | "…cancelled this week" / "Ms A could not replace Tue 7 Oct: <reason>" |
| Missed assigned session | Student, class teacher | existing escalation ladder | unchanged |

Students who only come voluntarily are not pinged when a session is replaced. The directory and band update instead. If the school wants every student of the teacher pinged, that is decision P8.

### 10.2 Reports

Every report gains **Assigned** (held, attended, absent, rate) and **Voluntary** (visits, unique students) columns. New: **Teacher compliance** (declared, sessions held/expected, on-day registers %, late registers, cancellations replaced %) and **Declarations** export (teacher, subject(s), days, submitted at), which replaces the Google Form sheet. The consistency bands apply to assigned attendance. A "most-used teachers / quiet days" view helps balance the hall.

### 10.3 Integrations

- **Home tiles** (`services/home/officeHoursProvider.ts`):
  - teacher: "Today 16:20 · 4 assigned" or "Pick your days";
  - student: the assigned card or "3 of your teachers today";
  - leadership: "Declared 41/48 · today 12 teachers · 63 visits this week".
- **Tendo lane:** unchanged contract. It shows assigned sessions only.
- **Task Mentor standing:** unchanged. It feeds *Suggested* in the AssignSheet.
- **Reminder Hub** `office_hours` kind: occurrences come from the availability (the teacher's own days) and from referrals (the student's assigned dates).
- **Desktop app** watchers: no change (same notification kinds, plus the new ones mapped in `NotificationBell.kindIcon`).

---

## 11. Decisions for the school

Each has a recommended default that the plan is built on. All are settings or small changes.

| # | Question | Recommendation |
|---|---|---|
| **P1** | Can a teacher choose **more than two** days (e.g. part-time staff fewer, keen staff more)? | **Exactly two** (`days_per_teacher = 2`). Admin can set exceptions per teacher via "set days". |
| **P2** | Should days be **balanced** across the hall (cap per weekday)? | **Show load only, no cap** at launch. Add a soft cap later if one day overflows. |
| **P3** | Can teachers **change days** mid-term? | **Yes, from next week**, with admin notified. Weekly referrals on the dropped day must be moved or released in the same dialog. |
| **P4** | Statuses: just Present/Absent, or keep Late/Excused? | **Present/Absent up front, Late/Excused under ⋯**, so Tendo's semantics (D3) still agree. |
| **P5** | The memo says to tell the student the **reason**. v1 hides reasons from students. | **Show the reason to the student** (policy wins). Reasons are student-friendly chips + an optional message. Parents do not see them unless escalated. |
| **P6** | Register never taken: are the assigned students **absent**? | **No.** It is a teacher compliance gap (missing register), not a student absence. R11 applies once a register is recorded. |
| **P7** | Voluntary visitors: teacher types them in, or **students check in** at a hall QR? | **The teacher adds them at launch** (quick-add + recent visitors). Pilot a hall QR in P5 if teachers report the typing as a burden. |
| **P8** | When a session is replaced, notify **all the teacher's students** or only the assigned ones? | **Only assigned students** (avoids spamming hundreds). The directory and timetable update for everyone. |
| **P9** | ONCE vs WEEKLY referral default | **Once** (the next session). Weekly is one tap away with a 4-week default end. |
| **P10** | Register edit window | **Same day.** Next-day saves are allowed and flagged *late*. After `register_edit_days` (1), only admin. |

---

## 12. Getting through 05 October (interim)

The memo takes effect tomorrow. The refactor needs about 1.5–2 weeks. Until it ships, v1 can carry the policy with these settings and instructions. No code is needed.

1. Admin sets in *Oversight → Settings*: lock mode **Term**, register edit days **1**.
2. Teachers: *New office hours* → pick **your two days**, leave the time at 16:20–17:20, room **Academy Hall**, title "Office hours". Publish **without students**. *(v1 creates sessions for a schedule with zero students, so walk-ins can be recorded with "Add a student who came".)* Assign students to that same schedule when needed.
3. Keep the Google Form for the 05 Oct submission. P1's conversion script reads the MIS rows, not the form.

*Verify step 2 on staging before telling staff. If v1 skips sessions for empty schedules, fall back to the form only and ship P1 + P2 first.*

---

## 13. Phases and task checklist

Each phase ends green: backend vitest (`TEST_DB_NAME=<private clone>`), frontend vitest and `tsc`. Never run vitest alongside the e2e API (MAMP trap).

**P0 — Decisions and checks (0.5 day)**
- [ ] Leadership confirms P1–P10 (§11).
- [ ] Owner runs the prod checks in §15.1 and reports the counts. They decide how much the conversion has to handle.
- [ ] Re-check the next free migration number right before merging (103 expected).

**P1 — Backend model (3 days)**
- [ ] `103_office_hours_policy.sql` + `officeHoursSchema.ts` additions; apply locally and to the test DB.
- [ ] `availability.ts` (+ `live_key`, hall load, mid-term change).
- [ ] `referStudents`, ONCE/WEEKLY, `completeOnceReferrals`, release; capacity checks removed.
- [ ] `cantHold` (same-week validation, carries ONCE referrals).
- [ ] Register: same-day window, `register_late`, auto-absent for assigned, `recentVisitors`.
- [ ] Routes in §8.2; retired routes → 410 aliases.
- [ ] `scripts/office-hours-policy-convert.ts` (dry-run + report).

**P2 — Teacher UI (3 days)**
- [ ] `DayPicker`, new `OfficeHoursHub`, `AssignSheet`, `CantHoldSheet`, `RegisterSheet` rewrite.
- [ ] Band cells (teacher states), Home teacher tile.
- [ ] Remove `ScheduleDrawer`/`ScheduleDetail` and add the redirect.

**P3 — Student and parent (1.5 days)**
- [ ] `/directory`, `TeacherDirectory`, `MyOfficeHours` rewrite (reason visible), student band entries, Home student tile.

**P4 — Administration (2.5 days)**
- [ ] Declarations, compliance, reminders job, Teachers tab with CSV, Students tab, console regrouped to 4 tabs + ⚙, trimmed settings.
- [ ] Reports: assigned/voluntary split, compliance report, exports.

**P5 — Notifications, docs, polish (1.5 days)**
- [ ] Notice texts (§10.1), new kinds in `NotificationBell.kindIcon` + Reminder Hub occurrences.
- [ ] `docs/OFFICE_HOURS.md` rewritten around the policy; teacher one-pager (the 4 actions).
- [ ] Optional hall-QR pilot (P7).

**P6 — Verification and release (1.5 days)**
- [ ] e2e rewrite (§14.3), axe at 390/768/1366 in both themes.
- [ ] Staging run of the conversion script; prod backup; migration via `migrate.yml`; conversion `--apply`; smoke checks.

---

## 14. Testing

### 14.1 Backend (`src/__tests__/officeHoursPolicy*.test.ts` + updates to the v1 suites)

- **Availability:**
  - exactly 2 distinct days (1 or 3 → 400);
  - a second save edits the same row;
  - two concurrent first saves → one row (`live_key` unique);
  - time and location forced;
  - a mid-term change cancels only sessions from next Monday;
  - `submitted_at` vs deadline.
- **Sessions exist without referrals.** A walk-in can be recorded on a teacher with zero assignments.
- **Referrals:**
  - ONCE locks then frees on register save;
  - WEEKLY frees at its end date and on release;
  - two teachers racing → one wins, the other gets a conflict carrying `holder_teacher_id`;
  - leadership refers to another teacher's office hours;
  - the cut-off moves ONCE to the next session;
  - the student payload contains the reason and message.
- **Can't hold:**
  - a replacement in the same week works and ONCE referrals follow it;
  - next-week dates → 400;
  - after start → 409;
  - not replaced → `NOT_REPLACED` + admin notice + ONCE referrals completed (not absent).
- **Register:**
  - unmarked assigned → ABSENT on save;
  - voluntary rows never ABSENT;
  - a next-day save sets `register_late`;
  - after the edit window → 403 for the owner, OK for MANAGE_ANY.
- **Metrics:**
  - voluntary visits never lower attendance rates;
  - escalations come from assigned absences only;
  - compliance figures on a fixture week.
- **Directory:** a student sees their teachers first; there are no student fields.
- **Conversion script:** fixtures for one schedule, several schedules, a 3-day schedule and an empty draft; dry-run makes no writes.
- **Regression:** the existing v1 suites are updated where behaviour changed by design (capacity, publish, reason hidden). Every other assertion keeps passing.

### 14.2 Frontend (`components/officeHours/__tests__`)

- DayPicker enables Save only at 2.
- AssignSheet: conflict row actions, preview text, partial-success toast.
- Register: quick-add with Enter, the auto-absent count, keyboard 1/2 + ⌘↵.
- CantHold: only same-week chips.
- MyOfficeHours shows the reason and the directory.
- Admin Teachers: missing list and CSV.

### 14.3 Browser e2e (`backend/scripts/office-hours-e2e/e2e.cjs`, rewritten)

1. A teacher with no days → picks Tue/Thu.
2. The student sees them in the directory.
3. The teacher refers student X once.
4. A second teacher is blocked on X, with Message / Ask to release.
5. Register: X present + 2 visitors.
6. X's lock is free.
7. Can't hold Thu → replaced Fri; X2 is notified.
8. Admin Today and Teachers show the declaration, compliance and CSV.
9. Report split.
10. Axe AA, no horizontal overflow, light/dark, 390/768/1366.

---

## 15. Rollout, data conversion and risks

### 15.1 Owner pre-checks (production, read-only; run them yourself)

```sql
SELECT status, COUNT(*) FROM OfficeHourSchedule GROUP BY status;
SELECT teacher_id, academic_term_id, COUNT(*) n FROM OfficeHourSchedule
 WHERE status IN ('ACTIVE','DRAFT') GROUP BY teacher_id, academic_term_id HAVING n > 1;
SELECT s.schedule_id, COUNT(d.day_of_week) days FROM OfficeHourSchedule s
 JOIN OfficeHourScheduleDay d USING (schedule_id) WHERE s.status='ACTIVE' GROUP BY s.schedule_id HAVING days <> 2;
SELECT COUNT(*) FROM OfficeHourAssignment WHERE status='ACTIVE';
SELECT COUNT(*) held FROM OfficeHourSession WHERE status='HELD';
SELECT * FROM OfficeHourSetting;
```

### 15.2 Release order

1. Back up: `migrate.yml` dumps first.
2. Apply 103.
3. Deploy MIS.
4. Run the conversion `--dry-run` on prod, review, then `--apply`.
5. Admin checks the Teachers board (declared count, "needs 2 days").
6. Announce to staff with the one-pager.

103 is additive, so the old code keeps running between steps 2 and 3.

### 15.3 Risks

| Risk | Mitigation |
|---|---|
| Teachers already entered v1 schedules (several, or with students) | Conversion keeps every assignment and lock; extra schedules become read-only `LEGACY`; admin board flags anything non-compliant. |
| One weekday overloads the Academy Hall | Live load on the day chips + admin load chart; P2 soft cap if needed. |
| Showing reasons to students feels stigmatising | Student-friendly reason wording; no grades or scores in the text; parents excluded unless escalated (P5). |
| Typing many visitors is slow at 16:20 | Focused quick-add, recent visitors, optional hall QR (P7). |
| Same-day register window too strict (power cuts, network) | Offline queue already in place; a late save is allowed but flagged rather than blocked; admin can always correct. |
| Retired endpoints still called by a cached PWA | 410 with `OFFICE_HOURS_V2` code; the SW cache bump forces the new bundle (see the lesson-note SW stale-cache trap). |
| Lock semantics change (ONCE frees after the session) surprises v1 users | Release notes; conflict text always names who referred and when. |

---

*Next step after approval of §11: start P1 on this branch.*
