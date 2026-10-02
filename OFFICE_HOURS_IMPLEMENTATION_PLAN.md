# Mandatory Office Hours — Implementation Plan (v1)

**Written:** 2026-10-01
**Scope:** central MIS (`nga_central_mis`): data, API, timetable integration, register, notifications, reports. Light read-only integrations in the Discipline & Attendance app (Tendo, `nga-discipline-attendance`) and Task Mentor (TM).
**Audience:** developers and Claude Code sessions implementing it. School leadership should read §1 and §3 (the decisions). Paths are relative to `/Users/m2pro/dev/projects/nga-mis-full/`.

**Depends on / builds on:**
- [`ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`](./ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md): capabilities, presets, `authorizeIn` / `requireCapability`, scope filtering.
- `docs/REMINDER_HUB.md`: the Reminder Hub (in-app, Web Push, Telegram, Google Calendar, webcal, email escalation). Office hours plug into it as a new occurrence kind.
- The Mentorship module (`MENTORSHIP_MODULE_IMPLEMENTATION_PLAN.md`, `mentorAssignmentController.ts`): the template for "one active assignment, soft-close, 409 unless reassigning, bulk assign".
- The timetable's shared "live lesson" rule (`calendarController.ts` `liveLessonFilters` / `loadTeacherLessons` / `loadStudentLessons`) and the bell schedule in `frontend/src/components/calendar/calendarConstants.ts`.

> **Status check (2026-10-01):**
> - Build from **`origin/main`** (MIS `6871b1ba`). This checkout (`nga_central_mis`) is on `feat/access-control-v2` and holds someone else's uncommitted work. **Do not switch branches here.** Create a worktree: `git worktree add ../nga_central_mis-office-hours -b feat/office-hours origin/main` and move this file into it.
> - **Migration numbers:** 096–098 are taken by the Lesson Studio branch and 099 by `099_analytics_access.sql`. **This feature uses `102_office_hours.sql`** (100 was skipped on main; 101 is already applied in production, so 102 keeps apply order). Re-check right before merging.
> - **Nothing exists yet.** No backend code or SQL mentions office hours. The only traces are in the frontend:
>   - the bell-schedule band `{ start: "16:20", end: "17:20", label: "Office Hours", type: "office" }` (`calendarConstants.ts:33`);
>   - `"Office Hours"` in the activity-type datalist (`CalendarSlotModal.tsx:63`);
>   - a layout test asserting the grid **never** looks up the 16:20 row (`calendar/__tests__/calendarLayout.test.ts:156`).
> - MIS has **no attendance tables**. `MARK_ATTENDANCE` / `VIEW_ATTENDANCE` exist in the access manifest but no MIS endpoint uses them. Lesson attendance lives in Tendo (SQLite).

---

## Contents

1. Problem, outcome, and what "done" looks like
2. Research basis: real-world practice and current code
3. Decisions for the school (with recommendations)
4. Design principles
5. Domain model and rules
6. Data model: migration `102_office_hours.sql`
7. Backend: services, API and jobs
8. Timetable integration (the 16:20 band)
9. Teacher experience
10. Student and parent experience
11. Leadership experience
12. Attendance register
13. Notifications and reminders
14. Reports (daily, weekly, monthly, termly, annual)
15. Access control
16. Modernization features
17. Integrations (Tendo, Task Mentor, Home, analytics)
18. Privacy, fairness and data protection
19. Phased delivery and task checklist
20. Testing
21. Rollout and operations
22. Risks
23. Implementation file map

---

## 1. Problem, outcome, and what "done" looks like

**Today.** The bell schedule reserves 16:20–17:20 every weekday for office hours, but the MIS cannot hold anything in that band:
- teachers cannot say which students must come;
- nothing stops two teachers summoning the same student;
- nobody records who came;
- leadership cannot see who consistently attends and who does not.

**Outcome.**
1. A teacher schedules **mandatory office hours** on the timetable's last band, on **one or more weekdays**, for a date window inside a term.
2. The teacher **assigns specific students**. The MIS **guarantees no overlap**: a student who already holds an office-hours assignment cannot be assigned again (D1 defines the exact rule). The teacher sees why ("held by Mr K, Tue/Thu") and can ask for a transfer.
3. At each session the teacher **records attendance** in a few seconds (one tap per exception), on a phone or a classroom PC, online or offline.
4. Students (and, by policy, parents) are **notified**: when they are assigned, changed, removed or cancelled, before each session, and when they miss.
5. **Reports** for any **day, week, month, term or year** (or a custom range) show:
   - sessions held vs planned;
   - per-student consistency (attendance rate, streaks, chronic list);
   - per-teacher delivery and unmarked registers;
   - breakdowns by subject, class group, grade and programme.

**Done means:**
- two teachers assigning the same student at the same instant produces **exactly one** assignment;
- every scheduled session is either held and marked, cancelled with a reason, or listed as "unmarked" on the leadership board;
- the term report for a student reconciles exactly with their session-by-session history.

---

## 2. Research basis

### 2.1 How schools run this elsewhere (summary of the research brief)

| Practice | Seen in | What we take |
|---|---|---|
| A fixed flex/support block after or inside the day ("WIN time", "Power Hour", FlexiSched) | Securly Flex, Edficiency, Enriching Students, SmartPass, FlexiSched | Our 16:20 band is exactly this. Rosters change; attendance is taken per session. |
| **Priority tiers** for conflicts: Admin-required > Priority > teacher add > Required > optional | Securly Flex priority guide | Our rule is a hard lock plus an **override tier** for leadership and a **transfer request** between teachers (§5.4). |
| **Cut-off lock**: a day's roster freezes at a set time so the roll sheet is accurate | Enriching Students (08:30 lock), Securly cut-off | `roster_cutoff_time` setting: a same-day assignment after the cut-off starts at the next meeting (§5.3). |
| Capacity per session, queue when full | Securly, SmartPass "Wait in Line" | `capacity` per schedule, with a hard maximum setting. A waitlist is deferred (§16). |
| Kiosk / QR check-in, but staff confirm | Enriching Students, EAB Navigate | Optional rotating-QR self check-in; **the teacher's mark is authoritative** (§16.1). |
| Dosage and fidelity logging (date, duration, topic, attended) | MTSS fidelity guides, Texas dosage log | Session `topic`, per-student `outcome` and `follow_up` flag (§12.4). |
| Chronic threshold ≈ 10% missed; tiered triggers (2 misses in a month → referral) | Attendance Works | Bands and escalation ladder (§13.4), aligned with Tendo's existing 80% warning threshold. |
| Parent texts reduce chronic absence when sparing, personal and in the home language | MDRC, The 74, CSBA | Parents get escalations and a weekly summary only, never per-session pings (D4). |
| Labelling students "at risk" can be self-fulfilling | FERPA/AI commentary, Wisconsin predictor | Neutral naming; reasons staff-only; no opaque scoring (§18). |
| Rwanda Law 058/2021: minimisation, purpose limitation, children's data, local storage (Art. 50), NCSA registration | DPA summaries | §18. The open legal items are the same ones already tracked by the analytics plan §13. |

Sources are in the research brief appendix (§A).

### 2.2 Current code we reuse (MIS `origin/main` 6871b1ba)

| Need | Existing code | Notes |
|---|---|---|
| Term and year boundaries | `AcademicTerm` / `AcademicYear` (`schema.ts:241-263`), `is_current=1`; `loadCurrentTerm` (`services/reminders/occurrences.ts:53`) | `StudentClassGroup`, `StudentSubjectEnrollment` and `TeacherSubjectAssignment` are **per year**, not per term. |
| Kigali date expansion | `kigaliDatesBetween`, `dowOfYmd`, `dbDateToYmd`, `parseClock` (`services/reminders/time.ts`); `inTerm`, `activityOccursOn` (`occurrences.ts:73-92`) | Reuse these to turn weekly patterns into dated sessions. |
| A teacher's students | `TeacherSubjectAssignment` ⨝ `StudentClassGroup` (+ `StudentSubjectEnrollment`); class teacher via `UserGrade`; mentees via `MentorAssignment` | Students are `User.user_id`; `UserProfile.registration_number` is the human id. |
| Scope checks | `resolveUserScope` / `isClassGroupInScope` (`services/userScope.ts`), `readableClassGroupIds` (`calendarController.ts:90`), v2 `req.access.scopeFor` | |
| Class-group activities that may clash at 16:20 | `loadClassGroupActivities` (`calendarController.ts:1286`) | Used for a soft clash warning (§5.5). |
| Bell + upsert notifications | `notifyUser` / `notifyUsers` (`utils/notifications.ts`), unique `(user_id, kind, subject_type, subject_id)` | `NotificationKind` and `subjectType` are closed unions; extend them. Frontend polls every 45 s; `NotificationBell.kindIcon` needs new cases. |
| Bell + Web Push in one call | `notifyPerson` (`services/activity/notify.ts`) | Generalise it (§13.2). |
| Scheduled reminders | Reminder Hub: `collectOccurrences` → `planJobs` → `dispatchDue` | **Only for users with `ReminderPreference.enabled=1`** (default off). Mandatory notices must therefore also go through the bell and push directly. |
| Change and cancel notices | `timetableChanges.ts` `onActivityChanged`, `releaseDeliveredJobs`; `afterResponse()` | Add `onOfficeHoursChanged`. |
| Email | `utils/email.ts` `sendEmail` (nodemailer, inline HTML) | No SMS anywhere. |
| Parents | `Parenting(student_id, parent_id, relationship)` (`schema.ts:580`) | Parents are `User` rows (`user_type=PARENT`). |
| Background jobs | `setInterval` loops started in `backend/src/index.ts` (skipped in tests), single pm2 process | Add an `officeHours` scheduler guarded like `REMINDERS_SCHEDULER`. |
| Locks | `GET_LOCK` pattern (`insertRoleWithNextId`) | Used for teacher-side window checks. |
| Exports | Frontend `jspdf` + `jspdf-autotable`, `xlsx`; backend `puppeteer` (`services/pdfExport.ts`) | Follow the reporting module: client-side CSV/XLSX/PDF first. |
| Realtime | SSE patterns (`services/elearning/livePresence.ts`, monitor `/live/stream` + single-use tickets) | Optional live register view (§16.4). |
| Home tiles | `routes/home.ts`, `services/home/providers.ts` | Office-hours tiles are an MIS-native provider. |

### 2.3 Gaps found while planning

| # | Gap | Fix (phase) |
|---|---|---|
| G1 | The office band is a hard-coded, non-teaching row. `buildGridLayout` never places anything in it, and a test asserts that. | Band-entry rendering (§8), with the test updated deliberately (P2). |
| G2 | `CalendarActivity` cannot hold students, capacity, sessions or attendance, and its assignees are staff-only. | Dedicated `OfficeHour*` tables (§6). The `"Office Hours"` datalist entry is removed so there is one way to do it (P2). |
| G3 | There is no school holiday or closure entity, so sessions on closure days would count as missed. | `SchoolClosure` table (§6.9), also usable later by the lesson reminders (P1). |
| G4 | Reminder Hub kinds are a closed list. | Add the `office_hours` kind in all 7 places (§13.3). |
| G5 | Tendo reads only `slots` from MIS, so office hours never reach it. | Tendo integration reads a dedicated MIS endpoint (§17.1, P6). |
| G6 | The bell-schedule office band times exist only in frontend code. | Move them into `OfficeHourSetting` (§6.8), served via `/office-hours/config`. The frontend constant becomes a fallback (P1). |

Production data check (P0; prod DB reads are blocked from this sandbox, so the owner runs it). Look for office hours someone already modelled as activities:

```sql
SELECT activity_id, academic_term_id, class_group_id, day_of_week, start_time, end_time, is_active
FROM CalendarActivity WHERE activity_type LIKE '%office%';
```

---

## 3. Decisions for the school (with recommendations)

The plan is built around the **recommended** option for each decision. Every alternative is a setting or a small change, so none of them blocks Phase 0.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | What does "a student already assigned can't be assigned again" mean? | **(a) Term lock:** one active office-hours assignment per student per term, whatever the days. **(b) Weekday lock:** at most one assignment per weekday, so Mon/Wed with Ms A and Tue with Mr B is allowed. | **(a), as written in the brief.** Implemented as a setting `student_lock_mode = TERM \| WEEKDAY`, default `TERM`. Both modes use the same lock table (§6.4), so switching later needs no migration. |
| **D2** | Whom may a teacher assign? | (a) only students they teach (subject, class teacher, mentor); (b) any student | **(a) by default**, plus a setting `allow_any_student`. Leadership (`OFFICE_HOURS_MANAGE_ANY`) can always assign anyone. |
| **D3** | Does "excused" count as attended? | (a) yes, the same as Tendo's `attendancePolicy.ts` (present + late + excused); (b) no | **(a), so the apps agree.** Reports also show a stricter **presence rate** (present + late ÷ held) for teachers. |
| **D4** | Are parents notified? | none / escalations only / escalations + weekly summary | **Escalations only at launch** (`parent_notifications = ESCALATIONS`). Turn on the weekly summary once parent accounts and emails are verified. Email, plus bell and push if the parent uses the PWA. |
| **D5** | Is skipping mandatory office hours a discipline matter? | automatic demerit / manual referral / never | **Manual referral button** (P6) that opens a pre-filled Tendo discipline record. Never automatic. |
| **D6** | Can a teacher remove a student mid-term? | yes with reason / only leadership | **Yes, with a reason code.** The lock frees immediately and leadership sees the change log. |
| **D7** | Are times fixed to 16:20–17:20? | fixed band / editable inside a window | **Default to the band; editable inside `allowed_window` (16:00–18:00).** Sessions must not overlap the teacher's own lessons. |
| **D8** | Who sees which reports? | — | Teacher: own sessions and students. Class teacher: own class group. Programme lead: programme. Head teacher and deputies: school. Student: self. Parent: children (§15). |
| **D9** | Retention | — | Detailed rows for the current year + 1, then aggregates only (§18). |
| **D10** | Same-day roster cut-off | none / a fixed time | **14:00**: a same-day assignment after 14:00 starts at the next meeting, so students are never surprised at 16:15. |

---

## 4. Design principles

1. **The database enforces the invariant.** "No overlap" is a primary key, not an `if`. A race between two teachers can only end one way (§6.4).
2. **One shared rule for "is this session real".** One function, `officeHourSessionFilters()`, defines a live session (schedule ACTIVE, date inside window and term, not a closure, not cancelled). Every read — calendar, reminders, reports, Home — uses it, just as every timetable read uses `liveLessonFilters()`.
3. **Dated sessions are materialised.** The weekly pattern is a plan; the **session** row is the fact that attendance, cancellations and substitutes attach to. Sessions are created by a rolling sweep (next 14 days) and lazily on read and mark, so a session always exists before anyone needs it.
4. **Mandatory means guaranteed reach.** Assignment, removal, cancellation and escalation notices go to the **bell and push** directly. The Reminder Hub adds the "before it starts" reminders for opted-in users.
5. **The teacher's mark is authoritative.** QR check-in, offline queues and automatic absence closing all *propose*; the teacher's register *decides*.
6. **Kigali time everywhere.** `session_date` is a Kigali DATE. Clock times are `HH:MM` strings, as on `CalendarSlot`. Any DATETIME bound in raw SQL uses `toDbUtc()` (the Reminder Hub trap).
7. **Neutral language for students.** Students see "Office hours with Ms A — Mathematics". Reason codes such as "below expected standard" are staff-only.
8. **Follow house style.** Manual validation with `ValidationError` / `ConflictError`, `successResponse`, `asyncHandler`, hand-written idempotent SQL that works on MySQL 5.7, the Drizzle schema in its own file (`officeHoursSchema.ts`, like `reminderSchema.ts`), capabilities via the manifest, and vitest + supertest tests against the test DB.

---

## 5. Domain model and rules

### 5.1 Concepts

```
OfficeHourSchedule      "Ms A — Maths support, Mon & Wed, 16:20–17:20, Room B4, 6 Oct → 12 Dec, cap 15"
 ├─ OfficeHourScheduleDay      one row per weekday it meets (1=Mon … 5=Fri, backend day encoding)
 ├─ OfficeHourAssignment       student ↔ schedule, with effective window, reason, status
 │    └─ OfficeHourStudentLock one row per locked weekday: the no-overlap guarantee
 └─ OfficeHourSession          a dated occurrence: 2026-10-06, SCHEDULED/HELD/CANCELLED, host teacher
      └─ OfficeHourAttendance  student × session: PRESENT/LATE/ABSENT/EXCUSED (+ history)
SchoolClosure           dates with no office hours (holidays, exams, events)
OfficeHourEscalation    "Student X missed 3 in a row — class teacher notified, acknowledged by Y"
OfficeHourTransferRequest  "Mr B asks Ms A to release student X to his Tue schedule"
OfficeHourSetting       school-wide policy (D1, D2, D4, D7, D10, thresholds)
```

### 5.2 Schedule rules

- **Term-bound.** A schedule belongs to exactly one `academic_term_id`. `effective_from` and `effective_to` default to *today/next meeting* and the *term end*, and must fall inside the term. Term rollover copies schedules forward (§16.6).
- **Days.** 1–5 weekdays, in backend encoding (1=Mon … 5=Fri), the same as `CalendarSlot.day_of_week`.
- **Times.** Default to the configured band (16:20–17:20). If changed, they must stay inside `allowed_window` with `end > start`.
- **Teacher no-overlap.** A teacher cannot host two ACTIVE schedules that share a weekday **and** have overlapping date windows **and** overlapping times. This is checked under `GET_LOCK('oh:teacher:<id>')` (date windows make a plain unique key wrong), plus a check against the teacher's own lessons via `loadTeacherLessons` (relevant only if D7 times move outside the band).
- **Subject** is optional. It must be one the teacher is assigned to that year (`TeacherSubjectAssignment`), unless the teacher has `MANAGE_ANY`. It drives subject reports and the default candidate list.
- **Capacity:** default `default_capacity` (15), hard maximum `max_capacity` (40). Counted as the active assignments that overlap a given date.
- **Status:** `DRAFT → ACTIVE → ENDED`, or `CANCELLED` from DRAFT. Ending a schedule ends its assignments (the locks free) and cancels its future sessions with reason `SCHEDULE_ENDED`. Sessions already held stay for reporting. Hard delete is allowed only for a schedule with zero HELD sessions.

### 5.3 Assignment rules

- **Eligibility.** The student is ACTIVE in `StudentClassGroup` for the term's year. D2 controls whether they must be someone the teacher teaches.
- **No overlap (D1).** On assign, insert `OfficeHourStudentLock` rows in the same transaction as the assignment:
  - `TERM` mode: one row per weekday **1–5**, so the student is fully locked;
  - `WEEKDAY` mode: one row per weekday the schedule meets.

  The PK `(academic_term_id, student_id, day_of_week)` makes a duplicate impossible. `ER_DUP_ENTRY` is turned into a structured conflict naming the holder.
- **Effective window.** `effective_from` defaults to the next meeting date. If the assignment is made on a meeting day after `roster_cutoff_time` (D10), it starts at the following meeting. `effective_to` defaults to the schedule's `effective_to`.
- **Bulk assign** is partial success, never all-or-nothing. The response lists `assigned[]`, `conflicts[]` (with holder teacher, schedule title and days), `ineligible[]` (with reason) and `over_capacity[]`.
- **Removal** (D6) needs a `reason_code` (`GOAL_MET`, `TRANSFERRED`, `LEFT_CLASS`, `TEACHER_REQUEST`, `ADMIN_OVERRIDE`, `OTHER`) and optional note. It sets `status=ENDED`, `ended_at`, `effective_to = today`, deletes the locks, and notifies the student.
- **Override** (`MANAGE_ANY`): ends the holder's assignment with `ADMIN_OVERRIDE` and creates the new one atomically, in one transaction. Both teachers and the student are notified, and the override is logged.
- **Automatic end:**
  - the student's `StudentClassGroup` status becomes DISABLED or they change class (a nightly reconcile plus a hook where placement changes are applied) → `LEFT_CLASS`;
  - the schedule ends → `SCHEDULE_ENDED`;
  - the term ends → natural end.
- Assignments are never deleted. History is kept for reports.

### 5.4 Transfer requests (teacher ↔ teacher)

When teacher B hits a conflict, the UI offers **"Ask Ms A to release"**. This creates `OfficeHourTransferRequest(PENDING)` and notifies A. A can **Accept** (the assignment moves atomically, as with an override but with reason `TRANSFERRED`) or **Decline** with a note. A request expires after 3 school days (`EXPIRED`). Leadership can see and decide any pending request.

### 5.5 Soft clash warnings (not blocks)

When assigning, warn (amber chip) if, on a meeting weekday at overlapping time, the student's class group has a `CalendarActivity` (clubs, sports, assembly) or a lesson. A lesson is impossible inside the standard band but possible if D7 times move. The teacher can proceed; the warning is stored on the assignment (`clash_note`) for leadership.

### 5.6 Session rules

- **Materialisation.** One session per `(schedule_id, session_date)` for every meeting date in the schedule window and term that is **not** a closure. It is created by:
  - the sweep, which keeps the next 14 days materialised;
  - `ensureSessions(scheduleId, from, to)` on any read or mark;
  - schedule create and edit.

  Sessions that no longer match the pattern after an edit and are still SCHEDULED are **cancelled** (`SCHEDULE_CHANGED`), not deleted, unless they never had attendance and are in the future, in which case they are deleted.
- **Status:**
  - `SCHEDULED`;
  - `HELD`, set when the register is first saved;
  - `CANCELLED`, with `cancel_reason` (`TEACHER_ABSENT`, `CLOSURE`, `SCHEDULE_CHANGED`, `SCHEDULE_ENDED`, `EVENT`, `OTHER`) and `cancelled_by`.
- **Unmarked** is derived, not stored: a SCHEDULED session whose end time has passed. It shows on teacher nudges and the leadership board, and is **excluded from student attendance rates** (it says nothing about the student) but **counted against teacher delivery**.
- **Substitute host.** `host_teacher_id` defaults to the schedule's teacher; leadership or the teacher can set another teacher for one date. The substitute gets register rights for that session only.
- **Expected roster** for a session = assignments whose `[effective_from, effective_to]` contains `session_date`. It is snapshotted into attendance rows (status `null` = not yet marked) when the register opens, so later roster changes don't rewrite history.

---

## 6. Data model: migration `102_office_hours.sql`

House style: a header comment explaining why, `CREATE TABLE IF NOT EXISTS`, InnoDB, utf8mb4, idempotent seed `INSERT … WHERE NOT EXISTS`, and MySQL 5.7 compatibility. Dev runs on MAMP 5.7. Drizzle mirrors go in `backend/src/db/officeHoursSchema.ts`.

### 6.1 `OfficeHourSchedule`

| Column | Type | Notes |
|---|---|---|
| schedule_id | BIGINT PK AI | |
| academic_year_id | BIGINT NOT NULL | FK AcademicYear |
| academic_term_id | BIGINT NOT NULL | FK AcademicTerm |
| teacher_id | BIGINT NOT NULL | FK User; owner |
| subject_id | BIGINT NULL | FK Subject |
| title | VARCHAR(150) NOT NULL | e.g. "Mathematics support" |
| purpose | VARCHAR(30) NOT NULL DEFAULT 'ACADEMIC_SUPPORT' | `ACADEMIC_SUPPORT`, `CATCH_UP`, `ASSESSMENT_PREP`, `RETAKE`, `ENRICHMENT`, `PROJECT`, `OTHER` |
| start_time / end_time | VARCHAR(5) NOT NULL | `HH:MM` |
| location | VARCHAR(100) NULL | |
| capacity | SMALLINT NOT NULL DEFAULT 15 | |
| effective_from / effective_to | DATE NOT NULL | inside the term |
| status | ENUM('DRAFT','ACTIVE','ENDED','CANCELLED') DEFAULT 'ACTIVE' | |
| notes | TEXT NULL | staff-only |
| created_by / updated_by | BIGINT | |
| ended_at | DATETIME NULL | UTC |
| version | INT NOT NULL DEFAULT 1 | optimistic concurrency |
| created_at / updated_at | TIMESTAMP | |

Indexes: `(academic_term_id, teacher_id, status)`, `(academic_term_id, subject_id)`.

### 6.2 `OfficeHourScheduleDay`

`(schedule_id, day_of_week)` PK; `day_of_week TINYINT` (1–5); FK cascade. Index `(day_of_week, schedule_id)`.

### 6.3 `OfficeHourAssignment`

| Column | Type | Notes |
|---|---|---|
| assignment_id | BIGINT PK AI | |
| schedule_id | BIGINT NOT NULL | FK |
| academic_term_id | BIGINT NOT NULL | denormalised for the lock and reports |
| student_id | BIGINT NOT NULL | FK User |
| status | ENUM('ACTIVE','ENDED') DEFAULT 'ACTIVE' | |
| effective_from / effective_to | DATE NOT NULL | |
| reason_code | VARCHAR(30) NULL | staff-only: `BELOW_STANDARD`, `MISSED_WORK`, `ASSESSMENT_RECOVERY`, `TEACHER_REFERRAL`, `CLASS_TEACHER_REFERRAL`, `STUDENT_REQUEST`, `ENRICHMENT`, `OTHER` |
| reason_note | VARCHAR(500) NULL | staff-only |
| clash_note | VARCHAR(255) NULL | §5.5 |
| end_reason_code / end_note | VARCHAR(30) / VARCHAR(500) NULL | §5.3 |
| assigned_by / ended_by | BIGINT | |
| assigned_at / ended_at | DATETIME | UTC |

Indexes: `(student_id, academic_term_id, status)`, `(schedule_id, status)`.

### 6.4 `OfficeHourStudentLock` (the no-overlap guarantee)

```sql
CREATE TABLE IF NOT EXISTS OfficeHourStudentLock (
  academic_term_id BIGINT NOT NULL,
  student_id       BIGINT NOT NULL,
  day_of_week      TINYINT NOT NULL,       -- 1..5
  assignment_id    BIGINT NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (academic_term_id, student_id, day_of_week),
  KEY idx_oh_lock_assignment (assignment_id),
  CONSTRAINT fk_oh_lock_assignment FOREIGN KEY (assignment_id)
    REFERENCES OfficeHourAssignment(assignment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- TERM mode inserts days 1–5; WEEKDAY mode inserts the meeting days.
- Locks are deleted when an assignment ends. A unit test asserts `ACTIVE assignments ⇔ lock rows`, and a nightly reconcile repairs drift and logs it.
- **Why a lock table, not a unique index on the assignment?** MySQL 5.7 has no partial indexes, and the rule depends on a *setting* and on *days*. A lock table expresses both modes with one PK, and stays race-free even with the 1-connection pool.

### 6.5 `OfficeHourSession`

| Column | Type | Notes |
|---|---|---|
| session_id | BIGINT PK AI | |
| schedule_id | BIGINT NOT NULL | FK |
| academic_term_id | BIGINT NOT NULL | |
| session_date | DATE NOT NULL | Kigali date |
| start_time / end_time | VARCHAR(5) | copied from the schedule at materialisation; per-date edits allowed |
| host_teacher_id | BIGINT NOT NULL | substitute support |
| location | VARCHAR(100) NULL | |
| status | ENUM('SCHEDULED','HELD','CANCELLED') DEFAULT 'SCHEDULED' | |
| cancel_reason / cancel_note / cancelled_by / cancelled_at | | |
| topic | VARCHAR(255) NULL | what was covered |
| register_first_saved_at / register_last_saved_at / register_saved_by | DATETIME / BIGINT | |
| version | INT DEFAULT 1 | |

`UNIQUE (schedule_id, session_date)`; indexes `(session_date, status)`, `(host_teacher_id, session_date)`, `(academic_term_id, session_date)`.

### 6.6 `OfficeHourAttendance` and `OfficeHourAttendanceHistory`

| Column | Type | Notes |
|---|---|---|
| session_id | BIGINT | PK part 1 |
| student_id | BIGINT | PK part 2 |
| assignment_id | BIGINT NULL | NULL only for a drop-in (walk-in) student |
| is_drop_in | TINYINT(1) NOT NULL DEFAULT 0 | §12.1 |
| status | ENUM('PRESENT','LATE','ABSENT','EXCUSED') NULL | NULL = expected, not yet marked |
| excuse_reason | VARCHAR(30) NULL | `SICK`, `SCHOOL_ACTIVITY`, `FAMILY`, `PERMISSION`, `OTHER` |
| arrived_at | VARCHAR(5) NULL | `HH:MM` for late |
| note | VARCHAR(255) NULL | |
| outcome | TINYINT NULL | optional engagement 1–3 (§12.4) |
| follow_up | TINYINT(1) DEFAULT 0 | flags the student for the teacher's next session |
| source | ENUM('TEACHER','QR','AUTO','IMPORT') DEFAULT 'TEACHER' | |
| marked_by / marked_at | BIGINT / DATETIME | |

Indexes: `(student_id, status)`, `(assignment_id)`.

History mirrors Tendo's `attendance_record_history`: session_id, student_id, previous_status, new_status, previous_note, new_note, changed_by, changed_at, source. It is written in the same transaction as the attendance change.

### 6.7 `OfficeHourEscalation` and `OfficeHourTransferRequest`

- **Escalation:**
  - columns: escalation_id, student_id, assignment_id, academic_term_id, `level` (1–3), `trigger` (`CONSECUTIVE_2`, `MONTH_2`, `CONSECUTIVE_3`, `RATE_BELOW`), `trigger_session_id`, notified_user_ids JSON, created_at, acknowledged_by, acknowledged_at, resolution_note;
  - `UNIQUE (assignment_id, level, trigger_session_id)` makes escalations idempotent.
- **Transfer request:** request_id, student_id, from_assignment_id, to_schedule_id, requested_by, message, status (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED`), decided_by, decided_at, decision_note, expires_at.

### 6.8 `OfficeHourSetting`

A single row with `id=1`, so every setting gets a typed column:

`student_lock_mode` ENUM('TERM','WEEKDAY') 'TERM' · `allow_any_student` 0 · `band_start` '16:20' · `band_end` '17:20' · `allowed_window_start` '16:00' · `allowed_window_end` '18:00' · `default_capacity` 15 · `max_capacity` 40 · `roster_cutoff_time` '14:00' · `late_after_minutes` 10 · `register_edit_days` 7 · `auto_close_unmarked` 0 · `escalation_consecutive_l1` 2 · `escalation_month_l1` 2 · `escalation_consecutive_l2` 3 · `rate_band_consistent` 90 · `rate_band_watch` 80 · `min_sessions_for_rate` 3 · `parent_notifications` ENUM('OFF','ESCALATIONS','WEEKLY') 'ESCALATIONS' · `qr_checkin_enabled` 0 · `updated_by`, `updated_at`.

`rate_band_watch` matches Tendo's `ATTENDANCE_WARN_THRESHOLD` (80) and `min_sessions_for_rate` matches `ATTENDANCE_MIN_SESSIONS` (3), so "consistent" means the same in both apps.

### 6.9 `SchoolClosure`

`closure_id`, `start_date`, `end_date`, `reason` VARCHAR(150), `scope` ENUM('ALL','OFFICE_HOURS') DEFAULT 'ALL', `created_by`, `created_at`. Index `(start_date, end_date)`.

- When a closure is created or extended, future SCHEDULED sessions in range are cancelled with `CLOSURE`, and a change notice is sent.
- Removing a closure re-materialises the sessions in range.
- `scope=ALL` is deliberately general, so the lesson reminders can later skip closures too (a one-line addition to `inTerm`). That change is out of scope here.

### 6.10 Permissions seed

Same pattern as `099_analytics_access.sql`: insert `Permission` rows (`app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `scopeable`), link `RolePermission` by `preset_key` or legacy role name, backfill grants, and bump `access_version`. The capabilities are listed in §15.

---

## 7. Backend: services, API and jobs

### 7.1 Services (`backend/src/services/officeHours/`)

| File | Responsibility |
|---|---|
| `settings.ts` | `getSettings()` (cached 60 s, busted on save), `saveSettings()` |
| `period.ts` | `resolvePeriod({period, anchor, from?, to?}) → {from, to, label, termId?, yearId?}` for `day`, `week` (Mon–Fri in Kigali), `month`, `term` (the AcademicTerm containing the anchor), `year` (AcademicYear) and `custom` |
| `filters.ts` | `officeHourSessionFilters()` (§4.2) and `expectedRosterSql(sessionAlias)` |
| `schedules.ts` | create, update and end; teacher overlap check under `GET_LOCK`; candidate subjects |
| `eligibility.ts` | `teachableStudentIds(teacherId, yearId)` (subject ⨝ class group ⨝ enrolment ∪ class teacher ∪ mentees); `isEligible` |
| `assignments.ts` | `assignStudents` (partial success; lock insert; `ER_DUP_ENTRY` → conflict lookup), `endAssignment`, `overrideAssignment`, `availability(studentIds, termId)` |
| `transfers.ts` | request, accept, decline, expire |
| `sessions.ts` | `ensureSessions(scheduleId, from, to)`, `cancelSession`, `setHost`, `rematerialise(scheduleId)`, closure application |
| `register.ts` | `openRegister(sessionId)` (snapshot of the expected roster), `saveRegister(sessionId, records, expectedVersion)` (history, edit window, version check), `autoCloseUnmarked` |
| `metrics.ts` | per-student rate, presence rate, streaks and band; per-teacher delivery; the one place the formulas live (§14.2) |
| `reports.ts` | the queries behind §14, scope-filtered |
| `escalation.ts` | evaluate after each register save and in the nightly sweep; idempotent writes; notify (§13.4) |
| `notify.ts` | office-hours notification builders on top of `notifyPersonGeneric` (§13.2) |
| `reminders.ts` | `loadOfficeHourOccurrences(userId, from, to)` for the Reminder Hub; `onOfficeHoursChanged` |
| `scheduler.ts` | the sweep loops (§7.4) |
| `reconcile.ts` | lock ⇔ assignment repair; placement-change auto-end |

### 7.2 Routes (`backend/src/routes/officeHours.ts`, mounted at `/office-hours` in `app.ts`)

All routes use `authenticate`. Guards are listed in §15. Responses use `successResponse`; conflicts use `ConflictError` with structured `errors`.

**Teacher (own schedules)**

| Method & path | Purpose |
|---|---|
| GET `/config` | settings subset (band, window, capacity limits, lock mode, cut-off) for the UI |
| GET `/my?term_id=` | my schedules + days + roster counts + next 5 sessions + pending transfer requests |
| POST `/schedules` | create `{title, purpose, subject_id?, days[], start_time?, end_time?, location?, capacity?, effective_from?, effective_to?, notes?, student_ids?}`; may assign in the same call (partial result) |
| GET `/schedules/:id` | detail: roster (with each student's attendance rate), sessions, change log |
| PATCH `/schedules/:id` | edit with `version`; re-materialises; sends change notices |
| POST `/schedules/:id/end` | `{reason?}` |
| DELETE `/schedules/:id` | only when it has no HELD sessions |
| GET `/candidates?schedule_id=&class_group_id=&subject_id=&q=&only_free=` | students with availability (`FREE`, `HELD_BY_YOU`, `HELD_BY_OTHER` with holder name and days), soft clashes, eligibility, and signals (§16.3) |
| POST `/schedules/:id/assignments` | `{student_ids[], reason_code, reason_note?, effective_from?}` → `{assigned, conflicts, ineligible, over_capacity}` |
| DELETE `/assignments/:id` | `{end_reason_code, end_note?}` |
| POST `/transfer-requests` | `{student_id, to_schedule_id, message?}` |
| POST `/transfer-requests/:id/accept` · `/decline` · `/cancel` | |
| GET `/sessions?from=&to=` | my hosted sessions (substitute sessions included) |
| GET `/sessions/:id` | session + roster + attendance (opens the snapshot) |
| PUT `/sessions/:id/register` | `{records:[{student_id, status, excuse_reason?, arrived_at?, note?, outcome?, follow_up?}], topic?, version}` |
| POST `/sessions/:id/cancel` | `{reason, note?}` |
| POST `/sessions/:id/host` | `{teacher_id}` |
| POST `/sessions/:id/checkin-token` | rotating QR token (P6) |

**Student / parent**

| Method & path | Purpose |
|---|---|
| GET `/me` | my current assignment(s), the next sessions, my attendance summary (term and year) and history; no reason codes |
| POST `/checkin` | `{token}` QR self check-in (P6) |
| GET `/children/:studentId` | parent view; checks the `Parenting` link |

**Leadership**

| Method & path | Purpose |
|---|---|
| GET `/admin/schedules?term_id=&teacher_id=&subject_id=&class_group_id=&status=` | |
| GET `/admin/coverage?term_id=&class_group_id=` | per student: assigned? to whom, which days, rate. Counts for students with no assignment, by class group |
| GET `/admin/unmarked?from=&to=` | |
| POST `/admin/assignments/override` | `{student_id, to_schedule_id, reason}` |
| GET/POST/DELETE `/closures` | |
| GET/PUT `/settings` | |
| GET `/admin/escalations?status=open` · POST `/escalations/:id/ack` | |

**Reports** (§14)

| Method & path | Purpose |
|---|---|
| GET `/reports/summary?period=&anchor=&from=&to=&group_by=&program_id=&grade_id=&class_group_id=&subject_id=&teacher_id=` | KPIs + grouped rows + time series |
| GET `/reports/students/:id?period=…` | student 360 |
| GET `/reports/teachers/:id?period=…` | teacher 360 |
| GET `/reports/consistency?period=…&band=` | consistent / watch / chronic lists |
| GET `/reports/export?…&format=csv\|xlsx` | server-side export for big ranges. P5 starts with client-side export and adds this only if needed |

### 7.3 Concurrency and validation details

- **Assign transaction:**
  1. Lock the schedule row (`SELECT … FOR UPDATE`).
  2. Recount capacity per meeting date.
  3. Insert the assignment.
  4. Insert the locks.
  5. On `ER_DUP_ENTRY`, roll back that student's savepoint and look up the holder.

  It runs per student inside one outer transaction using savepoints, so partial success is atomic per student.
- **Register save:** compare `version` and return 409 `REGISTER_CHANGED` with the current state, so the UI can merge. Edits after `register_edit_days` need `OFFICE_HOURS_MANAGE_ANY`. Every change writes history plus a platform-activity key event.
- **Time validation:** `HH:MM`, end > start, inside the allowed window. Dates must be inside the term. Days must be 1–5 and unique.
- **IDs from the client are never trusted** for ownership. The server resolves the teacher from `req.user` and the student from the assignment, the same as the mentorship check-ins.

### 7.4 Jobs (`services/officeHours/scheduler.ts`, started from `index.ts`, off in tests, flag `OFFICE_HOURS_SCHEDULER`)

| Loop | Cadence | Work |
|---|---|---|
| materialise | 40 s after boot, then every 6 h | `ensureSessions` for every ACTIVE schedule for today+14 days; apply closures |
| roster-day | 06:30 Kigali | teacher morning digest "Today 16:20: 12 students, Room B4" (bell; push for opted-in) |
| register-due | every 5 min | at start+5 min → "Take the register" to the host; at end+10 min still unmarked → nudge; next day 07:30 → "Yesterday's register is missing" (once) |
| escalation | after each register save + nightly 18:30 | §13.4 |
| auto-close (optional) | nightly | if `auto_close_unmarked=1`, mark NULLs ABSENT with `source=AUTO` after the edit window. Off by default: unmarked stays unmarked |
| weekly digests | Friday 17:30 | teacher: own sessions summary; leadership: school KPIs + chronic list; parent (if `WEEKLY`) |
| transfers | hourly | expire PENDING requests past `expires_at` |
| reconcile | nightly 02:00 | lock ⇔ assignment repair; auto-end on placement change; log drift counts |

Each loop has an in-process "running" guard, like the reminder scheduler. Jobs are idempotent and keyed (notifications by dedupe key, escalations by unique key), so a restart or double-run is harmless.

---

## 8. Timetable integration (the 16:20 band)

**Goal:** the office band stops being a dead grey stripe and shows each viewer what concerns them, in every grid: `CalendarGrid` (admin and class calendar) and `ReadOnlyCalendarGrid` inside `DashboardCalendarWidget` (Dashboard, TeacherWelcome).

1. **Band entries.** Extend `SCHEDULE_SLOTS` rows with `type: "office"` → `bandEntries: true`. `buildGridLayout` keeps skipping lesson lookup for non-teaching rows, but for rows with `bandEntries` it calls a new `findBandEntries(day)` and renders **per-day cells** inside the band instead of one `colSpan` label. With no entries for the viewer it renders the band exactly as today. Update `calendarLayout.test.ts` deliberately: the "never looks up 16:20" assertion becomes "lessons are never placed in the office band; band entries are".
2. **What each viewer sees:**
   - **Teacher (own timetable):** their sessions — "Maths support · 12 students · B4", with a status dot (green marked / amber due / grey future / struck-through cancelled). Click → the session sheet (register, cancel, substitute).
   - **Teacher, empty weekday:** a subtle "+ Office hours" affordance → the schedule drawer with that day preselected.
   - **Student:** "Office hours · Ms A · Mathematics · B4" on their days. Click → details and attendance history.
   - **Admin class-group grid:** a per-day count, "7 students in office hours", with a popover listing teachers. No student names on shared screens.
3. **Data:** `GET /calendar/my-calendar` and `/calendar/student-calendar` gain an `office_hours` array, computed through `officeHourSessionFilters()` for the visible week (each item: `session_id`, `schedule_id`, `date`, `day_of_week`, times, title, subject colour, location, status, counts). The DashboardCalendarWidget and TeacherDashboard `DayRail` read it. One query, no N+1.
4. **Time source:** the band's start and end come from `/office-hours/config` (G6). `calendarConstants.ts` keeps the literal as an offline fallback.
5. **Remove the duplicate path:** delete `"Office Hours"` from `ACTIVITY_TYPES` in `CalendarSlotModal.tsx`, with a hint: "Office hours are scheduled from the Office Hours page". Existing activities found by the §2.3 SQL are migrated or archived by hand.
6. **Exports:** `utils/timetablePdfExport.ts` prints the band with the viewer's entries.

---

## 9. Teacher experience

**Navigation:** a sidebar item **"Office Hours"** (icon `Clock4` / `LifeBuoy`), gated by `OFFICE_HOURS_MANAGE_OWN`. Route `/office-hours` with tabs **Today · Schedules · Students · Reports**. Also findable via NavSearch.

### 9.1 Today

- **Session cards** for today's sessions: time, room, expected count, status. The primary action is **"Take register"**, which turns into "Edit register" after saving.
- A strip of **follow-ups** flagged last time ("3 students flagged for follow-up").
- **Pending transfer requests** with Accept / Decline.
- **Unmarked past registers** (red), each one tap away.

### 9.2 Create or edit a schedule (right-hand drawer, the same pattern as Tendo's `RegisterDrawer`)

1. **When:** a weekday multi-select (Mon–Fri chips); the time (pre-filled with the band; editable inside the window, D7); the date window (default "next meeting → end of term", with term boundary hints).
2. **What:** a title (pre-filled "<Subject> support"), a subject (from my assignments), the purpose, a room, the capacity (slider, max from settings) and private notes.
3. **Who:** the student picker (§9.3). It can be skipped and filled later.
4. **Review:** a summary — "Mon & Wed, 16:20–17:20, 6 Oct → 12 Dec · 18 sessions · 12 students · 2 conflicts" — then **Publish**. Students are notified only on publish. DRAFT saves silently.

### 9.3 Student picker (the heart of the "no overlap" UX)

- **Source tabs:** *My classes* (class group chips) · *My subjects* · *My mentees* · *Search* (name or registration number) · *Suggested* (P6, §16.3).
- **Each student row shows:**
  - name, class group and photo (if any);
  - an **availability chip:** `Free` (green), `With you` (blue), `With Mr K · Tue/Thu` (grey, disabled, with a "Request transfer" action), `Not your student` (amber, if `allow_any_student`);
  - a soft clash icon with a tooltip (§5.5);
  - the student's current office-hours rate, if they had any earlier this year.
- **Controls:** select all free, a filter for "only free", and a capacity meter ("12 / 15").
- **Saving:**
  - the server re-validates everything;
  - students taken in the meantime come back as conflicts and are **shown inline**, not as an error page;
  - a toast summarises: "10 assigned · 2 already have office hours".
- **Reason code:** one per batch, optional per student. Shown as "Why these students? (staff only)".

### 9.4 Schedule detail

- **Roster** with per-student attendance rate, streak and band, sortable. Row actions: remove (with reason), flag, view history.
- **Sessions timeline:** past sessions show held/cancelled and counts; future sessions offer cancel or substitute.
- **Change log:** assignments, removals, overrides, edits.

### 9.5 Students tab

Every student I currently hold, across schedules, with attendance bands. Filters: chronic, consecutive misses, follow-up. Bulk message: "Reminder: office hours are mandatory" (bell).

### 9.6 Teacher dashboard

- `/teacher-dashboard` **AttentionPanel** gets items for register due/missing, students reaching L1 escalation and pending transfer requests.
- The `DayRail` shows today's office-hours session.
- `TeacherWelcome` shows it through the calendar band.

---

## 10. Student and parent experience

### 10.1 Student

- **Calendar:** the band shows their office hours (§8). This is the main surface.
- **"My office hours"** card on `/home` and in a dedicated page `/my-office-hours`:
  - the current assignment(s): teacher, subject, days, room and window;
  - the next session countdown ("Today 16:20 · Room B4");
  - **my attendance:** term rate, a streak badge ("4 in a row"), and session history with statuses and the teacher's notes where the teacher marked them shareable;
  - a short line: "Office hours are mandatory. If you cannot attend, tell Ms A beforehand."
- **"I can't attend" (P6):** the student sends a pre-session notice with a reason (sick bay, school team, permission). The teacher sees it on the register as a suggested EXCUSED; the teacher still decides.
- **Check-in (P6):** scan the room QR → "Checked in at 16:22" (marked LATE if after `late_after_minutes`).
- Students **cannot** change or leave assignments and never see reason codes or other students.

### 10.2 Parent

- A read-only card per child on the parent's Home: assignment, days and this term's rate.
- **Notifications (D4):** escalation level 2+ (§13.4); the weekly summary only if enabled.
- Email always carries the school name, the student's first name and the class teacher's contact, per the research on effective parent messages.

---

## 11. Leadership experience

Route `/office-hours/admin`, gated by `OFFICE_HOURS_VIEW` at school/programme scope; settings need `OFFICE_HOURS_CONFIGURE`.

| Tab | Content |
|---|---|
| **Overview** | today: sessions running, students expected, registers marked/unmarked (live, 60 s refresh); this week's KPIs; a 4-week trend sparkline; open escalations |
| **Coverage** | heatmap of class group × weekday showing students in office hours; a list of students with **no** assignment, filterable by class or grade (to target support); teachers' load (schedules, students, capacity use) |
| **Schedules** | every schedule, with filters; open, override, end, set substitute |
| **Unmarked** | registers past end time with no mark, grouped by teacher; "Nudge" (bell + push) |
| **Escalations** | open L2/L3 cases with history, acknowledge, add a resolution note, refer to discipline (D5) |
| **Reports** | §14 |
| **Closures** | calendar of `SchoolClosure` ranges; add a holiday or exam week → shows the sessions affected before confirming |
| **Settings** | §6.8, with an explanation next to each field; changing `student_lock_mode` explains that existing assignments keep their locks |

Leadership Home (`/home`) gets a tile, "Office hours this week: 92% held · 81% attendance · 6 chronic", plus an attention item for unmarked registers older than 1 day.

---

## 12. Attendance register

### 12.1 UI (`RegisterSheet`, opens as a drawer or full screen on mobile)

- **Header:** title, date, time, room and expected count. A **"Mark all present"** button for the common case.
- **Rows:** expected students (snapshot), alphabetical, with status chips **Present · Late · Absent · Excused** (the same colours as Tendo's `StatusChip` / `--status-*` tokens).
  - Keyboard: ↑/↓ moves between rows, **1–4** sets status, **⌘↵** saves (Tendo parity).
  - Tapping Late asks for the arrival time (defaults to now).
  - Excused asks for a reason.
  - A row note is optional. "Outcome" and "Follow-up" are folded under "More".
- **Walk-ins:** "+ Add a student who came" records attendance for a non-assigned student as `PRESENT` with `assignment_id = NULL` and `is_drop_in = 1`. It is shown in reports as "drop-in" and never creates a lock.
- **Topic** field ("What did you cover?"), optional.
- **Overwrite guard:** "Last saved by Mr K at 16:41" plus a `version` conflict merge. Unsaved-changes guard via `ConfirmDialog`.
- **After saving:** "Next: tomorrow's session" or back to Today.

### 12.2 Rules

- Marking is allowed from `start − 15 min` until `register_edit_days` after the session. Earlier is blocked, so the register can't be filled in ahead of time. Later needs `MANAGE_ANY`.
- The first save sets the session to `HELD`. Cancelling a HELD session is not allowed. Correct the register instead, or leadership can void it with a reason.
- Rows still `NULL` after a save stay "not marked". The UI warns: "3 students not marked — mark them absent?"
- Statuses follow `attendancePolicy` semantics (D3): attended = PRESENT + LATE + EXCUSED.

### 12.3 Offline (P6)

The register works offline in the installed PWA:
- the roster is cached when Today loads;
- saves are queued in IndexedDB (the key is the session_id and `version`) and replayed by the service worker's background sync, or on the next app focus;
- a conflict on replay opens the merge view.

### 12.4 Session notes and outcomes (MTSS "dosage and fidelity")

- `topic` per session.
- Per student: an optional `outcome` (1 = needs more support, 2 = progressing, 3 = goal met) and a `follow_up` flag.
- "Goal met" twice in a row suggests ending the assignment (`GOAL_MET`), which frees the student's lock for other teachers.

---

## 13. Notifications and reminders

### 13.1 Matrix

| Event | Student | Teacher (host) | Class teacher | Parent | Leadership | Channel |
|---|---|---|---|---|---|---|
| Assigned (on publish / add) | ✅ "You have office hours with Ms A on Mon & Wed, 16:20, Room B4, from 6 Oct" | — | ✅ digest line | — | — | bell + push |
| Removed / assignment ended | ✅ | — | — | — | — | bell + push |
| Schedule changed (days, time, room) | ✅ | — | — | — | — | bell + push + Hub change notice |
| Session cancelled | ✅ | substitute ✅ | — | — | — | bell + push (same day: always push) + Hub change notice |
| Substitute host set | ✅ | new host ✅ | — | — | — | bell + push |
| Reminder before session | ✅ (day before 18:00 + 15 min before) | ✅ (15 min before + morning digest) | — | — | — | Reminder Hub (opted-in users: push, Telegram, Google Calendar, webcal) |
| Register due / missing | — | ✅ start+5, end+10, next morning | — | — | missing > 1 day → Unmarked tab | bell (+ push for the next-morning nudge) |
| Marked absent | ✅ "You missed office hours today with Ms A" | — | — | — | — | bell |
| Escalation L1 (2 consecutive or 2 in 30 days) | ✅ | ✅ | ✅ | — | — | bell + push |
| Escalation L2 (3 consecutive or rate < watch band after ≥3 sessions) | ✅ | ✅ | ✅ | ✅ email (D4) | programme lead ✅ | bell + push + email |
| Transfer requested / decided | — | holder / requester ✅ | — | — | — | bell + push |
| Override by leadership | ✅ | both teachers ✅ | — | — | — | bell + push |
| Weekly digest (Fri 17:30) | — | ✅ | ✅ (own class) | if `WEEKLY` | ✅ | bell (+ email for leadership and parent) |

**Quiet hours** (21:00–06:00, from `ReminderPreference`) hold everything except same-day cancellations. Push follows the Hub's daily cap; mandatory notices are marked `critical` only for same-day cancellations and L2 escalations.

### 13.2 Delivery helper

- Generalise `services/activity/notify.ts` `notifyPerson()` into `services/notifications/notifyPerson.ts`, which takes any `NotificationKind` and writes the bell row (upsert) plus Web Push to every `PushSubscription` of the user. The activity module keeps calling it.
- Office hours call it through `services/officeHours/notify.ts` builders, so the wording lives in one file.
- Email goes through `sendEmail(…, false)` (never throw), with inline HTML in the style of `channels.ts escalationEmail`.

New `NotificationKind` values (`utils/notifications.ts`):

```
office_hours_assigned | office_hours_removed | office_hours_changed | office_hours_cancelled |
office_hours_register_due | office_hours_absent | office_hours_escalation |
office_hours_transfer | office_hours_digest
```

`subjectType` values: `office_hour_assignment`, `office_hour_session`, `office_hour_schedule`, `office_hour_escalation`, `office_hour_transfer`, `office_hour_digest`.

**Dedupe:** the unique key is `(user, kind, subject_type, subject_id)`, so a key must identify *one* event. Absence uses `session_id`, and a correction (absent → present) deletes the absent notice. Register-due uses `session_id`, upserted from "due" to "missing". Digests use a `YYYYWW` integer as `subject_id`.

Frontend: add icons in `NotificationBell.kindIcon`, and links to `/office-hours/...` or `/my-office-hours`.

### 13.3 Reminder Hub integration (scheduled "before it starts" reminders)

Office hours are recurring and live in MIS, so use the **occurrence** path, not the Source API (which is for external apps and has no recurrence):

1. Add `office_hours` to `REMINDER_KINDS` (`preferences.ts`), with a `DEFAULT_SETTINGS` offset of `[15]` for students and teachers, plus an optional day-before evening offset.
2. Add it to `SOURCE_KINDS` (`sources.ts:22`), `LABELS` (`dispatcher.ts:43`) and `NOTICE_LABEL` (`sources.ts:137`), and on the frontend to `PreferencesPanel.tsx`, `agendaUtils.ts` and `api/reminders.ts`.
3. In `collectOccurrences` (`occurrences.ts`), call `loadOfficeHourOccurrences(userId, from, to)`. It returns sessions the user hosts or is expected at (via `officeHourSessionFilters()` + the roster), with the key `office_hours:{session_id}`. These then reach push, Telegram, the Google Calendar mirror and the webcal feed automatically.
4. In `timetableChanges.ts`, add `onOfficeHoursChanged({sessionIds | scheduleId, kind: 'moved' | 'cancelled'})`, called through `afterResponse()` from the schedule, session and closure mutations. It mirrors `onActivityChanged`: change notices for those already reminded, `releaseDeliveredJobs`, then `expandUsersSoon(affectedUserIds)`.
5. Trap: Hub jobs exist only for users with `enabled=1`, which is why §13.1's mandatory rows also use the bell and push directly. The Hub's "Now & Next" agenda will also list office hours for everyone who opens `/reminders`.

### 13.4 Escalation ladder (`escalation.ts`)

Evaluated per **active assignment** after every register save and nightly:
- **L1:** `consecutive_absent ≥ escalation_consecutive_l1` (2) **or** `absences_in_last_30_days ≥ escalation_month_l1` (2) → notify the student, host and class teacher.
- **L2:** `consecutive_absent ≥ escalation_consecutive_l2` (3) **or** (`held_sessions ≥ min_sessions_for_rate` **and** `rate < rate_band_watch`) → notify as L1 plus the parent (per D4) and the programme lead. It appears on the leadership Escalations tab.
- **Rules:**
  - Only `ABSENT` counts; `EXCUSED` and `LATE` do not break a streak, but `LATE` counts on lateness reports.
  - Cancelled and unmarked sessions are ignored.
  - Idempotent via `UNIQUE (assignment_id, level, trigger_session_id)`.
  - A level re-arms only after the student attends 2 consecutive sessions.
- The class teacher comes from `UserGrade` (class group + year) and the programme lead from `UserProgramLead`.

---

## 14. Reports (daily, weekly, monthly, termly, annual)

### 14.1 Period engine (`period.ts`)

| Period | Range (Kigali) | Anchor UI |
|---|---|---|
| Day | the date | date picker, ← → |
| Week | Mon–Fri containing the anchor | week picker ("Week 41 · 6–10 Oct") |
| Month | calendar month | month picker |
| Term | `AcademicTerm.start_date → end_date` containing the anchor (or chosen) | term select (`AcademicPeriodSelector`) |
| Year | `AcademicYear.start_date → end_date` | year select |
| Custom | from → to (max 400 days) | range picker |

Every report also accepts a **comparison** (previous period of the same type) to show deltas.

### 14.2 Metric definitions (one implementation in `metrics.ts`, shown in the UI under "ⓘ How is this calculated?")

| Metric | Definition |
|---|---|
| Sessions planned | live sessions dated in range (cancelled excluded; closures never materialise) |
| Sessions held | sessions with a saved register |
| Delivery rate (teacher) | held ÷ (planned whose end has passed) |
| Unmarked | planned, past end, no register |
| Cancelled | count by reason (shown separately; excluded from delivery-rate denominator only when reason ∈ {CLOSURE, EVENT}) |
| Expected attendances | marked attendance rows (status not NULL) on held sessions, excluding drop-ins |
| **Attendance rate** (D3) | (PRESENT + LATE + EXCUSED) ÷ expected attendances |
| Presence rate | (PRESENT + LATE) ÷ expected attendances |
| Punctuality | PRESENT ÷ (PRESENT + LATE) |
| Consecutive misses (current) / longest attended streak | per assignment, over held sessions in date order |
| **Consistency band** | requires ≥ `min_sessions_for_rate` held sessions: **Consistent** ≥ 90% · **Watch** 80–89% · **Chronic** < 80% · otherwise "Too few sessions" |
| Capacity utilisation | Σ active assignments ÷ Σ capacity, over schedule-days in range |
| Coverage | students with ≥1 active assignment ÷ active students in scope |
| Drop-ins | attendance rows with `is_drop_in=1` |

### 14.3 Report views (`/office-hours/reports`, the same page for teachers and leadership, scope-filtered)

1. **Summary:** KPI tiles (planned, held, delivery, attendance rate, presence rate, chronic count, unmarked, coverage) with deltas vs the previous period. A time-series chart (recharts) of attendance rate and sessions held, by day for week and month and by week for term and year.
2. **Breakdown table**, with `group_by` = teacher · subject · class group · grade · programme · weekday · purpose. Columns: the KPIs plus a band distribution bar.
3. **Consistency:** three lists (Consistent / Watch / Chronic) with the student, class, host teacher, rate, current streak and last attended. This is "who is consistently coming and who is not".
4. **Student 360** (`/office-hours/reports/students/:id`): a calendar heatmap of every session (colour by status), assignments over time, escalations, notes and outcomes; a term-by-term table; optionally (P6) TM grade trend next to attendance, labelled correlational.
5. **Teacher 360:** schedules, sessions planned/held/cancelled/unmarked, average roster, attendance rate of their students, registers marked on time %.
6. **Daily register sheet:** for a date, every session with its roster and marks. Printable, for the duty teacher.

### 14.4 Exports

- **CSV / XLSX:** client-side via `xlsx`, the same as the reporting module. Every table has an Export button; the sheet name and file name carry the period label.
- **PDF:** `jspdf` + `jspdf-autotable`, with the school header, period, scope and generated-by line. Covers the student report (for parent meetings), teacher report and termly summary.
- **Server export endpoint** (`/reports/export`): only if a year-wide school export proves too slow client-side (§14.5).

### 14.5 Performance

- Volume estimate: ~600 students × up to 3 sessions/week × ~38 weeks ≈ **70k attendance rows a year**. On-the-fly SQL with the §6 indexes is enough; no rollup tables are needed.
- Reports use a short (60 s) in-memory cache keyed by `(scope hash, query)`, busted on register save. That fits the single pm2 process.
- Revisit if the yearly row count passes 500k.

---

## 15. Access control

### 15.1 Capabilities (`backend/src/access/manifest.ts`)

None of these names may contain spoke-app role keywords; `accessPhase1Model.test.ts` enforces that. They are **not** v2-only, because students and teachers still rely on legacy permissions in `req.user.permissions`.

| Capability | Kind / depths | Domain | Scopeable | Presets |
|---|---|---|---|---|
| `OFFICE_HOURS_MANAGE_OWN` | W | ACADEMIC | no (own) | subject teacher, class teacher, teaching staff, mentor |
| `OFFICE_HOURS_MANAGE_ANY` | W | ACADEMIC | yes (SCHOOL / PROGRAM) | head teacher, deputies (academics, discipline), programme lead (PROGRAM), school administrator, platform owner |
| `OFFICE_HOURS_VIEW` | R `summary`, `detail` | ATTENDANCE | yes | class teacher (CLASS_GROUP, detail), programme lead (PROGRAM, detail), grade lead (GRADE), head teacher and deputies (SCHOOL, detail), school administrator (SCHOOL, summary) |
| `OFFICE_HOURS_VIEW_SELF` | R `detail` | ATTENDANCE | SELF / CHILDREN | `student` (SELF), `parent` (CHILDREN). Also add the legacy permission row to the STUDENT and PARENT roles |
| `OFFICE_HOURS_CONFIGURE` | W | SYSTEM | no | head teacher, school administrator, platform owner |

### 15.2 Route guards

| Routes | Guard |
|---|---|
| teacher routes | `authorize(OFFICE_HOURS_MANAGE_OWN or MANAGE_ANY)` plus an ownership check in the service: `schedule.teacher_id === req.user.id`, the session host, or `MANAGE_ANY` in scope |
| admin routes | `authorizeIn("OFFICE_HOURS_MANAGE_ANY", targetOf, {legacy})`; list endpoints filter with `req.access.scopeFor(...)` |
| reports | `authorizeIn("OFFICE_HOURS_VIEW", …)` with row filtering by scope. A teacher without VIEW sees only their own schedules' data, via the ownership filter |
| student and parent routes | `authorize(OFFICE_HOURS_VIEW_SELF)`; the server resolves the self or `Parenting` link |
| settings and closures | `requireCapability("OFFICE_HOURS_CONFIGURE", SCHOOL)` |

### 15.3 Depth

`summary` depth (school administrator) sees counts and rates but no names, notes or reason codes. This matches the plan-wide rule that admins get aggregates, not raw student data.

### 15.4 Frontend

- Sidebar items: `requiredCapability` (v2 `useAccess().can`), falling back to `requiredPermission`.
- Every page gates itself (house rule).
- The ux-audit scripts in `backend/scripts/access-ux/` are rerun after the UI lands.

---

## 16. Modernization features

Phase 6 unless noted. Each one sits behind a setting.

1. **Rotating-QR self check-in.**
   - The host opens "Show check-in code". It shows a QR code (and a 6-digit code for students without cameras) that rotates every 30 s.
   - The token is HMAC-signed over (session_id, minute window) and accepted for 2 windows.
   - The student scans in the PWA → `POST /office-hours/checkin` → marked PRESENT or LATE with `source=QR`.
   - Only assigned students, or a drop-in, are accepted, and only during the session ± 15 min.
   - The teacher sees check-ins appear live (§16.4) and can override.
   - Anti-sharing: one check-in per student, device-bound to the session cookie; the teacher's register remains authoritative.
2. **Offline register:** §12.3.
3. **Smart suggestions ("Suggested" tab in the picker).** Transparent, explainable signals only, each shown as a chip with its source:
   - Task Mentor: below the pass mark on the last 2 graded tasks in my subject; missed submissions. Reads TM's existing standing/overview APIs with a service token; a TM endpoint is added if missing.
   - MIS: a lesson report noting the student; a mentor referral.
   - Tendo: low subject attendance (via the existing integration auth).

   No composite "risk score" and no demographic inputs (§18). The teacher always chooses.
4. **Live register view:** a session SSE topic (pattern from `livePresence.ts`, single-use tickets) so QR check-ins and co-teacher marks appear instantly. In-memory and single-process, like the existing streams.
5. **Transfer requests:** §5.4. In P3 the conflict chip shows the holder; P6 adds the request workflow.
6. **Term rollover:**
   - At term end, teachers get "Continue Maths support next term?". One click copies the schedule (days, times, room, capacity) to the next term.
   - It **re-validates every student** against the new term's locks and eligibility and shows the partial result, the same as bulk assign.
7. **Student "can't attend" notice:** §10.1.
8. **Recurring exceptions:** "Skip 13 Nov (I'm invigilating)" from the schedule timeline creates a one-off cancellation with notification. "Move 13 Nov to Thu" moves a single session (it may hit lock conflicts for that date, which are reported).
9. **Calendar subscriptions:** office hours already flow into Google Calendar and webcal via the Hub (§13.3).
10. **Waitlist (deferred):** only if capacity becomes a real constraint. It needs a priority model; keep it out of v1.
11. **Discipline referral** (D5): from an L2 escalation → "Refer to discipline" opens Tendo's discipline form pre-filled through a deep link (student, date range, "missed mandatory office hours ×3"). No automatic records.

---

## 17. Integrations

### 17.1 Tendo (Discipline & Attendance)

- **Read-only display in the Attendance Calendar:** add `GET /office-hours/sessions?from&to` (teacher) and `/office-hours/me` (student) to `services/misClient.ts`, and render a third session kind `office_hours` in Week and Day views with a distinct band style. Clicking deep-links to the MIS register: `https://mis…/office-hours/sessions/:id`. **Do not** duplicate the register in Tendo; MIS is the system of record.
- **Home summary:** MIS Home builds its office-hours tiles natively (§17.3), so Tendo's `homeSummary.service.ts` needs no change.
- **Excuse reuse (optional):** a Tendo-approved excuse covering the date suggests EXCUSED on the MIS register. MIS fetches it with the user's token through Tendo `/api/integration/*` (`misBearerAuth`).

### 17.2 Task Mentor

Read-only signals for §16.3. If TM lacks a per-student "recent below-pass in subject" endpoint, add `GET /api/integration/students/:id/subject-standing?subject_id` in TM, authenticated with MIS service credentials.

### 17.3 MIS Home and dashboards

`services/home/providers.ts` gets an `officeHours` provider:
- student: next session and rate;
- teacher: today's session and the register-due state;
- class teacher: their class's chronic count;
- leadership: the weekly KPIs tile and unmarked > 1 day.

### 17.4 Platform analytics

Register the features in the activity feature catalog: `office_hours.schedule.create`, `.assign`, `.register.save`, `.checkin`, `.report.view`, `.export`. Add server-side key events on assign and register save, so adoption can be measured.

---

## 18. Privacy, fairness and data protection

- **Purpose limitation:** data is used to run and improve academic support and attendance follow-up. It is not used for ranking students against each other in public.
- **Minimisation:**
  - reason codes and notes are staff-only, and hidden at `summary` depth;
  - students never see other students;
  - the admin grid shows counts, not names;
  - QR tokens carry no personal data.
- **Neutral language:** "Office hours", never "intervention" or "at-risk", on student and parent surfaces. Bands use "Consistent / Watch / Chronic" for staff only. Students see their own rate and streak, framed positively.
- **No opaque scoring:** suggestions show their evidence, and no demographic fields are used.
- **Parents** (Law 058/2021, children's data): parent notifications are part of the child's welfare purpose. Keep them to escalations by default (D4), and record them in `OfficeHourEscalation.notified_user_ids`.
- **Retention (D9):**
  - attendance, history and notes are kept for the current academic year + 1;
  - a yearly job then aggregates them into per-student per-term totals and purges row-level notes and history;
  - escalations follow the school's discipline-record retention.
- **Open legal items** (shared with `USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md` §13): NCSA registration as controller, Art. 50 storage location of the EC2 host, and parental consent text. No new item is introduced, but this module is listed in the processing register.
- **Audit:** every override, removal, register edit after save, settings change and closure is written to the access audit trail with the actor.

---

## 19. Phased delivery and task checklist

| Phase | Scope | Exit criteria | Estimate |
|---|---|---|---|
| **0. Decisions & groundwork** | Owner confirms D1–D10; worktree `feat/office-hours` from `origin/main`; migration `102_office_hours.sql` (all tables incl. closures, settings, permissions seed); `officeHoursSchema.ts`; capabilities + presets + legacy permission rows; prod SQL check (§2.3) handed to the owner | 102 applies on a fresh test DB and **re-runs cleanly**; `accessPresets` / `accessPhase1Model` tests green; settings row exists | 2–3 days |
| **1. Core backend** | settings, period, filters, eligibility, schedules (teacher overlap under GET_LOCK), assignments (lock table, partial success, override), sessions (materialise, cancel, substitute, closures), `/office-hours` teacher + admin routes, `/config`, nightly reconcile, scheduler skeleton (materialise loop) | **Race test:** 2 teachers × same student in parallel → exactly 1 assignment, 1 structured conflict; TERM vs WEEKDAY modes; capacity; window/term validation; closure cancels sessions; placement change auto-ends | 1 week |
| **2. Teacher & student UI + timetable** | `/office-hours` (Today, Schedules, Students), schedule drawer, student picker with availability chips, schedule detail; band entries in CalendarGrid / ReadOnlyCalendarGrid / DashboardCalendarWidget; `office_hours` array on my-calendar & student-calendar; `/my-office-hours` + Home card; remove "Office Hours" activity type; timetable PDF band | Teacher creates Mon+Wed schedule from the band, assigns 10 (2 conflicts shown inline), student sees it on calendar & Home; layout test updated deliberately; axe 0 findings light/dark × 3 viewports | 1.5 weeks |
| **3. Register & attendance** | RegisterSheet (keyboard, mark-all, late/excused, walk-ins, topic, outcome/follow-up), snapshot roster, save with version + history, edit window, unmarked derivation, cancel/substitute UI, leadership Unmarked + Closures + Schedules tabs, override UI | Register for 15 students saved in < 10 s on mobile; version conflict merges; edit after window needs MANAGE_ANY; history rows match changes; cancelled/unmarked excluded from student rate | 1 week |
| **4. Notifications & reminders** | `notifyPerson` generalised; 9 notification kinds + icons; office-hours builders; Hub `office_hours` kind in all 7 places; `loadOfficeHourOccurrences`; `onOfficeHoursChanged` change notices; scheduler loops (morning digest, register-due, escalation, weekly digest, transfer expiry); escalation ladder + leadership Escalations tab; parent email (D4) | Assignment notice reaches a student with reminders **off** (bell + push); opted-in student gets 15-min reminder; cancelling today's session sends change notice; 2 consecutive absences → L1 to class teacher once only; Kigali-time tests | 1 week |
| **5. Reports** | period engine; metrics; Summary / Breakdown / Consistency / Student 360 / Teacher 360 / Daily sheet; compare-to-previous; CSV/XLSX/PDF; Home providers (all personas); leadership Overview + Coverage | Fixture reconciliation: term report = Σ session rows for 3 sample students; week boundaries Mon–Fri Kigali; scope tests (class teacher sees only own class, summary depth sees no names) | 1.5 weeks |
| **6. Modernization & integrations** | QR check-in + live SSE; offline register queue; smart suggestions (TM/Tendo/MIS signals); transfer-request workflow; term rollover; recurring exceptions; student "can't attend"; Tendo calendar display + deep links; discipline referral link; analytics feature catalog | QR check-in marks PRESENT/LATE correctly and rejects replayed/expired tokens; offline save replays after reconnect; rollover reports partial result | 1.5 weeks |
| **7. Hardening & rollout** | e2e (puppeteer) teacher→student→register→report; ux-audit; load sanity (70k rows/yr fixture); `docs/OFFICE_HOURS.md` operator + teacher guide; feature flag `OFFICE_HOURS_ENABLED`; pilot with one grade for 2 weeks; prod migration via `migrate.yml` (owner approves); full launch | Pilot feedback addressed; 0 unmarked > 2 days in the pilot week 2; owner signs off | 1 week + 2-week pilot |

**Total ≈ 8.5 weeks** of build for one developer, plus the pilot. Phases 4 and 5 can run in parallel with a second developer once Phase 3's register API is frozen.

**Checklist** (tick here as work lands):
- [ ] P0: decisions D1–D10 recorded; worktree; migration 100; schema; capabilities/presets/legacy rows; prod SQL check sent
- [ ] P1: settings/period/filters/eligibility; schedules; assignments + locks + override; sessions + closures; routes; reconcile; materialise loop; tests incl. race
- [ ] P2: Office Hours hub; drawer; picker; detail; band entries ×3 grids; calendar API `office_hours`; My office hours + Home card; activity-type removal; PDF band; axe
- [ ] P3: RegisterSheet; snapshot + save + history + edit window; unmarked; cancel/substitute; admin Unmarked/Closures/Schedules/override
- [ ] P4: notifyPerson; kinds + icons; builders; Hub kind ×7 + occurrences + change notices; scheduler loops; escalation + tab; parent email
- [ ] P5: period/metrics; 6 report views; compare; exports; Home providers; Overview + Coverage
- [ ] P6: QR + SSE; offline; suggestions; transfers; rollover; exceptions; can't-attend; Tendo display; referral; analytics catalog
- [ ] P7: e2e; ux-audit; load fixture; docs; flag; pilot; prod migration; launch

---

## 20. Testing

| Layer | Tests (vitest + supertest against the test DB; use `TEST_DB_NAME=nga_central_mis_test_office_hours` and re-clone with `npx ts-node scripts/reset-test-db.ts`, because test-DB growth breaks unrelated suites) |
|---|---|
| Locks | parallel assign race (`Promise.all`) → 1 success, 1 conflict naming the holder; TERM mode blocks every weekday; WEEKDAY mode allows a different day and blocks the same day; ending frees the lock; override is atomic; reconcile repairs a deleted lock |
| Schedules | teacher overlap (same day + overlapping window + time) → 409; non-overlapping windows allowed; times outside the window → 400; subject not assigned → 403 unless MANAGE_ANY; end cancels future sessions and keeps held ones |
| Sessions | materialisation respects term, window, days and closures; an edit cancels unmatched future sessions; a closure cancels and un-closing re-materialises; a substitute can mark only that session |
| Register | snapshot roster excludes students assigned after the date; version conflict 409; edit window; history rows; walk-in has no lock; HELD cannot be cancelled |
| Metrics | rate/presence/punctuality on fixtures; cancelled and unmarked excluded; streaks across cancelled sessions; bands need ≥3 sessions; **Kigali-midnight and Mon–Fri week boundaries** |
| Reports & scope | class teacher limited to own class group; programme lead to programme; summary depth hides names/notes; student `/me` hides reason codes; parent only linked children |
| Notifications | each event writes the right kind and dedupe key; absence → present correction removes the notice; mandatory notices sent with Hub reminders **off**; escalation idempotency and re-arm |
| Reminder Hub | `collectOccurrences` returns office-hours occurrences for host and student; change notice on cancel within 48 h; `REMINDER_KINDS` test updated |
| Access | new caps present in manifest/presets; no role keywords; legacy permission output includes OFFICE_HOURS_* for teachers and students and not v2-only ones; `accessPresets.test.ts` restores any preset it edits |
| Frontend | `calendarLayout.test.ts` (band entries; lessons never in band); picker availability chips & inline conflicts; RegisterSheet keyboard 1–4, ⌘↵, unsaved guard; period picker labels |
| E2E (puppeteer, real UA, `userDataDir` profile for push — see Reminder Hub traps) | teacher creates & assigns → student sees on calendar & gets bell → teacher marks → report shows the mark; second teacher sees the conflict |
| UX | `backend/scripts/access-ux/{ux-audit,ui-flows}.cjs` extended with office-hours flows: axe WCAG AA, 2 themes × 3 viewports, keyboard-only register |

Do not run the reminders e2e API while vitest runs (its scheduler shares the test DB). Turn off `OFFICE_HOURS_SCHEDULER` in tests.

---

## 21. Rollout and operations

1. **Migration:** `npm run migrate -- 102_office_hours.sql` locally (MAMP 5.7 :8889) and on the test DB. In production, use the `migrate.yml` workflow (manual dispatch, mysqldump backup first). **The owner runs or approves the production migration.**
2. **Flags:** `OFFICE_HOURS_ENABLED` (hides nav and routes when off) and `OFFICE_HOURS_SCHEDULER` (jobs). Ship dark, turn on for a pilot grade by granting `OFFICE_HOURS_MANAGE_OWN` only to the pilot teachers through the Access Studio, then widen.
3. **Before go-live:** enter the term's `SchoolClosure` days (mid-term break, exam days), so no phantom "missed" sessions appear.
4. **Training:** a 1-page teacher guide (schedule → assign → register in 3 screenshots) and a student notice that explains office hours are mandatory and shows where to see them.
5. **Monitoring:** daily during the pilot — unmarked count, conflicts hit per day, escalation count and push delivery failures. Nightly reconcile drift must be 0.
6. **Deploy:** standard MIS push-to-main deploy. If GitHub Actions is blocked by billing again, use the manual recipe in the ops notes.
7. **Tendo display** (P6) deploys separately and is harmless if MIS lacks the endpoint: it degrades to no office-hours lane.

---

## 22. Risks

| Risk | Mitigation |
|---|---|
| D1 TERM lock feels too strict once teachers compete for the same struggling students | WEEKDAY mode is one setting away; transfer requests + leadership override; Coverage tab shows who has nothing |
| Teachers forget registers → reports meaningless | register-due nudges (start+5, end+10, next morning), Unmarked board, teacher delivery KPI; offline + QR make marking fast |
| Students not receiving notices (no push subscription, reminders off) | bell is always written; Home card and calendar band are the primary surfaces; class teacher digest; install nudges already in the PWA |
| Calendar band change regresses existing grids | band entries are additive; empty state renders exactly as today; layout test updated deliberately; visual check on all three grids |
| Lock drift (lock without assignment or vice versa) after manual DB edits | nightly reconcile + test asserting the invariant; locks deleted only in service code |
| Closures entered late → false absences/escalations | escalations ignore cancelled/unmarked; leadership can cancel retroactively which voids attendance and escalations for that date |
| 1-connection DB pool contention during big bulk assigns | per-student savepoints in one transaction; batch candidate lookups; acceptable at ≤ 40 students per call |
| Mislabelling/stigma | neutral language, staff-only reasons, no composite scores (§18) |
| Scope creep (waitlists, auto-placement like Securly) | explicitly deferred (§16.10); v1 is teacher-led assignment with a hard lock |

---

## 23. Implementation file map

### 23.1 MIS backend (`nga_central_mis/backend/`)

```
migrations/102_office_hours.sql
src/db/officeHoursSchema.ts
src/access/manifest.ts                     (+ OFFICE_HOURS_* caps)
src/access/presets.ts                      (+ caps on presets)
src/utils/permissions.ts                   (+ legacy constants)
src/services/officeHours/{settings,period,filters,eligibility,schedules,assignments,transfers,sessions,register,metrics,reports,escalation,notify,reminders,scheduler,reconcile}.ts
src/services/notifications/notifyPerson.ts (generalised from services/activity/notify.ts)
src/utils/notifications.ts                 (+ kinds, subject types)
src/services/reminders/{preferences,sources,dispatcher,occurrences,timetableChanges}.ts  (+ office_hours kind & occurrences)
src/controllers/calendarController.ts      (+ office_hours array on my-calendar / student-calendar)
src/services/home/providers.ts             (+ officeHours provider)
src/routes/officeHours.ts ; src/app.ts (mount) ; src/index.ts (scheduler)
src/__tests__/officeHours{Locks,Schedules,Sessions,Register,Metrics,Reports,Notifications,Access}.test.ts
src/test/fixtures.ts                       (+ createOfficeHourSchedule, assignStudent, markRegister)
scripts/office-hours-e2e/e2e.cjs
```

### 23.2 MIS frontend (`nga_central_mis/frontend/src/`)

```
api/officeHours.ts
components/officeHours/
  OfficeHoursHub.tsx  TodayTab.tsx  SchedulesTab.tsx  StudentsTab.tsx
  ScheduleDrawer.tsx  StudentPicker.tsx  AvailabilityChip.tsx  ScheduleDetail.tsx
  RegisterSheet.tsx  SessionCard.tsx  TransferRequestDialog.tsx  QrCheckin{Host,Student}.tsx
  MyOfficeHours.tsx  ParentOfficeHoursCard.tsx
  admin/{OfficeHoursAdmin,OverviewTab,CoverageTab,UnmarkedTab,EscalationsTab,ClosuresTab,SettingsTab}.tsx
  reports/{OfficeHoursReports,PeriodPicker,SummaryView,BreakdownTable,ConsistencyLists,Student360,Teacher360,DailySheet,exports}.tsx
components/calendar/{calendarConstants,calendarLayout,CalendarGrid,DashboardCalendarWidget,CalendarSlotModal}.ts(x)
components/calendar/__tests__/calendarLayout.test.ts
components/teacher/TeacherDashboard.tsx (AttentionPanel, DayRail)
components/home/* (cards) ; components/ui/{Sidebar,NavSearch,NotificationBell}.tsx
components/reminders/{PreferencesPanel,agendaUtils}.ts(x) ; api/reminders.ts
utils/timetablePdfExport.ts
App.tsx (routes /office-hours/*, /my-office-hours)
public/sw.js (background sync for offline register, P6)
```

### 23.3 Satellites

```
nga-discipline-attendance: server/src/services/misClient.ts (+ office-hours calls),
  modules/attendance/schedule.routes.ts (office_hours kind), client/src/pages/AttendanceCalendar.tsx (lane + deep link)
nga-task-mentor: server integration endpoint for subject standing (only if missing)
```

---

## 24. Implementation status (2026-10-03)

All seven phases are built and tested on branch **`feat/office-hours`** (MIS worktree `nga_central_mis-office-hours`, from `origin/main` aa8ea278). Two satellite branches go with it:
- **Task Mentor** `feat/office-hours-standing` (worktree `nga-task-mentor-office-hours`): `GET /api/integration/student-standing`.
- **Discipline & Attendance** `feat/office-hours-lane` (worktree `nga-discipline-attendance-office-hours`): calendar lane, discipline-form prefill.

Nothing is pushed, merged or deployed. **Migration 102 is not applied to the dev or production databases**; only the private test clones have it. The operator guide is `docs/OFFICE_HOURS.md`.

### 24.1 What was built, per phase

| Phase | Delivered |
|---|---|
| 0 | `102_office_hours.sql` (all tables, settings row, `OFFICE_HOURS_*` permissions + role links), `officeHoursSchema.ts`, manifest/presets/constants |
| 1 | Schedules (teacher overlap under a row lock, own-lesson clash), assignments (lock table, partial success, cut-off, capacity, clash notes, override), transfers, sessions (materialise, re-materialise, cancel/restore, substitute), closures, settings, nightly reconcile, `/office-hours` routes |
| 2 | Teacher hub, 3-step create flow, student picker, schedule detail, My Office Hours (student + parent), the 16:20 band on every weekly grid, `/me`, `/children`, `/band` |
| 3 | Register (snapshot roster, versioned saves, history, drop-ins, edit window, offline queue), metrics, missing registers, auto-close, oversight console (schedules, missing registers, transfers, closures, settings) |
| 4 | Bell + push notices for every event (independent of Hub opt-in), escalation ladder with re-arm and acknowledgement, parent email, Reminder Hub `office_hours` kind (push/Telegram/Google/webcal), background scheduler (materialise, register reminders, morning roster, Friday digests, reconcile, transfer expiry) |
| 5 | Period engine, scoped report engine (summary, breakdown, consistency, student/teacher 360, daily sheet, coverage, overview), summary-depth privacy, CSV/Excel/PDF, Home tiles and attention items |
| 6 | Rotating-QR + 6-digit self check-in, live SSE register, "I can't come" notices, explainable suggestions (Task Mentor standing + office-hours history), term rollover, moving one session, discipline referral link, analytics key events, Tendo lane |
| 7 | Kill switch `OFFICE_HOURS_ENABLED`, load check (`scripts/office-hours-load.ts`), browser e2e (`scripts/office-hours-e2e/e2e.cjs`, axe in both themes, phone width), operator/teacher/leadership guide |

### 24.2 Tests

- **MIS backend:** `src/__tests__/officeHoursPhase0/Core/Views/Register/Notifications/Reports/Modern.test.ts` (51 tests) plus the touched suites (access presets, Reminder Hub, Home, activity catalog). The full suite on a fresh clone gives 857 of 860 passing. The only 3 failures (`registrationNumberRegenerate`) fail identically on `origin/main`. Run with `TEST_DB_NAME=<private clone>`; never alongside another DB-heavy process (MAMP drops connections, see the local-DB note).
- **MIS frontend:** `src/components/officeHours/__tests__` (8 files, 32 tests). The full suite is green (663 tests).
- **Browser:** 75 checks: create → assign → conflict → register → QR self check-in → student page and "I can't come" → bell → oversight → reports → 360. Axe WCAG AA and no horizontal overflow on the hub, My office hours and oversight, in light and dark at 390, 768 and 1366 px. Run with `E2E_TODAY` set to the API's `OFFICE_HOURS_FAKE_NOW` date.
- **Load:** 3,040 sessions and 45,600 marks; every report query runs in under 0.5 s (summary for a year 234 ms, term consistency lists 409 ms).
- **Task Mentor:** 4 new tests in `homeSummary.integration.spec.ts`. The same 11 tests in that spec fail on `origin/main`.
- **Discipline & Attendance:** 3 new lane tests. The same 3 tests fail on `origin/main`.

### 24.3 Deviations from the plan

- **Migration number 102, not 100.** 100 was skipped on main, and 101 is already applied in production, so a new 100 would sort before an applied migration.
- **Band data comes from `/office-hours/band`** rather than an `office_hours` array on `/calendar/my-calendar`. This keeps the shared `calendarController` untouched.
- **Area scoping uses the legacy role permissions plus `resolveUserScope`**, as the calendar does, rather than `authorizeIn`. Viewers whose only `OFFICE_HOURS_VIEW` link is at summary depth get totals without names. A VIEW holder who resolves to "unscoped" without MANAGE_ANY sees only their own office hours, never the school.
- **The school administrator preset** got MANAGE_ANY (§15.1), so it sees names. Summary depth applies to aggregate-only roles.
- **Moving a session** creates a one-off session (`moved_from_session_id`) and keeps the original as `CANCELLED/MOVED`. The weekly pattern can then never re-create the old date, and reports do not count the move as a cancellation.
- **QR check-in never marks a session HELD**; only the teacher's save does. Check-ins also never overwrite a teacher's mark.
- **Drafts reserve their students.** Locks are taken at draft time, so the picker is accurate. The nightly reconcile cancels drafts untouched for 7 days.
- **Absence-notice notifications** to the host use a combined subject id per (session, student), because the Notification dedupe key has one id column.

### 24.4 Bugs caught while building

- The rollover dropped every active student: `end_reason_code <> 'GOAL_MET'` is not true for NULL.
- Racing assignments could surface as InnoDB deadlocks (500). Now `withDeadlockRetry` retries them, and they end as a clean conflict.
- The report dataset resolved a class teacher's scope against an arbitrary academic year.
- The Home provider used server-local dates; office hours run on Kigali dates, and the production server is on UTC.
- The dashboard widget hid the grid (and so the band) when a teacher had office hours but no lessons.
- The toast close button had no accessible name. This is a shared component, fixed here.
- Office-hours Reminder Hub re-plans kept running after a test file ended and starved the pool in later files. Under test they are now off, like the timetable hooks (`setOfficeHoursHubSyncInTests`).

### 24.5 Still open (owner actions)

1. **Confirm decisions D1–D10 (§3).** The defaults implemented are the recommendations.
2. **Review and merge the three branches.** Remember the npm-10 lock rule: `qrcode-generator` was added with npm 10.
3. **Apply `102_office_hours.sql` in production** via `migrate.yml`. Then enter closures and review settings (`docs/OFFICE_HOURS.md`, "Switching it on").
4. **Tendo:** set `NGA_MIS_FRONTEND_URL` if the MIS web origin is not `https://mis.amashuri.com`.
5. **Run the production SQL checks** in `docs/OFFICE_HOURS.md` (old "Office Hours" calendar activities, lock invariant).
6. **Legal items shared with the analytics plan §13** (NCSA registration, Art. 50 storage location, parental consent text): list this module in the processing register.

---

## A. Research sources (abridged)

- Securly Flex: https://www.securly.com/flex · priority tiers https://docs.securly.com/docs/flex-priority-guide · cut-off https://docs.securly.com/docs/cutoff-time-details
- Edficiency: https://www.capterra.co.uk/software/203925/edficiency · Enriching Students: https://www.getapp.com.au/software/2050066/enriching-students
- SmartPass flex/attendance: https://www.smartpass.app/blog/flex-time-schools · FlexiSched example: https://bruin.eduhsd.k12.ca.us/School-Info/FlexiSched/
- EAB Navigate kiosk & reports: https://td.usnh.edu/TDClient/60/Portal/KB/Article/2074/EAB-Navigate360-Reporting-on-Check-ins-from-Kiosk
- Panorama Student Success: https://academy.panoramaed.com/article/500-what-is-panorama-student-success
- Attendance Works thresholds & tiers: https://www.attendanceworks.org/wp-content/uploads/2017/08/FAQ.pdf · https://attendanceworks.org/?p=32339
- MTSS fidelity / dosage: https://mtss4success.org/sites/default/files/2025-02/fidelity_within_mtss_overview.pdf
- High-impact tutoring & attendance: https://scale.stanford.edu/research-in-action/high-impact-tutoring-student-attendance
- Parent messaging: https://www.the74million.org/article/they-examined-3-3-million-text-messages-on-chronic-absenteeism-here-are-4-big-findings/ · https://mdrc.org/work/publications/can-informing-parents-help-high-school-students-show-school/file-full
- Notification batching / quiet hours: https://docs.suprsend.com/docs/best-practices-for-batching-digest
- Rwanda Law 058/2021: https://dataprotection.africa/rwanda-data-protection-act-introduced/ · https://www.dataguidance.com/notes/rwanda-data-protection-overview
