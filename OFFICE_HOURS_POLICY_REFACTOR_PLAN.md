# Office Hours — Policy-First Refactor Plan (v2)

**Written:** 2026-10-04 (rev. 2)
**Branch:** `feat/office-hours-policy-refactor` (from `origin/main` e84056cb)
**Source of truth:** *Memo: Office Hours Policy* (Administration → all staff, dated 01 Oct 2026, effective **05 Oct 2026**), file `NGA-Office-Hours-Policy.pdf`.
**Replaces:** the v1 design in `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` (MIS #53, migration 102). v1 was deployed but **never used in production**: there is no real data to keep, so v2 is designed from the policy rather than adapted from v1.
**Audience:** developers and Claude Code sessions doing the work. School leadership: read §1, §5 and §12.

> **Status:** plan only. No code has changed on this branch yet.

---

## Contents

1. What the policy requires (R1–R12)
2. Why v1 is replaced, not patched
3. What we keep from v1, and what we delete
4. Target domain model
5. Workflows, designed for few steps
6. UI/UX design and wireframes
7. Data model: migration `103_office_hours_v2.sql`
8. Backend: services, API, jobs
9. Frontend: screens and file map
10. Notifications
11. Reports and administration follow-up
12. Decisions for the school
13. Integrations (Home, timetable, Reminder Hub, Tendo, Task Mentor, desktop)
14. Phases and task checklist
15. Testing
16. Rollout and risks

---

## 1. What the policy requires

| # | Rule | Memo text |
|---|---|---|
| **R1** | Office hours run **every weekday, 16:20–17:20, in the Academy Hall**. The time and place are fixed. | "take place daily from 4:20 PM to 5:20 PM in the Academy Hall" |
| **R2** | **Every instructor holds office hours on two days a week**, each 16:20–17:20. | "Every instructor holds office hours two days each week" · "Set two office-hours days per week" |
| **R3** | The instructor **shares the days with all their students** and **sends them to the administration by 05 Oct 2026**. | §1 bullet 2 |
| **R4** | The instructor **holds them as scheduled**. | §1 bullet 3 |
| **R5** | To cancel, the instructor **tells students in advance** and **offers another time that week**. | §1 bullet 3 |
| **R6** | **Voluntary:** a student comes on their own to ask for help. | §2 |
| **R7** | **Mandatory:** the instructor directs a student to attend, **assigned through MIS**. | §2, §3 |
| **R8** | **No student is sent to two instructors at once.** A student who already has an assignment **cannot be assigned again**. If MIS blocks the instructor, they **coordinate with the instructor who assigned the student**. | §3 bullets 1–2 |
| **R9** | When assigning, the instructor **tells the student the day, time, place and reason**. | §3 bullet 3 |
| **R10** | **Attendance is recorded for every session, on the day**, noting whether each visit was **voluntary or assigned**. | §4 bullet 1 |
| **R11** | **Assigned students who don't attend are marked absent.** | §4 bullet 2 |
| **R12** | The administration uses the records to see **who attends consistently** and to **follow up with students who miss assigned sessions**. | §4 bullet 3 |

**Consequences for the design:**
- Office hours are **teacher availability**: "Ms A is in the Academy Hall on Tue & Thu." A session exists on every declared day, whether or not anyone is assigned.
- **Voluntary visits are the normal traffic.** An assignment is an exception placed on top of availability.
- The MIS **replaces the Google Form** in "Next steps": declaring days in MIS *is* sending them to the administration (R3).
- "Every session" (R10) includes sessions where nobody came. "No one came" must be a one-tap register.

---

## 2. Why v1 is replaced, not patched

v1 was built from an earlier brief about *mandatory* office hours. Its central object is a teacher-built **group of named students**:

| Topic | v1 | Policy (v2) |
|---|---|---|
| Central object | `OfficeHourSchedule`: title, purpose, room, capacity, date window, 1–5 days, any number per teacher | **Availability**: one per teacher per term, **exactly two days**, fixed time and place |
| A session exists when… | …a schedule exists, which in practice meant a student group | …a declared day arrives, **always** |
| Voluntary visits | "Add a student who came", inside a schedule | **Primary** register action |
| Assigning | Build a schedule → draft → pick students → publish (3 screens, ~12 inputs) | **Assign** → who → which session and why (2 steps) |
| No-double-assignment lock | (term, student, weekday) rows, two modes | **One active assignment per student**: PK (term, student) |
| Reason | Hidden from students on purpose | **Told to the student** (R9) |
| Cancel | Cancel and Move as separate actions, any date | **Replace within the same week**, or record why not (R5) |
| Register window | 7 days | **On the day**. Later saves are flagged *late* |
| Unmarked assigned students | Stay "not marked" | **Absent on save** (R11) |
| Sharing with students | Students see only what they are assigned to | **Directory** of every teacher's days (R3) |
| Submission to admin | None | **Declarations board** with deadline, reminders and CSV |
| Navigation | Two menus: *Office Hours* and *Office Hours Oversight* | **One menu, *Office Hours***, whose views depend on the user's role |

Every row is a change of meaning, not of presentation. Keeping v1's tables would mean carrying unused columns (title, purpose, capacity, date windows, lock modes) and rules that contradict the policy. **Production has no office-hours data** (owner-confirmed, §16.1), so a clean model costs nothing in migration.

---

## 3. What we keep from v1, and what we delete

### 3.1 Kept (generic, already tested)

| Piece | File(s) | Use in v2 |
|---|---|---|
| Kigali clock, `todayYmd`, `OFFICE_HOURS_FAKE_NOW`, `withDeadlockRetry`, `officeHoursEnabled/Ready`, term helpers | `services/officeHours/common.ts` | Unchanged |
| School closures (table, service, admin UI) | `SchoolClosure`, `closures.ts`, `ClosuresTab` | Unchanged. Closure days produce no sessions |
| Period engine (day/week/month/term/year/custom) | `period.ts`, `reports/PeriodPicker.tsx` | Unchanged |
| Report export (CSV/Excel/PDF) | `reports/exports.ts` | Unchanged |
| Notification delivery (bell + push, independent of Reminder Hub opt-in) | the delivery helper inside `notify.ts` | New event texts (§10) |
| Escalation ladder logic, digest framework, scheduler loop | `escalation.ts`, `digests.ts`, `scheduler.ts` | Re-pointed to assignments and visits |
| Offline register queue | `offlineQueue.ts` | Unchanged, new payload |
| "I can't come" notice | `OfficeHourAbsenceNotice`, `AbsenceNoticeButton.tsx` | Applies to assigned sessions |
| Suggestions (Task Mentor standing + history) | `suggestionsFor` in `modern.ts` | Moves to `assignments.ts`, feeds *Suggested* |
| UI primitives | `ohUi.tsx` | Unchanged |
| Permissions `OFFICE_HOURS_MANAGE_OWN / MANAGE_ANY / VIEW / VIEW_SELF / CONFIGURE` + preset links | migration 102, `access/manifest.ts` | Same names, meanings restated in §8.4 |
| Kill switch and scheduler flag | `OFFICE_HOURS_ENABLED`, `OFFICE_HOURS_SCHEDULER` | Unchanged |

### 3.2 Deleted

- **Tables:** `OfficeHourSchedule`, `OfficeHourScheduleDay`, `OfficeHourAssignment`, `OfficeHourStudentLock`, `OfficeHourSession`, `OfficeHourAttendance(+History)`, `OfficeHourTransferRequest`, `OfficeHourEscalation`, `OfficeHourAbsenceNotice` and the v1 `OfficeHourSetting` are archived by 103 (renamed `v1_*`) and dropped by a later migration (§7.3).
- **Services:**
  - `schedules.ts`, `assignments.ts` (rewritten), `transfers.ts`, `sessions.ts` (rewritten);
  - `live.ts` (SSE register), QR check-in and rollover in `modern.ts`;
  - `register.ts`, `views.ts`, `metrics.ts`, `reports.ts`, `admin.ts` and `reconcile.ts` (all rewritten on the new tables).
- **Frontend:** `ScheduleDrawer.tsx`, `ScheduleDetail.tsx`, `StudentPicker.tsx` (its row logic moves into `AssignSheet`), `CheckIn.tsx`, `admin/CoverageTab.tsx`, the transfer list, the `/office-hours/admin` route and the *Office Hours Oversight* sidebar item.
- **Tests:** `officeHoursPhase0/Core/Views/Register/Notifications/Reports/Modern.test.ts` and the frontend `__tests__` for deleted components. Each is replaced by a v2 suite (§15).

---

## 4. Target domain model

### 4.1 Concepts

```
OfficeHourPolicy         band 16:20–17:20 · location "Academy Hall" · days_per_teacher 2 · deadline
OfficeHourTeacher        one row per (term, teacher): status ACTIVE | EXEMPT, submitted_at
 └─ OfficeHourTeacherDay    weekday + effective_from / effective_to (history of day changes)
OfficeHourSession        one per (teacher, date): SCHEDULED | HELD | CANCELLED · replaced_by_session_id
 └─ OfficeHourVisit         student × session · visit_type ASSIGNED | VOLUNTARY · status · assignment_id
OfficeHourAssignment     student → teacher · ONCE (a session) | WEEKLY (days, until) · reason · message
 └─ OfficeHourAssignmentLock  PK (term, student): at most one ACTIVE assignment per student
OfficeHourEscalation     follow-up on missed assigned sessions
OfficeHourAbsenceNotice  "I can't come" from a student, for an assigned session
SchoolClosure            (kept) dates without office hours
```

### 4.2 Rules

**Teacher days (R1–R4)**
- An **instructor** is a user with `OFFICE_HOURS_MANAGE_OWN` who has at least one `TeacherSubjectAssignment` in the term's year. These are the people the declarations board expects.
- A teacher declares exactly `days_per_teacher` distinct weekdays (Mon–Fri). The time and place come from the policy and are never entered.
- **First declaration:** the days take effect today if before the band, otherwise tomorrow. `submitted_at` is set.
- **Change of days (P3):** takes effect from **next Monday**, so this week stays as students were told. Implementation: close the old rows (`effective_to = Sunday`) and open new ones. Future sessions on dropped days with no visits are deleted. WEEKLY assignments on a dropped day are listed in the same dialog (move to a kept day / release).
- **Exempt:** leadership (MANAGE_ANY) can mark a teacher `EXEMPT` for the term (part-time, leave) with a note. Exempt teachers disappear from "missing".
- Leadership can also **set days for a teacher**, for example from the Google Form responses already collected (§12 P9).

**Sessions (R4, R5)**
- Created for every effective declared date that is not a closure. A sweep keeps 14 days ahead, and `ensureSessions` runs on every read and save. Unique key **(teacher_id, session_date)**.
- **Can't hold it** is allowed until the band start on that day:
  - **Replace:** pick a date in the **same Mon–Fri week**, later than today (or today if it is before the band), not a closure. If the teacher already has a session that date (their other day), the original points to it. Otherwise a one-off session is created (`is_extra = 1`). The original becomes `CANCELLED / REPLACED` with `replaced_by_session_id`. ONCE assignments move to the replacement automatically.
  - **Not possible:** a required reason; `CANCELLED / NOT_REPLACED`. ONCE assignments targeting it are **completed without attendance**: they are not counted absent, and the lock is freed.
- After the band starts, there is no cancel. An unrecorded session becomes a **missing register** (teacher compliance), never a student absence (P6).

**Assignments (R7–R9)**
- A teacher assigns **students they teach** (subject, class teacher or mentor, the same rule as v1 `teachableStudentIds`). Leadership may assign **any student to any teacher's office hours**.
- **Mode:**
  - `ONCE` (default, P8): one session, by default the teacher's next session. After the cut-off (14:00) on a session day, the default is the following one.
  - `WEEKLY`: every session on chosen declared day(s) until an end date (default 4 weeks, max term end) or until released.
- **Lock (R8):** creating an assignment inserts `OfficeHourAssignmentLock(term, student)` in the same transaction. A duplicate key is turned into a structured conflict: *"Already assigned by Mr K — Thu 9 Oct · Physics"*, with actions **Message Mr K** and **Ask to release** (a bell notice to Mr K that opens the assignment with *Release*).
- **Lock release:**
  - a ONCE assignment **completes** when its session's register is saved, or when the session is cancelled without replacement;
  - a WEEKLY assignment completes after its last session's register, or at its end date;
  - any assignment can be **released** by the assigning teacher or by leadership.

  Each of these deletes the lock row.
- **Reason (R9):** a required reason chip, worded for students, plus an optional message (≤ 300 characters). **Both are shown to the student** in the notice, on their page and on the timetable details. Reasons:
  - `TOPIC_HELP` — Help with a topic;
  - `MISSED_WORK` — Catch up on missed work;
  - `ASSESSMENT_REVIEW` — Review your assessment;
  - `ABSENCE_CATCH_UP` — Catch up after absence;
  - `PROJECT_SUPPORT` — Project support;
  - `OTHER`, which requires the message.

**Visits and register (R10, R11)**
- The register opens at band start − 15 min. Normal edits are allowed **on the day**. A save the next day or later is accepted, stamped `register_late = 1`, and counted in teacher compliance. After `register_edit_days` (default 2) only MANAGE_ANY can edit.
- **Rows:**
  - **Assigned** rows are pre-filled from ACTIVE assignments covering the session (snapshotted on first open);
  - **Voluntary** rows are added by the teacher. They never take a lock and never count as absence.
- Statuses: **Present / Absent** up front. **Late / Excused** sit under "⋯" (P4). Attended = Present + Late + Excused, as in Tendo.
- **Save:**
  - assigned rows still unmarked become **ABSENT** (R11); the footer shows the count before saving;
  - the session becomes HELD.
- **"No one came":** one tap saves an empty HELD register when there are no assigned students.
- Each change writes history (who, when, from → to). Saves are versioned against overwrites (v1 behaviour).

---

## 5. Workflows, designed for few steps

| Who | Task | Steps | Where it starts |
|---|---|---|---|
| Teacher | **Declare my two days** | 1 (tap 2 days → Save) | First visit to Office Hours; Home tile; timetable band "+ Pick your days"; daily reminder until done |
| Teacher | **Take attendance** | 1 (add visitors, toggle assigned → Save) | Today card; timetable band cell; 16:25 push |
| Teacher | **Nobody came** | 1 tap | Today card |
| Teacher | **Assign students** | 2 (Who → When & why) | Assign button; register row "⋯ Assign again"; Person 360; Task Mentor suggestion |
| Teacher | **Can't hold a session** | 1 sheet (pick replacement day or give reason → Confirm) | Today card ⋯; session ⋯ on This week |
| Teacher | **Release a student** | 1 tap + undo toast | Assigned list |
| Teacher | **Resolve a block** | 1 tap (Message / Ask to release) | Inline on the blocked student row |
| Student | **See who's in the hall** | 0 (visible on page and timetable) | My office hours; timetable band; Home |
| Student | **See my assignment** | 0 | Notice; My office hours; timetable band |
| Student | **Say I can't come** | 1 | Assignment card |
| Leadership | **Check declarations** | 0 (Teachers view), 1 to remind all missing | Office Hours → School → Teachers |
| Leadership | **Follow up a student** | 1 (open → acknowledge with note / refer) | School → Follow-up |
| Leadership | **Fill days from the Google Form** | 1 (paste/upload CSV → preview → apply) | School → Teachers ⋯ |

---

## 6. UI/UX design and wireframes

### 6.1 Principles

1. **Policy values are never asked for.** Time, place and number of days are shown, never entered. The only inputs anywhere are days, students, session, reason, message and statuses.
2. **One menu, one page per role.** *Office Hours* opens the right view: teacher (My office hours), student/parent (My office hours, student view), leadership (a **Me / School** switch at the top, showing *School* only with `OFFICE_HOURS_VIEW`).
3. **At most two steps** for any frequent task (§5). There are no drafts, no publish step and no separate detail pages.
4. **Consequences are shown before commit:**
   - live hall load on day chips ("Tue · 7 teachers");
   - a live preview of the student's notice;
   - "2 not marked → absent" before saving a register;
   - "3 assigned students will move to Wed" before confirming a replacement.
5. **Conflicts appear inline with the next action**, never as an error page or a dead end.
6. **Interactive and forgiving:**
   - optimistic toggles;
   - undo toasts (release, remove visitor);
   - keyboard shortcuts in the register (/ focuses search, Enter adds, 1 = present, 2 = absent, ⌘↵ saves);
   - skeleton loading;
   - autosave of the register draft locally.
7. **Minimal content:** one sentence of help per screen at most, plain words ("Assign", "Can't hold it", "No one came"), and no jargon such as "materialise", "schedule" or "lock".
8. **House style and accessibility:** `ohUi.tsx` primitives, `--status-*` colours, dark mode, a 390 px phone layout (drawers become full screen), and axe WCAG AA. Charts follow the `dataviz` skill.

### 6.2 Teacher: first visit

```
┌──────────────────────────────────────────────────────┐
│  Pick your two office-hours days                     │
│  16:20–17:20 · Academy Hall                          │
│                                                      │
│  ( Mon 5 )( Tue 7 )( Wed 3 )( Thu 6 )( Fri 2 )       │ ← teachers already on each day
│                                                      │
│  1 of 2 picked                     [ Save my days ]  │
│  Due Mon 5 Oct · your students will see them         │
└──────────────────────────────────────────────────────┘
```

After saving: *"Tuesdays & Thursdays, 16:20–17:20, Academy Hall. Your students can see this now."* The page then becomes the hub.

### 6.3 Teacher hub (the only teacher page)

```
┌──────────────────────────────────────────────────────────────────┐
│ Office hours        Tue & Thu · 16:20–17:20 · Academy Hall  ✎    │
│                                                     [ + Assign ] │
├──────────────────────────────────────────────────────────────────┤
│ TODAY · Tue 7 Oct                                                │
│ 3 assigned                [ Take attendance ]  [No one came]  ⋯  │
│                                               (⋯ Can't hold it)  │
├──────────────────────────────────────────────────────────────────┤
│ THIS WEEK    Tue 7 ● now      Thu 9 · 2 assigned   ⋯             │
├──────────────────────────────────────────────────────────────────┤
│ ASSIGNED (5)                                                     │
│ Aline M. · S4A · Thu 9 · Catch up on missed work     [Release]   │
│ Eric N.  · S4B · every Tue until 4 Nov · Topic help  [Release]   │
├──────────────────────────────────────────────────────────────────┤
│ ⚠ Register missing · Thu 2 Oct                [ Record now ]     │
│ ↔ Mr K asks you to release Grace U.        [Release] [Keep]      │
├──────────────────────────────────────────────────────────────────┤
│ This term: 8 sessions · 61 visits (12 assigned, 49 voluntary)    │
│                                              View report →       │
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 Assign (drawer, 2 steps)

```
1 · Who                                   2 · When & why
[ Search name or reg. no.        ]        Session  (Tue 7)(Thu 9)(Tue 14)(Thu 16)
(S4A)(S4B)(S5 Maths)  ✦ Suggested 3       ( Once )   ( Every Tue ▾ until 4 Nov )
                                          Reason   (Topic help)(Missed work)
☑ Aline M.  S4A   Free                             (Assessment review)(…)
☐ Grace U.  S4A   Assigned by Mr K · Thu  Message  [ optional                 ]
             ▸ Message Mr K · Ask to release
☐ Eric N.   S4B   With you                ┌ Aline will receive ─────────────┐
                                          │ Office hours with Ms A           │
                                          │ Tue 7 Oct · 16:20–17:20          │
                                          │ Academy Hall                     │
                                          │ Reason: Catch up on missed work  │
1 selected                  [ Next → ]    └──────────────────────────────────┘
                                          [ ← Back ]             [ Assign 1 ]
```

Result toast: *"2 assigned · 1 already assigned by Mr K"*. Blocked students stay listed with their actions.

### 6.5 Register (drawer; full screen on phones)

```
Tue 7 Oct · 16:20–17:20 · Academy Hall                    saved 16:41 ✓
[ / Add a visitor — type a name…                ]   Recent: (Jean)(Grace)(Paul)

ASSIGNED (3)                                              [ All present ]
 Aline M.  S4A  Catch up on missed work   (●Present)( Absent )  ⋯
 Eric N.   S4B  Topic help                ( Present)( Absent )  ⋯
 Ivan K.   S5   Assessment review         ( Present)( Absent )  ⋯   ⓘ "I can't come: sick bay"

VISITORS · voluntary (9)
 Jean P.   S5   Present   ✕
 …
──────────────────────────────────────────────────────────────────────────
1 present · 2 not marked → absent · 9 visitors                  [ Save ]
```

### 6.6 Can't hold it (sheet)

```
Can't hold Tue 7 Oct
Replace this week:   ( Wed 8 · 5 )( Thu 9 · your day )( Fri 10 · 2 )
                     ( No day possible → reason [            ] )
Message to students (optional) [                                     ]
3 assigned students will move to Thu 9 and be told.        [ Confirm ]
```

### 6.7 Student: My office hours

```
ASSIGNED TO YOU
 Ms A · Mathematics
 Tue 7 Oct · 16:20–17:20 · Academy Hall
 Reason: Catch up on missed work · "Bring your exercise book"
                                                  [ I can't come ]
YOUR TEACHERS IN THE HALL THIS WEEK              [ Search all teachers ]
 Mon   Mr K · Physics
 Tue   Ms A · Mathematics   Mr D · English
 Thu   Ms A · Mathematics
 Fri   —
MY VISITS THIS TERM
 9 voluntary · 3 assigned (3 attended)            History ▾
```

Parents see the same page per child, read-only, without "I can't come".

### 6.8 Leadership: Office Hours → School

| View | Content | Actions |
|---|---|---|
| **Today** | Teachers expected in the hall today, register state per teacher (taken / due / missing), assigned vs visitors so far | Open any register read-only; set a substitute recorder (MANAGE_ANY) |
| **Teachers** | Declarations: declared / missing / exempt vs deadline; weekday load bar chart; compliance per teacher (sessions held, on-day registers, cancellations replaced) | **Remind missing** · **Set days** · **Exempt** · **Import from form (CSV)** · **Download CSV** |
| **Follow-up** | Students who missed assigned sessions (escalation levels), with history | Acknowledge with note · Refer to discipline (Tendo prefill) · Assign |
| **Reports** | Period picker; school / grade / class / teacher / student breakdowns; assigned vs voluntary | CSV · Excel · PDF |
| ⚙ | Policy (band, location, days per teacher, deadline, cut-off, edit days, escalation thresholds, parent notifications) and closures | Save |

---

## 7. Data model: migration `103_office_hours_v2.sql`

Idempotent, MySQL 5.7 and 8, same style as 102 (information_schema guards, `INSERT IGNORE`). Drizzle definitions live in `backend/src/db/officeHoursSchema.ts`, which is rewritten.

### 7.1 Archive v1

For each v1 table except `SchoolClosure`: `RENAME TABLE OfficeHourX TO v1_OfficeHourX` if the source exists and the target doesn't. This is reversible, and nothing reads `v1_*`.

### 7.2 New tables

```sql
OfficeHourPolicy (                      -- one row, id = 1
  id TINYINT PK,
  band_start CHAR(5) DEFAULT '16:20', band_end CHAR(5) DEFAULT '17:20',
  location VARCHAR(100) DEFAULT 'Academy Hall',
  days_per_teacher TINYINT DEFAULT 2,
  declaration_deadline DATE NULL,        -- seeded 2026-10-05; leadership updates per term
  roster_cutoff_time CHAR(5) DEFAULT '14:00',
  register_edit_days TINYINT DEFAULT 2,
  weekly_default_weeks TINYINT DEFAULT 4,
  escalation_consecutive_l1 TINYINT DEFAULT 2, escalation_month_l1 TINYINT DEFAULT 2,
  escalation_consecutive_l2 TINYINT DEFAULT 3,
  rate_band_consistent TINYINT DEFAULT 90, rate_band_watch TINYINT DEFAULT 80,
  min_sessions_for_rate TINYINT DEFAULT 3,
  parent_notifications ENUM('OFF','ESCALATIONS','WEEKLY') DEFAULT 'ESCALATIONS',
  updated_by BIGINT NULL, updated_at DATETIME NULL)

OfficeHourTeacher (
  academic_term_id BIGINT, teacher_id BIGINT,          PK (academic_term_id, teacher_id)
  status ENUM('ACTIVE','EXEMPT') DEFAULT 'ACTIVE', exempt_note VARCHAR(255) NULL,
  submitted_at DATETIME NULL, submitted_by BIGINT NULL, -- set by teacher or leadership
  updated_at DATETIME)

OfficeHourTeacherDay (
  id BIGINT PK AI, academic_term_id BIGINT, teacher_id BIGINT,
  day_of_week TINYINT,                                  -- 1 = Mon … 5 = Fri
  effective_from DATE, effective_to DATE NULL,          -- NULL = open
  created_by BIGINT, created_at DATETIME,
  INDEX (academic_term_id, day_of_week, effective_from))

OfficeHourSession (
  session_id BIGINT PK AI, academic_term_id BIGINT, teacher_id BIGINT,
  session_date DATE,                                    UNIQUE (teacher_id, session_date)
  status ENUM('SCHEDULED','HELD','CANCELLED') DEFAULT 'SCHEDULED',
  is_extra TINYINT DEFAULT 0,                           -- one-off replacement day
  cancel_reason ENUM('REPLACED','NOT_REPLACED','CLOSURE','DAYS_CHANGED','ADMIN') NULL,
  cancel_note VARCHAR(255) NULL, cancelled_by BIGINT NULL, cancelled_at DATETIME NULL,
  replaced_by_session_id BIGINT NULL,
  recorder_id BIGINT NULL,                              -- substitute recorder for this date
  register_first_saved_at DATETIME NULL, register_last_saved_at DATETIME NULL,
  register_saved_by BIGINT NULL, register_late TINYINT DEFAULT 0,
  version INT DEFAULT 1,
  INDEX (session_date, status), INDEX (academic_term_id, teacher_id, session_date))

OfficeHourAssignment (
  assignment_id BIGINT PK AI, academic_term_id BIGINT,
  student_id BIGINT, teacher_id BIGINT, assigned_by BIGINT,
  mode ENUM('ONCE','WEEKLY'),
  session_id BIGINT NULL,                               -- ONCE target (follows replacements)
  weekly_days VARCHAR(9) NULL, starts_on DATE, ends_on DATE,  -- WEEKLY: '2,4'
  reason_code VARCHAR(30), message VARCHAR(300) NULL,
  status ENUM('ACTIVE','COMPLETED','RELEASED') DEFAULT 'ACTIVE',
  ended_at DATETIME NULL, ended_by BIGINT NULL, end_note VARCHAR(255) NULL,
  created_at DATETIME,
  INDEX (teacher_id, status), INDEX (student_id, academic_term_id))

OfficeHourAssignmentLock (                              -- R8: the DB enforces it
  academic_term_id BIGINT, student_id BIGINT,           PK (academic_term_id, student_id)
  assignment_id BIGINT UNIQUE, created_at DATETIME)

OfficeHourVisit (
  session_id BIGINT, student_id BIGINT,                 PK (session_id, student_id)
  visit_type ENUM('ASSIGNED','VOLUNTARY'),
  assignment_id BIGINT NULL,
  status ENUM('PRESENT','ABSENT','LATE','EXCUSED') NULL, -- NULL only before save
  excuse_reason VARCHAR(30) NULL, note VARCHAR(255) NULL,
  marked_by BIGINT NULL, marked_at DATETIME NULL,
  INDEX (student_id, session_id))

OfficeHourVisitHistory (history_id PK AI, session_id, student_id, previous_status, new_status,
  previous_type, new_type, changed_by, changed_at)

OfficeHourEscalation (escalation_id PK AI, academic_term_id, student_id, assignment_id,
  level TINYINT, trigger_code VARCHAR(20), trigger_session_id, notified_user_ids TEXT,
  created_at, acknowledged_by NULL, acknowledged_at NULL, resolution_note VARCHAR(500) NULL)

OfficeHourAbsenceNotice (notice_id PK AI, session_id, student_id, reason VARCHAR(30),
  note VARCHAR(255) NULL, created_at,  UNIQUE (session_id, student_id))
```

**Permissions:** none added. 103 updates the labels of the existing `OFFICE_HOURS_*` rows to the v2 wording (§8.4).

### 7.3 Clean-up migration

After v2 has run one week in production with no rollback, `10x_drop_office_hours_v1.sql` drops the `v1_*` tables. It gets its own PR so the rollback window is explicit.

---

## 8. Backend: services, API, jobs

### 8.1 Services (`backend/src/services/officeHours/`)

| File | Responsibility |
|---|---|
| `common.ts` | Kept |
| `policy.ts` | Replaces `settings.ts`. Read (60 s cache) and validated save of `OfficeHourPolicy`; `publicPolicy()` |
| `access.ts` | Rewritten small: `actorOf`, `isInstructor(userId, yearId)`, `canRecord(session)` (teacher, substitute recorder, MANAGE_ANY), `readScopeOf` (kept from v1) |
| `teacherDays.ts` | `getMyDays`, `saveMyDays` (first declaration vs change-from-next-Monday), `setDaysFor` (leadership), `setExempt`, `hallLoad(term, week)`, `importDays(csvRows, dryRun)` (P9), `effectiveDaysOn(date)` |
| `sessions.ts` | `ensureSessions(teacherIds?, from, to)` (closure-aware, idempotent through the unique key), `sessionsFor(viewer, range)`, `cantHold(sessionId, {replacementDate} \| {reason}, message)` |
| `assignments.ts` | `candidates(actor, query)` (teachable students + availability state: free / with you / assigned by X), `assign(actor, input)` (partial success: `assigned[]`, `blocked[]` with holder, `ineligible[]`), `release`, `askToRelease`, `completeForSession(sessionId)`, `suggestions` (moved from v1) |
| `register.ts` | `openRegister` (snapshot assigned rows), `saveRegister(sessionId, rows, version)` (auto-absent, late flag, history, HELD, completes ONCE assignments, triggers escalation), `noOneCame`, `recentVisitors(teacherId)` |
| `views.ts` | `teacherHub(actor, term)`, `studentPage(studentId, term)` (assignment + reason + directory + history), `directory(term, weekStart, viewer)`, `band(viewer, weekStart)` |
| `metrics.ts` | One place for formulas: assigned attendance rate, presence rate, voluntary visits, unique visitors, consistency band, teacher compliance |
| `reports.ts` | Scoped datasets on the period engine: summary, breakdown (teacher / subject / class / grade / weekday / reason), consistency, student 360, teacher 360, declarations, compliance, daily sheet |
| `escalation.ts` | Kept logic, re-pointed to `OfficeHourVisit` (assigned only) |
| `notify.ts` / `events.ts` | Event texts of §10; same delivery helper |
| `digests.ts` | Friday teacher digest (week's visits, missing registers), leadership digest (declarations, compliance, follow-ups), parent summary if `WEEKLY` |
| `reminders.ts` | Reminder Hub occurrences: teachers' own days; students' assigned sessions |
| `scheduler.ts` | Jobs in §8.3 |
| `reconcile.ts` | Nightly: complete expired WEEKLY assignments, remove orphan locks, release assignments of students who left their class, cancel future sessions on new closures |

### 8.2 API (`backend/src/routes/officeHours.ts`, mounted at `/office-hours`)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/config` | auth | Policy values + the caller's capabilities |
| GET | `/hub` | MANAGE_OWN | Teacher hub payload (days, today, week, assigned, missing registers, release asks, term totals) |
| GET | `/my-days` | MANAGE_OWN | My days + hall load + deadline |
| PUT | `/my-days` | MANAGE_OWN | `{ days: [2,4] }` → result + `affected_weekly[]` |
| GET | `/directory?week=` | auth | Teachers per weekday (no student data) |
| GET | `/candidates?q=&class_group_id=` | MANAGE_OWN | Students with availability state |
| GET | `/suggestions` | MANAGE_OWN | Evidence-based list |
| POST | `/assignments` | MANAGE_OWN / MANAGE_ANY (`teacher_id`) | `{ student_ids, mode, session_id \| weekly_days+ends_on, reason_code, message }` |
| POST | `/assignments/:id/release` | assigner, teacher, MANAGE_ANY | Frees the lock |
| POST | `/assignments/:id/ask-release` | MANAGE_OWN | Bell notice to the holder |
| GET | `/sessions?from=&to=` | auth (scoped) | Sessions for the viewer. **Tendo contract** (§13) |
| POST | `/sessions/:id/cant-hold` | recorder / MANAGE_ANY | Replace or not-replaced |
| GET | `/sessions/:id/register` | recorder / VIEW | Register rows + absence notices |
| PUT | `/sessions/:id/register` | recorder / MANAGE_ANY | Save (versioned) |
| POST | `/sessions/:id/no-one-came` | recorder | Empty HELD register |
| GET | `/sessions/:id/recent-visitors` | recorder | Quick-add chips |
| POST / DELETE | `/sessions/:id/absence-notice` | VIEW_SELF (student) | "I can't come" |
| GET | `/me`, `/children` | VIEW_SELF | Student and parent pages. **Tendo contract** |
| GET | `/band?week=` | auth | Timetable band entries for the viewer |
| GET | `/school/today` | VIEW | Live hall view |
| GET | `/school/teachers` | VIEW | Declarations + load + compliance |
| POST | `/school/teachers/remind` | MANAGE_ANY | Remind missing |
| PUT | `/school/teachers/:id/days` | MANAGE_ANY | Set days |
| PUT | `/school/teachers/:id/exempt` | MANAGE_ANY | Exempt or restore |
| POST | `/school/teachers/import?dry_run=1` | MANAGE_ANY | Google Form CSV → days |
| PUT | `/sessions/:id/recorder` | MANAGE_ANY | Substitute recorder |
| GET | `/escalations` · POST `/escalations/:id/ack` | VIEW / MANAGE_ANY | Follow-up |
| GET | `/reports/{summary,breakdown,consistency,compliance,declarations,daily}` · `/reports/students/:id` · `/reports/teachers/:id` | VIEW (scoped, summary depth = totals only); teachers see their own | Reports |
| GET / POST / DELETE | `/closures`, `/closures/preview` | VIEW / CONFIGURE | Kept |
| GET / PUT | `/policy` | CONFIGURE | Policy |

The route-level `officeHoursReady()` guard (503 before migration) and the kill switch (404) are kept. `officeHoursReady()` checks for `OfficeHourPolicy` instead of the v1 table.

### 8.3 Jobs (one pm2 process, Kigali time, each keyed and idempotent)

| Job | When | What |
|---|---|---|
| Ensure sessions | every 6 h | 14 days ahead for every ACTIVE teacher |
| Declaration reminder | 07:30 weekdays, until all declared | Bell + push to missing instructors. Leadership summary on deadline day and the day after |
| Morning note | 06:30 on a teacher's day | "Office hours today 16:20 · Academy Hall · 3 assigned" |
| Register reminder | band start + 5 min; band end + 10 min if missing; 20:00 if still missing | Push to recorder |
| Escalations | 18:30 (also after every register save) | Ladder on assigned absences |
| Reconcile | 02:00 | §8.1 `reconcile.ts` |
| Digests | Friday 17:30 | §8.1 `digests.ts` |

### 8.4 Access control

| Capability | v2 meaning |
|---|---|
| `OFFICE_HOURS_MANAGE_OWN` | Declare my days, assign students I teach, record my sessions (all teacher roles, as in 102) |
| `OFFICE_HOURS_MANAGE_ANY` | Set days or exempt any teacher, assign any student to any teacher, record or correct any register, substitute recorder, closures |
| `OFFICE_HOURS_VIEW` (summary / detail, scoped) | School view and reports within scope. Summary depth = totals, no names |
| `OFFICE_HOURS_VIEW_SELF` | Student/parent page and "I can't come" |
| `OFFICE_HOURS_CONFIGURE` | Policy |

Scope uses `resolveUserScope`, as in v1 (class teacher → class, programme lead → programme, head/deputies → school). The directory needs only authentication: teacher names and days are meant to be shared (R3), and it never returns student data.

---

## 9. Frontend: screens and file map (`frontend/src/`)

| File | Status | Content |
|---|---|---|
| `api/officeHours.ts` | rewrite | Endpoints and types of §8.2 |
| `components/officeHours/OfficeHoursPage.tsx` | new | `/office-hours` entry: picks Teacher hub / Student page / Me–School switch by capability |
| `components/officeHours/teacher/DayPicker.tsx` | new | §6.2; reused by "✎" and by leadership *Set days* |
| `components/officeHours/teacher/TeacherHub.tsx` | new | §6.3 |
| `components/officeHours/teacher/AssignDrawer.tsx` | new | §6.4 (row-state logic ported from `StudentPicker`) |
| `components/officeHours/teacher/RegisterDrawer.tsx` | new | §6.5 (offline queue, keyboard, version conflict merge ported from `RegisterSheet`) |
| `components/officeHours/teacher/CantHoldSheet.tsx` | new | §6.6 |
| `components/officeHours/student/StudentOfficeHours.tsx` | new | §6.7 (replaces `MyOfficeHours.tsx`); parent mode |
| `components/officeHours/student/TeacherDirectory.tsx` | new | Week strip; also used in the band popover and Home |
| `components/officeHours/school/SchoolView.tsx` | new | Tabs Today · Teachers · Follow-up · Reports · ⚙ |
| `components/officeHours/school/{TodayTab,TeachersTab,FollowUpTab,PolicyTab}.tsx` | new | §6.8. `ClosuresTab` is kept and moved under ⚙ |
| `components/officeHours/school/ImportDaysDialog.tsx` | new | CSV paste/upload → preview → apply (P9) |
| `components/officeHours/reports/*` | adapt | `OfficeHoursReports`, `Person360` on v2 datasets. `PeriodPicker` and `exports` kept |
| `components/officeHours/OfficeHoursBandCells.tsx`, `useOfficeHoursBand.ts` | adapt | Teacher: "Academy Hall · 3 assigned", or "+ Pick your days" until declared. Student: highlighted assignment or "3 of your teachers". Class grid: teachers per day |
| `components/officeHours/AbsenceNoticeButton.tsx`, `offlineQueue.ts`, `ohUi.tsx` | keep | — |
| `ScheduleDrawer`, `ScheduleDetail`, `StudentPicker`, `RegisterSheet`, `MyOfficeHours`, `CheckIn`, `OfficeHoursHub`, `admin/*` (except Closures) | delete | — |
| `App.tsx` | edit | Routes: `/office-hours` (all), `/office-hours/reports/students/:id`, `/office-hours/reports/teachers/:id`. Remove `/office-hours/admin`, `/office-hours/schedules/:id` (redirect to `/office-hours`), `/office-hours/checkin`, `/my-office-hours` (redirect) |
| `components/ui/Sidebar.tsx`, `NavSearch.tsx` | edit | **One "Office Hours" item** for anyone holding any `OFFICE_HOURS_*` capability. Remove "Office Hours Oversight" |
| `activity/mis.catalog.json` + backend `catalogs/mis.json` | edit | New route/action names for analytics |
| `constants/permissions.ts` | keep | — |

---

## 10. Notifications

All mandatory notices go to the **bell + push** directly, whatever the user's Reminder Hub opt-in.

| Event | Recipient | Text |
|---|---|---|
| Days declared | Teacher (toast); leadership digest | "Tuesdays & Thursdays, 16:20–17:20, Academy Hall — your students can see this now." |
| Days changed | Leadership (digest + Teachers view) | "Ms A: Tue & Thu → Mon & Thu from 13 Oct" |
| Declaration missing | Missing instructors, daily | "Pick your two office-hours days — due Mon 5 Oct." |
| **Assigned** | Student | "Office hours with Ms A — Tue 7 Oct, 16:20–17:20, Academy Hall. Reason: Catch up on missed work." (+ message) |
| Assigned weekly | Student | "Office hours with Ms A — every Tuesday until 4 Nov, 16:20–17:20, Academy Hall. Reason: …" |
| Released | Student | "You no longer need to attend office hours with Ms A." |
| Ask to release | Holder teacher | "Mr K asks you to release Grace U. so he can assign her." → opens the assignment |
| **Session replaced** | Assigned students | "Ms A moved Tuesday's office hours to Thursday 9 Oct, 16:20–17:20, Academy Hall." |
| Session not replaced | Assigned students; leadership | "Ms A's office hours on Tue 7 Oct are cancelled. You don't need to attend." / "Ms A could not replace Tue 7 Oct: <reason>" |
| Before session | Assigned students and teacher (Reminder Hub, opt-in) | "Office hours at 16:20 in the Academy Hall" |
| I can't come | Teacher | "Ivan K. can't come today: sick bay" (shown on the register too) |
| Missed assigned session | Student; class teacher; ladder per §11 | "You missed office hours with Ms A on Tue 7 Oct." |
| Register missing | Recorder (reminders); leadership (Today, digest) | "Record Tuesday's office-hours attendance." |

Voluntary-only students are not notified of replacements (P7). The directory and timetable update for everyone.

---

## 11. Reports and administration follow-up

**Metrics (`metrics.ts`, the only definitions, shown under "How is this calculated?"):**
- **Assigned attendance rate** = (present + late + excused) ÷ assigned visits in HELD sessions.
- **Presence rate** = (present + late) ÷ the same denominator.
- **Voluntary visits** = count of VOLUNTARY rows; **unique visitors** = distinct students.
- **Consistency band** (assigned, from 3 sessions): consistent ≥ 90%, watch 80–89%, chronic < 80%.
- **Regular visitor** = a student with voluntary visits in ≥ 3 of the last 4 weeks. This is the "attends consistently" view of R12 for voluntary use.
- **Teacher compliance** for a period:
  - declared (yes/no);
  - sessions held ÷ sessions due (due excludes closures and replaced originals);
  - on-day registers %;
  - late registers;
  - cancellations replaced %.

**Reports:**
- summary;
- breakdowns by teacher / subject / class / grade / programme / weekday / reason;
- consistency lists (chronic, watch, regular visitors, never seen);
- student 360 (every visit, both types);
- teacher 360 (days, sessions, visits, compliance);
- **declarations** (teacher, subjects, days, submitted at, by whom): this **replaces the Google Form sheet**;
- printable daily register sheet.

All of them export to CSV, Excel and PDF.

**Follow-up (R12), escalation ladder on assigned absences only:**
- **Level 1:** 2 assigned absences in a row, or 2 in 30 days. The student, the assigning teacher and the class teacher are told.
- **Level 2:** 3 in a row, or a rate below the watch band. The programme lead is told, and parents by email if the policy allows.
- A level re-arms after two attended assigned sessions in a row.
- In **Follow-up**, leadership acknowledges with a note, assigns again, or opens a prefilled Tendo discipline record (never automatic).

---

## 12. Decisions for the school

The plan is built on the recommendation in each row. All are policy settings or small changes.

| # | Question | Recommendation |
|---|---|---|
| **P1** | Exactly two days, or "at least two"? | **Exactly two** (`days_per_teacher = 2`); leadership can exempt or set days for a teacher. |
| **P2** | Limit how many teachers share one weekday in the hall? | **No cap; show the load live** so teachers balance. Add a soft cap later if a day overflows. |
| **P3** | May teachers change their days mid-term? | **Yes, effective next Monday**, leadership informed. Weekly assignments on a dropped day are moved or released in the same dialog. |
| **P4** | Statuses | **Present / Absent** up front; **Late / Excused** under ⋯ (Tendo-compatible). |
| **P5** | The reason is shown to the student (R9). Shown to parents too? | **Student: yes. Parents: only when an escalation reaches them.** |
| **P6** | If the teacher records no register, are assigned students absent? | **No.** It is a missing register (teacher compliance). R11 applies when a register is recorded. |
| **P7** | On replacement, notify all the teacher's students or only assigned ones? | **Only assigned students.** Everyone else sees the change in the directory and timetable. |
| **P8** | Default assignment mode | **Once (next session)**; "Every week until…" one tap away (default 4 weeks). |
| **P9** | Teachers already sent days through the **Google Form** by 05 Oct. | **Import the form's CSV** once (leadership: School → Teachers → Import), so nobody enters days twice. Teachers can still adjust. |
| **P10** | Register edit window | **On the day** normally; the next day is accepted and flagged *late*; after 2 days only leadership. |
| **P11** | Self check-in by QR (v1 feature) | **Not in v2.** Teachers record visits with quick-add. Revisit a single hall kiosk if typing proves slow. |

---

## 13. Integrations

- **Timetable band** (`CalendarGrid`, `DashboardCalendarWidget`, `TeacherWelcome`): data from `/office-hours/band` (§9). The `calendarConstants.ts` band literal remains the offline fallback. The `"Office Hours"` activity type stays removed from `CalendarSlotModal`.
- **Home** (`services/home/officeHoursProvider.ts`, rewritten):
  - teacher tile: "Pick your days", or "Today 16:20 · 3 assigned · Take attendance";
  - student tile: the assignment card, or "3 of your teachers in the hall today";
  - leadership tile: "Declared 41/48 · 12 teachers today · 63 visits this week";
  - attention items: missing registers older than 1 day, and undeclared instructors after the deadline.
- **Reminder Hub** (`services/reminders/occurrences.ts`): the `office_hours` kind is kept. Occurrences come from teacher days (teacher) and assigned sessions (student).
- **Tendo** (`nga-discipline-attendance/server/src/modules/attendance/officeHours.ts`):
  - reads `/office-hours/me` and `/office-hours/sessions`, and deep-links to `/office-hours/schedules/:id`;
  - v2 keeps both endpoints with a compatible shape (`session_id`, `session_date`, `start_time`, `end_time`, `title` = "Office hours — Ms A", `location`, `status`, plus a new `assigned` flag);
  - the deep link becomes `/office-hours?session=<id>`, and MIS redirects the old `/office-hours/schedules/:id` to `/office-hours`;
  - a small Tendo PR updates the link and the lane test (`officeHoursLane.test.ts`). It shows only sessions where the student is **assigned**.
- **Task Mentor:** `GET /api/integration/student-standing` is unchanged and feeds *Suggested*.
- **Desktop app / notification bell:** new notification kinds mapped in `NotificationBell.kindIcon`. The desktop watchers need no change.
- **Analytics:** key events `oh_days_declared`, `oh_assigned`, `oh_register_saved`, `oh_cant_hold`, `oh_released`.

---

## 14. Phases and task checklist

Each phase ends green: backend vitest on a private test-DB clone, frontend vitest and `tsc`. Never run vitest while the e2e API or another DB-heavy suite is running (MAMP trap).

**P0 — Confirm (0.5 day)**
- [ ] Leadership confirms P1–P11 (§12).
- [ ] Owner runs the production checks in §16.1 (expected: all v1 tables empty).
- [ ] Get the Google Form response export (columns: teacher email/name, days) for P9.
- [ ] Re-check the next free migration number (103 expected) before merging.

**P1 — Data and core services (3 days)**
- [ ] `103_office_hours_v2.sql`, the new `officeHoursSchema.ts`, and `test/officeHoursFixtures.ts` rewritten.
- [ ] `policy.ts`, `access.ts`, `teacherDays.ts`, `sessions.ts` (ensure, can't hold), `assignments.ts` (lock, partial success, complete, release, ask), `register.ts` (auto-absent, late, no-one-came, history).
- [ ] Routes for teacher and student flows; delete v1 services and routes.

**P2 — Teacher UI (3 days)**
- [ ] `OfficeHoursPage`, `DayPicker`, `TeacherHub`, `AssignDrawer`, `RegisterDrawer`, `CantHoldSheet`.
- [ ] Band cells (teacher), Home teacher tile, single sidebar item, routes and redirects; delete v1 components.

**P3 — Student and parent (1.5 days)**
- [ ] `/directory`, `/me`, `/children`, `StudentOfficeHours`, `TeacherDirectory`, absence notice, student band and Home tile.

**P4 — School view and reports (3 days)**
- [ ] `metrics.ts`, `reports.ts`, the School view (Today, Teachers + import + CSV, Follow-up, Reports, Policy + Closures).
- [ ] Escalation, digests, reminders and the scheduler jobs of §8.3.

**P5 — Integrations and docs (1 day)**
- [ ] Reminder Hub occurrences, analytics catalog, NotificationBell kinds.
- [ ] Tendo PR (link + test).
- [ ] Rewrite `docs/OFFICE_HOURS.md` around the policy, with a one-page teacher guide (declare, attend, assign, can't hold).
- [ ] Mark `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` as superseded at the top.

**P6 — Verify and release (1.5 days)**
- [ ] Browser e2e rewrite (§15.3), axe AA in light and dark at 390/768/1366.
- [ ] Load check (40 teachers × a term of sessions, 50 visits a day) with report queries under 0.5 s.
- [ ] Release per §16.2.

**Total: about 13.5 working days.**

---

## 15. Testing

### 15.1 Backend (vitest + supertest, `src/__tests__/officeHoursV2*.test.ts`)

- **Policy:** validation (band order, `days_per_teacher` 1–5, deadline date).
- **Teacher days:**
  - exactly N distinct days (1 or 3 → 400);
  - first save is effective today or tomorrow around the band;
  - a change is effective next Monday and keeps this week's sessions;
  - sessions on dropped days with visits are kept, those without are removed;
  - `affected_weekly` is listed;
  - exempt removes the teacher from "missing";
  - leadership set-days records `submitted_by`;
  - CSV import dry-run writes nothing, matches by email, reports unknown teachers and bad day counts.
- **Sessions:**
  - created for declared days only, none on closures;
  - two concurrent `ensureSessions` calls produce no duplicates;
  - can't hold: a same-week replacement creates an extra session or reuses the other day, and ONCE assignments move;
  - next-week dates → 400; after the band started → 409;
  - not-replaced completes ONCE assignments with no absence and notifies leadership.
- **Assignments:**
  - only teachable students (403 otherwise), while leadership may assign any student to any teacher;
  - two teachers racing for one student → exactly one assignment, and the other gets `blocked` with `holder_teacher_id`;
  - partial success;
  - the cut-off moves the default session;
  - ONCE completes on register save and frees the lock;
  - WEEKLY completes at its end and on release;
  - ask-release notifies the holder;
  - the student payload contains `reason_code` and `message`.
- **Register:**
  - assigned rows are snapshotted;
  - unmarked assigned → ABSENT on save, and voluntary rows are never ABSENT;
  - adding a voluntary visitor who has an assignment on that session turns them into ASSIGNED, not a duplicate;
  - a next-day save is flagged late;
  - past `register_edit_days` → 403 for the teacher, OK for MANAGE_ANY;
  - the version conflict → 409 with the latest rows;
  - no-one-came on a session with assigned students → 400;
  - every change writes history.
- **Metrics and reports:**
  - a fixture week checks each formula by hand;
  - voluntary visits never change attendance rates;
  - compliance excludes replaced originals and closures;
  - summary depth hides names;
  - class teacher, programme and school scopes.
- **Escalation:** levels from assigned absences only; re-arm after two attended.
- **Views:** the directory carries no student fields; a student sees their own teachers first; a parent sees only linked children.
- **Jobs:** each job is idempotent when run twice.
- **Routes:** 404 with the kill switch off; 503 before migration 103.

### 15.2 Frontend (vitest + Testing Library, `components/officeHours/__tests__`)

- DayPicker: Save is enabled only at exactly two days; the load chips render.
- TeacherHub: first-run vs declared states; "No one came" is visible only with zero assigned students.
- AssignDrawer:
  - blocked row actions;
  - the preview text matches the selection;
  - the partial-success toast;
  - "Other" requires a message.
- RegisterDrawer:
  - "/" focuses search, Enter adds a visitor;
  - 1/2 toggles; the auto-absent count; ⌘↵ saves;
  - an offline save is queued.
- CantHoldSheet: only same-week dates; the move count line.
- StudentOfficeHours: reason and message shown; directory ordering; parent mode has no "I can't come".
- School Teachers tab: missing list, remind, the import preview, CSV columns.
- Sidebar: one *Office Hours* item for teachers, students and leadership.

### 15.3 Browser end-to-end (`backend/scripts/office-hours-e2e/e2e.cjs`, rewritten; `OFFICE_HOURS_FAKE_NOW`)

1. Teacher A (no days) sees the picker and picks Tue/Thu.
2. Student X sees A in the directory and on the timetable band.
3. A assigns X once with a reason; X's page and bell show day, time, place and reason.
4. Teacher B tries to assign X, sees "assigned by A", and asks to release; A sees the request.
5. At the session, A adds 2 visitors, marks X present and saves. X's lock is freed, so B can now assign X.
6. A assigns Y for Thu, then *Can't hold Thu → Fri*. Y is told and the Fri session exists.
7. On a session where nobody came, A taps "No one came" and the session is HELD.
8. Leadership checks Teachers (A declared, C missing → remind; import CSV for C), then Today, Follow-up and Reports (the assigned/voluntary split), and exports CSV.
9. Axe AA with no horizontal overflow in light and dark at 390, 768 and 1366 px on the teacher hub, register, student page and School view.

---

## 16. Rollout and risks

### 16.1 Production pre-check (owner; read-only)

```sql
SELECT 'schedules', COUNT(*) FROM OfficeHourSchedule
UNION ALL SELECT 'assignments', COUNT(*) FROM OfficeHourAssignment
UNION ALL SELECT 'sessions', COUNT(*) FROM OfficeHourSession
UNION ALL SELECT 'attendance', COUNT(*) FROM OfficeHourAttendance
UNION ALL SELECT 'closures', COUNT(*) FROM SchoolClosure;
```

All counts except closures are expected to be 0. If any are not, stop and export them before running 103. Closures are kept as they are.

### 16.2 Release order

1. Merge the MIS PR.
2. Back up and apply 103 through `migrate.yml`; it takes a mysqldump first.
3. The MIS deploy runs automatically on merge. The 503 guard covers the gap if the deploy lands before the migration.
4. Leadership sets `declaration_deadline` and imports the Google Form CSV (P9).
5. Merge the Tendo PR.
6. Announce to staff with the one-page teacher guide.
7. One week later, run the v1 drop migration.

### 16.3 Risks

| Risk | Mitigation |
|---|---|
| The Academy Hall is overcrowded on popular days | Live load on day chips and the leadership load chart; soft cap if needed (P2) |
| Typing visitors at 16:20 is slow | Focused quick-add with Enter, recent-visitor chips, keyboard flow; kiosk later (P11) |
| Same-day register too strict (network, power) | Offline queue; late saves accepted and flagged, not blocked; leadership can correct |
| Showing reasons to students feels stigmatising | Student-friendly reason wording only; no marks or scores in the text; parents excluded unless escalated (P5) |
| Teachers already used the Google Form | CSV import (P9) so nobody re-enters days |
| Cached PWA still calls removed v1 endpoints | Service-worker cache bump on release; old URLs redirect to `/office-hours` |
| Tendo lane breaks on the new shape | `/me` and `/sessions` keep compatible fields; Tendo PR ships in the same release; lane test updated |
| The v1 code path is needed back | 103 only renames v1 tables; drop only after one clean week |

---

*Next step: once §12 is confirmed and §16.1 returns empty counts, start P1 on this branch.*
