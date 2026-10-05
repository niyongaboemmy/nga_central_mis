# Mandatory office hours — operations and user guide

What was built from `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` (repo root), how to switch it on, and how teachers, students and leadership use it.

## What it does

- Teachers schedule **mandatory office hours** on the timetable's last band (16:20–17:20 by default), on one or more weekdays, for a date window inside a term.
- Teachers **assign students**. The MIS guarantees **no overlap**: a student who already holds office hours cannot be assigned again. By default this is one set of office hours per term; leadership can switch to one per weekday in Settings.
- The teacher **takes the register** each session in a few taps, online or offline. Students can also **check in by QR code** if the school switches that on; the teacher's register still decides.
- Students, teachers, class teachers, programme leads and (by policy) parents are **notified**:
  - when students are assigned, removed, moved or cancelled;
  - before each session (Reminder Hub);
  - after a missed session;
  - when absences repeat (escalation).
- **Reports** for any day, week, month, term, year or custom range:
  - attendance rates;
  - who is consistent, on watch or chronic;
  - registers taken and missing;
  - breakdowns by teacher, subject, class, grade, programme, weekday and purpose;
  - coverage, plus student and teacher 360s;
  - a printable daily register sheet.
  - Every report exports to CSV, Excel and PDF.

## Code map

| Area | Where |
|---|---|
| Migration | `backend/migrations/102_office_hours.sql`: every `OfficeHour*` table, `SchoolClosure`, the settings row, the `OFFICE_HOURS_*` permissions and their role links |
| Schema | `backend/src/db/officeHoursSchema.ts` |
| Services | `backend/src/services/officeHours/`:<br>- `common.ts`: Kigali clock, terms, `withDeadlockRetry`, the `OFFICE_HOURS_ENABLED` switch<br>- `settings.ts`, `access.ts`, `eligibility.ts`<br>- `schedules.ts`<br>- `assignments.ts`: the lock table (no-overlap guarantee), override<br>- `transfers.ts`<br>- `sessions.ts`: materialisation, cancel, substitute<br>- `closures.ts`<br>- `register.ts`, `metrics.ts`: the one place the formulas live<br>- `admin.ts`: unmarked, auto-close<br>- `views.ts`: student, parent, band<br>- `period.ts`, `reports.ts`<br>- `events.ts`, `notify.ts`, `escalation.ts`, `digests.ts`<br>- `reminders.ts`: Reminder Hub occurrences<br>- `scheduler.ts`, `reconcile.ts`<br>- `live.ts`, `modern.ts`: QR, notices, suggestions, rollover, move |
| HTTP | `backend/src/routes/officeHours.ts`, mounted at `/office-hours` |
| Home | `backend/src/services/home/officeHoursProvider.ts` |
| UI | `frontend/src/components/officeHours/*`:<br>- `/office-hours` (teacher hub)<br>- `/office-hours/schedules/:id`<br>- `/office-hours/admin` (oversight)<br>- `/office-hours/reports/{students,teachers}/:id`<br>- `/my-office-hours` (students and parents)<br>- `/office-hours/checkin`<br><br>Timetable band: `OfficeHoursBandCells.tsx`, used by `CalendarGrid` and `DashboardCalendarWidget` |
| Other apps | Task Mentor `GET /api/integration/student-standing` (suggestions). Discipline & Attendance: office-hours lane on the attendance calendar, and `/discipline/log?student_id&class_id&title&description` prefill |
| Tests | Backend: `src/__tests__/officeHours*.test.ts` (Phase 0 – 6).<br>Frontend: `src/components/officeHours/__tests__`.<br>Real browser: `backend/scripts/office-hours-e2e/e2e.cjs` |

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `OFFICE_HOURS_ENABLED` | on | `false` hides the module everywhere: the API answers 404, the scheduler does not start, and Home and the Reminder Hub skip it. Use it as a kill switch. Roll out by permission instead (see below). |
| `OFFICE_HOURS_SCHEDULER` | on | `false` stops the background jobs only. Use it on a second process, or while debugging. |
| `HOME_APP_TASKMENTOR_URL` | — | Already set for Home. Suggestions read Task Mentor's student standing through it. Without it, suggestions fall back to office-hours history only. |
| `HOME_APP_TIMEOUT_MS` | 8000 | Also bounds the Task Mentor standing call. |
| `OFFICE_HOURS_FAKE_NOW` | — | End-to-end testing only (ignored in production): pins the module's clock. |

Discipline & Attendance needs `NGA_MIS_FRONTEND_URL` (default `https://mis.amashuri.com`) for the deep links in its office-hours lane.

## Switching it on

1. **Migration.**
   - Locally: `npm run migrate -- 102_office_hours.sql`, then `npm run migrate -- 102_office_hours.sql --db=nga_central_mis_test`.
   - Production: run the `migrate.yml` workflow with `migration_file=102_office_hours.sql`. It takes a mysqldump first.
   - The file is idempotent; re-running it is safe.
2. **Deploy** MIS. Deploy Task Mentor and Discipline & Attendance if you want suggestions and the attendance-calendar lane.
3. **Closures.** Under *Office hours oversight → Closures*, enter the term's holidays, mid-term break and exam days, so no session is ever counted as missed.
4. **Settings.** Review *Oversight → Settings*:
   - lock mode;
   - band times;
   - capacity;
   - same-day cut-off;
   - edit window;
   - escalation thresholds;
   - parent notifications;
   - QR check-in.
5. **Pilot.** The migration grants `OFFICE_HOURS_MANAGE_OWN` to every teacher role. To pilot with one grade, remove it from `TEACHER` in Access Studio and grant it to the pilot teachers' role; restore it after the pilot.
6. **Check** after a day of use:
   - *Oversight → Missing registers* is short;
   - the nightly reconcile logs no `lockConflicts`;
   - students received their "Office hours with …" notice.

Production DB checks (run them yourself; this sandbox cannot read production):

```sql
-- Office hours someone had entered as calendar activities before this module existed.
SELECT activity_id, academic_term_id, class_group_id, day_of_week, start_time FROM CalendarActivity WHERE activity_type LIKE '%office%';
-- Lock invariant: must return 0 rows.
SELECT a.assignment_id FROM OfficeHourAssignment a WHERE a.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM OfficeHourStudentLock l WHERE l.assignment_id=a.assignment_id);
```

## Background jobs (one pm2 process)

| Job | When (Kigali) | What |
|---|---|---|
| Materialise | every 6 h | Dated sessions up to two weeks ahead, from each schedule's first date (no gaps after downtime) |
| Register reminders | every minute | The host gets reminders at start + 5 min, at end + 10 min if the register is still missing, and the next morning at 07:30 |
| Morning roster | 06:30 weekdays | "Office hours today: 16:20 Maths support · 12 students · B4" |
| Escalations | 18:30 | Repeated-absence ladder (also evaluated after every register save) |
| Reconcile, auto-close | 02:00 | Ends finished windows and students who left their class, cancels week-old drafts, repairs the lock invariant. Auto-close runs only if switched on. |
| Weekly digests | Friday 17:30 | Teachers, leadership (bell and email) and, if set, parents |
| Transfer expiry | hourly | Requests older than three school days |

Every job is idempotent and keyed: a restart repeats nothing visible.

## Rules worth knowing

- **Invitations are weekly** (migration 104). A teacher invites a group for one week, a few weeks or the rest of the term; next week can be the same students (*Bring back last week's*) or different ones. Capacity is per session, so each week has its own seats.
- **No overlap is a database rule.** `OfficeHourStudentDateLock` has the primary key (student, date): TERM mode locks every weekday of an invitation, WEEKDAY mode its meeting days. If two teachers invite the same student for the same week at the same moment, one wins and the other sees "With Ms A · Tue · wk 12 Oct". They can *Ask to transfer*, and leadership can *override*. (102's `OfficeHourStudentLock` is no longer used; it is kept for rollback.)
- **Deploy order:** the code checks for `OfficeHourStudentDateLock`; until migration 104 runs, office hours answer 503 "being set up". Apply 104 right after deploying.
- **Same-day cut-off (14:00).** A student added on a meeting day after the cut-off starts at the next session. The confirmation says so: "starting Wed 4 Mar".
- **Only registers count.** Cancelled sessions (including closures) and registers nobody took never count against a student. Excused counts as attended, the same as in the attendance app. Reports also show a stricter presence rate.
- **Consistency bands** apply once at least 3 sessions are held: consistent ≥ 90%, watch 80–89%, chronic below 80%.
- **Escalation ladder.**
  - Level 1: 2 misses in a row, or 2 in 30 days. The student, the teacher and the class teacher are told.
  - Level 2: 3 in a row, or a rate below the watch band. The programme lead and, by policy, parents are told by email too.
  - A level fires again only after the student attends twice in a row.
  - Level 2 escalations show a *Refer to discipline* link (prefilled form in the attendance app; nothing is saved automatically).
- **Students never see the reason** a teacher assigned them, nor other students.
- **Self check-in.** QR codes rotate every 30 seconds and stop working after a minute. A check-in never overwrites the teacher's mark and never marks the session held by itself.
- **Moving one session** keeps the original as *Cancelled (moved)*, so the weekly pattern never re-creates it. Reports do not count it as a cancellation.

## Teacher quick guide

1. **Create office hours.** *Office hours → New office hours*, or the **+** on your timetable's office-hours row. Choose the days, then *Continue to students*.
2. **Invite students, week by week.** Pick the week and how long (*This week*, *2 weeks*, *4 weeks*, *Rest of term*). Ticks are only possible for students who are free that week. *Suggested* lists students with evidence: low Task Mentor results, missing work, or past office-hours absences; *Last week* lists last week's group. *Review → Publish* tells every student.
3. **Plan the next weeks.** On the office hours page, *Students by week* shows each week's count. Pick a week, then *Invite for this week* or *Bring back last week's*. *Remove* in a future week keeps the weeks before it.
4. **Take the register.** At 16:20 open *Today → Take register*. Tap *Mark all present*, then change the few who were late, absent or excused (keys 1–4, Ctrl/⌘+Enter to save). Add a walk-in under *Add a student who came*.
5. **Away?** Cancel the date (students are told), set a substitute, or *Move* that one session.
6. **Next term.** *Copy to another term* creates a draft with the same days and students, each re-checked for the new term.

## Student guide

Your office hours are on your timetable (the last row) and under *My office hours*, with the next session and your attendance. Office hours are mandatory. If you can't come, press *I can't come* before the session; your teacher still decides. If your teacher shows a QR code, scan it, or type the 6-digit code at *Office hours check-in*.

## Leadership guide

*Office hours oversight* has these tabs:

| Tab | What it shows |
|---|---|
| Overview | Today, live |
| Office hours | Every schedule |
| Missing registers | With a *Remind* button |
| Escalations | Follow-up and discipline referral |
| Coverage | Class × weekday, and who has no office hours |
| Transfers | Pending transfer requests |
| Closures | Holidays, exam days and events |
| Reports | All periods; exports |
| Settings | The office-hours policy |

What you see depends on your access:

- a class teacher sees their class;
- a programme lead sees their programme;
- head teacher and deputies see the school;
- a viewer with summary-only access sees totals, never names.
