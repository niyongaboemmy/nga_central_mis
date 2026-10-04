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
6. Interactive UI/UX design (no forms)
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
| Period engine (day/week/month/term/year/custom) | `period.ts` | Unchanged (the picker UI becomes segmented pills, §6.9) |
| Report export (CSV/Excel/PDF) | `reports/exports.ts` | Unchanged |
| Notification delivery (bell + push, independent of Reminder Hub opt-in) | the delivery helper inside `notify.ts` | New event texts (§10) |
| Escalation ladder logic, digest framework, scheduler loop | `escalation.ts`, `digests.ts`, `scheduler.ts` | Re-pointed to assignments and visits |
| Offline register queue | `offlineQueue.ts` | Unchanged, new payload |
| "I can't come" notice | `OfficeHourAbsenceNotice` + service | Applies to assigned sessions; UI becomes reason tiles (§6.8) |
| Suggestions (Task Mentor standing + history) | `suggestionsFor` in `modern.ts` | Moves to `assignments.ts`, feeds *Suggested* |
| Motion and visual primitives | `design/motion.ts`; e-learning `ProgressRing`, `ProgressBar`, `Celebration`, `BottomActionBar`, `Skeleton` | Reused by the interactive building blocks (§6.11) |
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

Every task is a **direct manipulation** (tap, drag, swipe or toggle on a visual object), not a form to fill in. "Steps" counts the deliberate actions a user takes.

| Who | Task | Interaction | Steps | Where it starts |
|---|---|---|---|---|
| Teacher | **Declare my two days** | Drop your two avatar tokens on the **Hall week board** | 2 drops (or 2 taps) → auto-confirm | First visit; Home tile; band "+ Pick your days"; daily reminder |
| Teacher | **Take attendance** | Tap avatar tiles to cycle status; tap visitor bubbles to add; **Finish** | 1 screen | Today hero card; band cell; 16:25 push |
| Teacher | **Nobody came** | Long-press (or tap ⋯) on the Today card → "No one came" | 1 | Today hero card |
| Teacher | **Assign students** | Tap student cards → drop them on a **session tile** (or tap it) → tap a **reason tile** | 2 screens | Assign button; register tile ⋯; Person 360; suggestion card |
| Teacher | **Can't hold a session** | **Drag the session tile** to another day of the same week, or onto the "Can't replace" tray | 1 drag | Week strip; Today ⋯ |
| Teacher | **Release a student** | Swipe the assigned card left (or tap ✕), with an undo toast | 1 | Assigned avatar strip |
| Teacher | **Resolve a block** | Tap the holder's avatar badge on the blocked card → Message / Ask to release | 1 | Inline on the card |
| Student | **See who's in the hall** | Glance at the week board; tap an avatar for details | 0 | My office hours; band; Home |
| Student | **See my assignment** | Countdown hero card | 0 | Notice; page; band |
| Student | **Say I can't come** | Tap a reason tile on the hero card | 1 | Hero card |
| Leadership | **Check declarations** | Look at the progress ring and avatar wall; **Nudge all** | 0–1 | School → Teachers |
| Leadership | **Follow up a student** | Move a follow-up card to *Acknowledged* (drag or button), with a one-line note chip | 1 | School → Follow-up |
| Leadership | **Fill days from the Google Form** | Drop the CSV on the drop zone → watch matches animate → **Apply** | 2 | School → Teachers ⋯ |

---

## 6. Interactive UI/UX design

### 6.1 Design direction: "no forms"

Classic form fields (text inputs, selects, date pickers, labelled field grids, Save buttons at the bottom of a field list) are **not used** for any office-hours task. Every input is one of these interactive elements:

| Instead of… | We use… | Example |
|---|---|---|
| Day checkboxes / multi-select | **Draggable avatar tokens on a week board** (tap fallback) | Declaring days |
| Student dropdown / search form | **Student card grid** with photos, availability rings and tap-to-select; one floating search pill that filters as you type | Assigning |
| Date picker | **Session tiles** on a horizontal week strip | Choosing which session |
| Reason select | **Icon tiles** (big, illustrated, single tap) | Assignment reason, "I can't come", "can't replace" reason |
| Free-text message box | **Quick-phrase chips** ("Bring your exercise book", "Bring your laptop") + an optional one-line "✎ add your own" that expands in place | Assignment message |
| Status radio buttons | **Tap-to-cycle avatar tiles** with an animated ring (and swipe on phones) | Register |
| Cancel / reschedule form | **Drag the session tile** to another day | Can't hold it |
| Settings form | **Policy card**: dual-thumb time band slider on a mini timeline, steppers, toggles, calendar popover chips | Leadership policy |
| Closure date-range form | **Drag across days** on a month calendar | Closures |
| File-upload form | **Drop zone** with an animated match preview | Google Form import |

Text entry is limited to the **search pill** and the optional **one-line note**. Neither is required to finish any task.

### 6.2 Visual language

- **People first.** Every teacher and student is an **avatar** (profile photo, or initials on the teacher's subject colour from the existing golden-angle subject colours). State is shown with a **ring** around the avatar, not with text columns.
- **Graphics carry the information:**
  - a **countdown ring** to 16:20;
  - a **live pulse** while a session is running;
  - **fill rings** for progress (declarations 41/48, register 7/9 marked);
  - **sparklines** on KPI tiles;
  - **load meters** on each weekday;
  - a calm **Academy Hall** illustration (SVG line art, theme-aware) in empty states and on the hall board header.
- **Cards and tiles, not tables,** for daily work. Tables appear only in reports, each behind a "Table view" toggle next to its chart.
- **Motion with meaning.** Uses the existing `design/motion.ts` vocabulary (`tap`, `reveal`, `check`, `fill`, `shake`, `fade`), which already honours reduced motion:
  - tokens *snap* into a day;
  - the status ring *fills* on tap;
  - a session tile *flies* to its replacement day and leaves a dotted "moved" ghost;
  - a blocked card *shakes* once;
  - `Celebration` plays once on the first declaration and on a perfect register week.
- **Calm, modern surfaces:**
  - generous radius (`rounded-2xl` cards, `rounded-full` chips);
  - soft elevation on hover and drag;
  - a frosted bottom action bar on phones (e-learning `BottomActionBar`);
  - dark mode designed rather than inverted.
- **Microcopy:** one short line per screen at most, written as a friendly coach ("Two taps and you're done").

### 6.3 Colour and chart rules

These follow the `dataviz` skill. The palette was **validated with `validate_palette.js`** on the MIS card surfaces (light `#ffffff`, dark slate-900 `#0f172a`): all checks pass, with worst-case CVD ΔE 24.7 in light and 26.8 in dark.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--oh-assigned` | `#2a78d6` | `#3987e5` | Categorical slot 1: **Assigned** visits |
| `--oh-voluntary` | `#eb6834` | `#d95926` | Categorical slot 2: **Voluntary** visits |
| `--oh-seq-*` | blue ramp 100→700 (`#cde2fb` … `#0d366b`) | dark steps of the same ramp (≥ step 250 on dark) | Sequential: hall load, heatmaps |
| `--oh-good` | `#0ca30c` | same | Status: **Present** (with ✓ icon) |
| `--oh-critical` | `#d03b3b` | same | Status: **Absent** (with ✕ icon) |
| `--oh-warning` | `#fab219` | same | Status: **Late**, register due (with ⏱ icon) |
| excused | slate-400 | slate-500 | **Excused** (with ☂ icon) |

Rules:
- Colour follows the entity: Assigned is always blue and Voluntary always orange, on every chart and chip.
- **Status colours never carry meaning alone.** They always come with an icon and a label.
- Charts use **recharts** (already a dependency), lazy-loaded only in the School and Reports views:
  - thin marks, 4 px rounded data ends, a 2 px surface gap between stacked segments;
  - recessive grid, solid (never dashed);
  - **one y-axis only**;
  - a legend for 2 or more series plus direct labels; no number on every point;
  - a hover tooltip on every mark, with hit targets larger than the mark;
  - every chart has a **Table view** toggle (data never lives only in a tooltip);
  - a skeleton on first load only, and no skeleton flash on refetch.
- Hero numbers use the sans face at ≥ 48 px with proportional digits. `tabular-nums` is only for aligned columns.

### 6.4 Teacher: the Hall week board (declaring days)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [hall line-art]  Pick your two office-hours days                    │
│                   16:20–17:20 · Academy Hall    Due Mon 5 Oct  ◔ 2d  │
│                                                                      │
│   Your tokens:  (🧑🏽‍🏫 Ms A)  (🧑🏽‍🏫 Ms A)      ← drag onto two days         │
│                                                                      │
│  ┌── Mon ──┐ ┌── Tue ──┐ ┌── Wed ──┐ ┌── Thu ──┐ ┌── Fri ──┐          │
│  │ ◉◉◉◉◉   │ │ ◉◉◉◉◉◉◉ │ │ ◉◉◉     │ │ ◉◉◉◉◉◉  │ │ ◉◉      │ ← avatars│
│  │ ▮▮▮▮▯▯  │ │ ▮▮▮▮▮▮▯ │ │ ▮▮▯▯▯▯  │ │ ▮▮▮▮▮▯  │ │ ▮▯▯▯▯▯  │ ← load   │
│  │  5      │ │  7 busy │ │  3      │ │  6      │ │  2 quiet│          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

- Each **day column** shows the teachers already on it as an overlapping **avatar stack** (tap to expand), plus a **load meter** in the sequential blue ramp, labelled with the count and "busy"/"quiet".
- **Drag** a token onto a column. The token snaps in, the column lifts, and the meter grows with a `fill` animation. **Tap a column** does the same on touch and keyboard (Space/Enter), with arrow keys moving between columns.
- After the **second** token lands, the board confirms itself: a 3-second undo bar ("Tue & Thu saved · Undo") and `Celebration`. There is no Save button.
- **Changing days later:** the same board, with your tokens already placed. Drag one to another day, and a small inline banner says "From Mon 13 Oct". If weekly assignments sit on the dropped day, their student avatars float above the board with two drop targets: *Move to Thu* / *Release*.

### 6.5 Teacher hub (the only teacher page)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Office hours · Tue & Thu · Academy Hall                ✎  [ + Assign ]│
├──────────────────────────────┬───────────────────────────────────────┤
│  TODAY                       │  THIS WEEK                            │
│   ◔ 2h 14m  → 16:20          │  Mon   Tue●  Wed   Thu   Fri          │
│   (countdown ring)           │        [▣ 3]       [▣ 2]   ← session   │
│   ◉◉◉ 3 assigned             │        today       tiles (draggable)  │
│  [ Take attendance ]   ⋯     │  ┌ Can't replace ┐  ← tray appears     │
│                              │  └───────────────┘    while dragging  │
├──────────────────────────────┴───────────────────────────────────────┤
│ ASSIGNED  ◉ Aline ·Thu   ◉ Eric ·every Tue   ◉ Ivan ·Thu   …  (swipe) │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ Visits/term ─┐ ┌ On-day registers ┐ ┌ Assigned attended ┐           │
│ │ 61  ▁▃▅▂▆▇   │ │ ◕ 7/8  🔥 5 streak│ │ ◕ 83%             │  KPI tiles│
│ └──────────────┘ └──────────────────┘ └───────────────────┘           │
│ Weekly visits  ▇▇ assigned ▇▇ voluntary   (stacked bars, 8 weeks)    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Today hero card.** A countdown ring before 16:20, a pulsing "In session" ring between 16:20 and 17:20, and a green ✓ "Recorded" afterwards. The assigned students show as an avatar stack with their "I can't come" badges. The primary button changes with time: *Take attendance* → *Finish register* → *Edit*.
- **Week strip.** Your session tiles show an assigned-count badge. **Dragging a tile** reveals glowing drop zones on the other days of the *same week* only, plus a **"Can't replace"** tray. Dropping on a day shows a one-line confirm toast: "3 students will move to Wed · Confirm". Dropping on the tray opens a row of reason tiles (*Sick* · *Official duty* · *School event* · *Other*). A tap fallback is available under ⋯.
- **Assigned strip.** Horizontal avatar cards (name, day, reason icon), swipe left to release, tap to open a mini profile with their visit history sparkline.
- **Attention chips** (only when relevant): "⚠ Register missing · Thu 2 Oct → Record" and "↔ Mr K asks for Grace". Each opens in place.
- **Insights row.** Three KPI tiles: visits this term with a sparkline, on-day registers as a ring with a streak flame, and the assigned attendance ring. Below them, an 8-week **stacked column** chart of assigned and voluntary visits, with direct labels on the last week and a Table view toggle.

### 6.6 Assign: two interactive screens (drawer, full screen on phones)

**Screen 1 · Who: a student card grid**

```
 (🔍 Search pill…)   (S4A)(S4B)(S5 Maths)(✦ Suggested 3)

 ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 │ ◯Aline│ │ ◯Eric │ │ ⊘Grace│ │ ◯Ivan │      ◯ free (tap → ✓ ring fills)
 │ S4A   │ │ S4B   │ │ S4A   │ │ S5    │      ⊘ blocked: holder avatar badge
 │       │ │ with  │ │ 🧑🏽‍🏫MrK │ │ ✦ low │      ✦ suggestion reason chip
 └──────┘ └──────┘ └──────┘ └──────┘
                                   ┌───────────────────────────────┐
                                   │ ◉◉ 2 selected      Next →     │ floating
                                   └───────────────────────────────┘
```

- Tap a card to select it: the ring fills with `check`, and selected avatars fly into the floating tray.
- A **blocked** card is desaturated with the holder's avatar badge. Tapping it shakes the card once and opens a mini popover: *Message Mr K* · *Ask to release*.
- **Suggested** cards carry an evidence chip (✦ "Low quiz results", "3 missing tasks").
- Class chips filter instantly. The search pill filters as you type, by name or registration number.

**Screen 2 · When & why: drop on a session, tap a reason**

```
 Sessions:   [ Tue 7 ▣2 ]  [ Thu 9 ▣1 ]  [ Tue 14 ]  [ Thu 16 ]    ( ⟳ Every week )
                ↑ drop the avatar tray here (or tap)

 Reason:   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
           │ 💡   │ │ 📝   │ │ 📊   │ │ 🗓   │ │ 🛠    │ │ …    │
           │Topic │ │Missed│ │Assess│ │After │ │Project│ │Other │
           └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
 Note:     (Bring exercise book)(Bring laptop)(✎ add your own)

                    ┌───────────────── phone-style preview ──────────────┐
                    │ 🔔 Office hours with Ms A                           │
                    │    Tue 7 Oct · 16:20–17:20 · Academy Hall           │
                    │    💡 Help with a topic · "Bring exercise book"     │
                    └─────────────────────────────────────────────────────┘
                                                      [ Assign 2 ✓ ]
```

- **Session tiles** come from the teacher's next sessions. The tray of selected avatars can be **dragged onto a tile**, or the tile tapped.
- **⟳ Every week** is a toggle chip. Turning it on expands a tiny **duration slider** (1–8 weeks, with the end date shown as you slide).
- **Reason tiles** are large icon cards (lucide icons), single-select with a `check` animation. *Other* shows the one-line note.
- The **live preview** updates on every tap and looks like the phone notification the student will get.
- The result animates per student: cards that were assigned turn green ✓, and any card blocked in the meantime shakes and stays with its actions.

### 6.7 Register: tap tiles, not rows (drawer, full screen on phones)

```
 Tue 7 Oct · Academy Hall                         ◕ 7/9 marked   ● saved
 ┌─────────────────────────────────────────────────────────────────────┐
 │ ASSIGNED                                                (All ✓)     │
 │  ┌─────┐  ┌─────┐  ┌─────┐                                          │
 │  │◉✓   │  │◉✕   │  │◉ ?  │   tap: ? → ✓ Present → ✕ Absent → ?     │
 │  │Aline│  │Eric │  │Ivan │   long-press / ⋯: Late ⏱ · Excused ☂      │
 │  └─────┘  └─────┘  └☂────┘   ☂ badge = "I can't come" notice         │
 ├─────────────────────────────────────────────────────────────────────┤
 │ VISITORS   (🔍 type a name…)    Recent: (◉Jean)(◉Grace)(◉Paul) + tap   │
 │  ◉Jean ✓  ◉Grace ✓  ◉Sam ✓  …   (orange ring = voluntary)            │
 └─────────────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────────────┐
  │ ◕ 1 present · 1 absent · 1 → absent · 9 visitors   [ Finish ✓ ]     │
  └─────────────────────────────────────────────────────────────────────┘
```

- **Assigned tiles** are big avatar tiles. **Tap** cycles the status, and the ring fills green ✓ or red ✕ with `check`. On phones, **swipe right = present, swipe left = absent**. **Long-press** (or ⋯) opens a radial mini-menu: Late ⏱ / Excused ☂.
- A **progress ring** in the header fills as students are marked.
- **Visitors.** Recent-visitor **bubbles** add with one tap. Search results appear as avatar bubbles too (no list rows); Enter adds the first. Visitors wear the **orange** voluntary ring, and tapping a visitor removes them, with undo.
- **Finish** bar: a live summary with the "→ absent" count. Finishing plays a short tick-burst. A perfect on-day week triggers `Celebration` once.
- **No one came:** with no assigned students and no visitors, the Finish button reads *"No one came · Finish"*.
- Keyboard: arrows move between tiles, 1/2/3/4 set statuses, `/` focuses search, ⌘↵ finishes. Works offline (queue), with an "Offline · will send" chip.

### 6.8 Student: My office hours

```
 ┌──────────────────── HERO ─────────────────────┐
 │ ◔ Today 16:20 · in 2h 14m                      │  countdown ring
 │ 🧑🏽‍🏫 Ms A · Mathematics · Academy Hall           │
 │ 💡 Help with a topic · "Bring exercise book"   │
 │ Can't come?  (🤒 Sick bay) (🏃 Team) (✋ Permission)│  reason tiles = 1 tap
 └───────────────────────────────────────────────┘
 WHO'S IN THE HALL THIS WEEK          (🔍 any teacher)
  Mon ◉K   Tue ◉A ◉D   Wed ◉M   Thu ◉A   Fri —      your teachers first, subject-colour rings
 MY JOURNEY
  ◕ 3/3 assigned attended   🔥 4-week visit streak   🏅 Regular visitor
  ▁▂▅▃▆  visits per week (orange voluntary · blue assigned)
```

- The **hero** shows a countdown to the next assigned session, with the reason icon and note. "Can't come" is three reason tiles; after one tap the tile turns into "Ms A has been told ✓ · Undo".
- **Who's in the hall:** a week board of teacher avatars with subject-colour rings, the student's own teachers first. Tapping an avatar opens a mini card (subject, days, "Next: Thu 16:20").
- **My journey** keeps a positive tone only:
  - an attendance ring for assigned sessions;
  - a visit streak and a "Regular visitor" badge (≥ 3 of the last 4 weeks);
  - a small weekly visits chart.

  No ranking and no comparison with other students. Parents see the same page per child, read-only, without the "Can't come" tiles.

### 6.9 Leadership: Office Hours → School

**Today: the live hall floor**

```
 ◉ 12 teachers in the hall   ▣ 9 registers recorded   👥 31 assigned · 74 visitors   (auto-refresh 30s)
 ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐
 │◉✓  ││◉●  ││◉⏱  ││◉✓  ││◉●  ││◉✕  │   ✓ recorded · ● in session (pulse) · ⏱ due · ✕ missing
 │MsA ││MrK ││MrD ││... ││    ││    │   tap → read-only register drawer
 │3·9 ││2·5 ││    ││    ││    ││    │   assigned · visitors
 └────┘└────┘└────┘└────┘└────┘└────┘
```

Counters animate when they change, and screen readers get a polite `aria-live` summary.

**Teachers: declarations, load and compliance**

```
 ┌ Declared ──────┐  ┌ Hall load by weekday ─────────────┐
 │   ◕ 41 / 48     │  │ ▇ Mon 9  ▇ Tue 14  ▇ Wed 6 ...    │  single-hue columns, tooltip lists names
 │ 5 missing · 2 exempt│ └───────────────────────────────────┘
 │ [ Nudge all 5 ] │
 └────────────────┘
 MISSING:  ◉ ◉ ◉ ◉ ◉   (tap avatar → set days on a mini week board · exempt · nudge)
 COMPLIANCE   avatar · held ▮▮▮▮▯ 80% · on-day ▮▮▮▮▮ 100% · replaced ▮▮▯ 2/3   (sortable, meters)
 ⋯  Import Google Form (drop zone) · Download CSV
```

- The declaration **progress ring** with **Nudge all** (bell + push), then a burst of "sent" ticks.
- **Hall load** column chart in one sequential hue. The tooltip lists the teachers on that day; there is a Table view.
- The **missing avatar wall**. Tapping an avatar opens a mini week board to **set days** for that teacher (the same drag interaction), plus *Exempt* and *Nudge*.
- **Compliance list:** one card per teacher with three inline **meters** (held, on-day, replaced), sortable by tapping a meter header.
- **Import:** drop the Google Form CSV. Rows animate into *Matched ✓* / *Needs a look* columns. Tap a "needs a look" row to pick the right teacher from avatar suggestions, then **Apply**.

**Follow-up: a board, not a list**

```
  Level 1 (6)            Level 2 (2)            Acknowledged (14)
 ┌──────────────┐      ┌──────────────┐       ┌──────────────┐
 │◉ Eric · S4B   │ ───▶ │◉ Ivan · S5    │ ───▶  │◉ ...          │
 │ ✕✕ 2 in a row │      │ ✕✕✕ 3 in a row│       │ note: "met..."│
 │ ▁▁▅▁ history  │      │ [Refer] [Assign]│     └──────────────┘
 └──────────────┘      └──────────────┘
```

Each card shows an absence-history dot strip (✓/✕ per assigned session). **Drag to Acknowledged** (or tap ✓) to add a note chip ("Met with student", "Parent called", "✎ other"). The *Refer* button opens the prefilled Tendo discipline form, and *Assign* opens the Assign drawer for that student.

**Reports: chart cards, each with a Table view**

| Card | Form (dataviz) | Notes |
|---|---|---|
| KPI row | Stat tiles + sparklines | Visits, unique visitors, assigned attendance %, on-day registers %, cancellations replaced % |
| Visits over time | **Stacked columns**, assigned (blue) + voluntary (orange), per week | Legend + direct labels on the last bar |
| Assigned attendance trend | **Line**, single series, against a reference line at the watch band (80%) | Crosshair tooltip |
| When students come | **Heatmap**, weekday × week, sequential blue | Cell tooltip, Table view |
| Consistency | **Horizontal stacked bar** of consistent / watch / chronic (status-free: sequential steps + labels) | Tap a segment → student list |
| By teacher / class / subject / reason | **Sorted horizontal bars**, one hue; **emphasis** highlights the selected item | Tap → 360 |
| Teacher 360 / Student 360 | Avatar header, KPI tiles, visit timeline (dots on a line, ✓/✕ icons) | Export |

A single **filter row** sits above all charts: a period picker shown as segmented pills (*Week · Month · Term · Year · Custom*) with a calendar popover for Custom, plus grade/class/teacher chips. Export (CSV, Excel, PDF) sits in the row's ⋯.

**⚙ Policy and closures: interactive controls**

- **Time band:** a dual-thumb slider on a mini day timeline (15:00–18:00). It is locked by default with a 🔒 toggle, because the policy fixes 16:20–17:20.
- **Days per teacher:** a stepper (− 2 +). **Deadline:** a date chip opening a calendar popover. **Edit window, escalation thresholds:** steppers. **Parent notifications:** segmented pills (Off · Escalations · Weekly).
- Each control saves itself on change (optimistic, with a "Saved ✓" micro-toast and undo).
- **Closures:** a month calendar where leadership **drags across days** to create a closure. A popover then asks for a label chip (*Holiday* · *Exams* · *Event* · ✎) and shows "4 sessions affected" before confirming.

### 6.10 Accessibility and fallbacks (non-negotiable)

- **Every drag has a tap and keyboard equivalent:** tap a token then tap a day; Space to pick up, arrow keys to move, Enter to drop. Each is announced through `aria-live`. Drag uses pointer events (mouse, touch, pen) with a 6 px threshold so scrolling isn't hijacked.
- Hit targets are ≥ 44 px. Rings and colours always come with an icon and a text label (✓ Present, ✕ Absent, ⏱ Late, ☂ Excused). Focus rings are visible.
- **Reduced motion:** all animation goes through `useMotion()`, so Celebration, flights and pulses become fades.
- Charts have Table view toggles and `aria-label` summaries ("Visits this term: 61, 12 assigned, 49 voluntary").
- **Performance:**
  - recharts and the celebration effect are lazy-loaded;
  - avatars use the existing user photo URLs with lazy loading and initials fallback;
  - the register stays smooth with 60+ tiles (virtualise the visitor bubbles beyond 80).
- **Layout:** a phone-first layout at 390 px (boards scroll horizontally per column with snap; drawers become full-screen sheets), axe WCAG AA in both themes, and no horizontal page overflow.

### 6.11 Shared interactive building blocks (`components/officeHours/ui/`)

| Component | Used by | Notes |
|---|---|---|
| `Avatar` / `AvatarStack` | everywhere | Photo or initials on subject colour; ring prop (state colour + icon) |
| `StatusRing` | register tiles, hall floor, assigned strip | Animated SVG ring; ✓ ✕ ⏱ ☂ glyphs |
| `CountdownRing` | Today hero, student hero | Kigali clock; switches to a live pulse during the band |
| `WeekBoard` | day declaration, set-days, student directory, can't-hold drop zones | Columns, drop zones, load meters, keyboard model |
| `DraggableToken` | WeekBoard, session tiles, avatar tray | Pointer-event drag with keyboard fallback, built on framer-motion `drag` + layout animations (no new dependency) |
| `SessionTile` | week strip, assign screen 2 | Date, badge, drop target |
| `IconTile` / `IconTileGroup` | reasons, can't-come, can't-replace | Single-select, `check` animation, radio-group semantics |
| `PhraseChips` | assignment note, acknowledgement note | Quick phrases + inline "✎ add your own" |
| `StepperControl`, `SegmentedPills`, `TimeBandSlider`, `DateChip` | policy, period filter | Self-saving controls |
| `RangeCalendar` | closures | Drag-to-select range |
| `DropZone` | CSV import | Animated match preview |
| `KpiTile` (+ sparkline) | hub, school, reports | Hero-number rules from dataviz |
| `ChartCard` | reports, school | Title, legend, chart, Table view toggle, export |
| `HallIllustration` | empty states, board header | Inline SVG, `currentColor`, theme-aware |
| Reused | — | e-learning `ProgressRing`, `ProgressBar`, `Celebration`, `BottomActionBar`, `Skeleton`, `EmptyState`; `design/motion.ts` |

**Data the graphics need** (added to the payloads in §8.2):
- avatar URL and subject colour on every person;
- per-weekday load with avatar lists (`/my-days`, `/directory`, `/school/teachers`);
- 8-week assigned/voluntary series and the on-day streak (`/hub`);
- visit streak and badge flags (`/me`);
- trend and heatmap series (`/reports/trend`, `/reports/heatmap`).

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
| GET | `/reports/trend?period=&group=` | VIEW / own | Weekly assigned + voluntary series, assigned attendance rate per week (charts §6.9) |
| GET | `/reports/heatmap?period=` | VIEW / own | Visits by weekday × week (heatmap) |
| GET | `/people/avatars?ids=` | auth (scoped) | Avatar URL, initials and subject colour for a batch of users (for boards that load names lazily) |
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
| `components/officeHours/ui/*` | new | The interactive building blocks of §6.11 (Avatar, StatusRing, CountdownRing, WeekBoard, DraggableToken, SessionTile, IconTile, PhraseChips, StepperControl, SegmentedPills, TimeBandSlider, DateChip, RangeCalendar, DropZone, KpiTile, ChartCard, HallIllustration) and `ohTokens.css` (§6.3 colour tokens, light and dark) |
| `components/officeHours/OfficeHoursPage.tsx` | new | `/office-hours` entry: picks Teacher hub / Student page / Me–School switch by capability |
| `components/officeHours/teacher/DayBoard.tsx` | new | §6.4 Hall week board; reused by "✎" and by leadership *Set days* |
| `components/officeHours/teacher/TeacherHub.tsx` | new | §6.5 (Today hero, week strip with drag-to-replace, assigned strip, KPI tiles, weekly chart) |
| `components/officeHours/teacher/AssignFlow.tsx` | new | §6.6 card grid + session drop + reason tiles + live preview (availability logic ported from `StudentPicker`) |
| `components/officeHours/teacher/RegisterBoard.tsx` | new | §6.7 tap/swipe tiles, visitor bubbles, Finish bar (offline queue, keyboard and version-conflict merge ported from `RegisterSheet`) |
| `components/officeHours/teacher/ReplaceSession.ts` | new | Drag-to-replace logic and the "Can't replace" tray used by the week strip (§6.5) |
| `components/officeHours/student/StudentOfficeHours.tsx` | new | §6.8 hero, can't-come tiles, hall board, journey (replaces `MyOfficeHours.tsx`); parent mode |
| `components/officeHours/student/HallDirectory.tsx` | new | Week board of teacher avatars; also used in the band popover and Home |
| `components/officeHours/school/SchoolView.tsx` | new | Segmented pills Today · Teachers · Follow-up · Reports · ⚙ |
| `components/officeHours/school/{HallFloor,TeachersBoard,FollowUpBoard,PolicyCard,ClosureCalendar,ImportDrop}.tsx` | new | §6.9 (`ClosureCalendar` replaces the v1 Closures form) |
| `components/officeHours/reports/*` | rewrite | Chart cards of §6.9 on recharts (lazy), Person 360 timelines. `exports.ts` kept; `PeriodPicker` becomes `SegmentedPills` + `DateChip` |
| `components/officeHours/OfficeHoursBandCells.tsx`, `useOfficeHoursBand.ts` | adapt | Avatar-ring cells: teacher "◉ 3 assigned" (tap → register) or "+ Pick your days"; student highlighted assignment or teacher avatar stack; class grid avatar stack per day |
| `components/officeHours/offlineQueue.ts` | keep | — |
| `ohUi.tsx`, `AbsenceNoticeButton.tsx` | replace | By `ui/*` and the student hero's can't-come tiles |
| `ScheduleDrawer`, `ScheduleDetail`, `StudentPicker`, `RegisterSheet`, `MyOfficeHours`, `CheckIn`, `OfficeHoursHub`, `admin/*` | delete | — |
| `App.tsx` | edit | Routes: `/office-hours` (all), `/office-hours/reports/students/:id`, `/office-hours/reports/teachers/:id`. Remove `/office-hours/admin`, `/office-hours/schedules/:id` (redirect to `/office-hours`), `/office-hours/checkin`, `/my-office-hours` (redirect) |
| `components/ui/Sidebar.tsx`, `NavSearch.tsx` | edit | **One "Office Hours" item** for anyone holding any `OFFICE_HOURS_*` capability. Remove "Office Hours Oversight" |
| `activity/mis.catalog.json` + backend `catalogs/mis.json` | edit | New route/action names for analytics |
| `constants/permissions.ts` | keep | — |

**No new npm dependency.** Drag, layout animation and gestures use **framer-motion** 12, charts use **recharts** 3, and icons use **lucide-react**. All three are already installed.

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
| **P12** ✅ | Student motivation graphics (visit streak, "Regular visitor" badge) | **Confirmed 2026-10-04: yes.** Positive only: no rankings, no comparisons, never shown to other students. Leadership can switch them off in Policy. |
| **P13** ✅ | Profile photos on boards and tiles | **Confirmed 2026-10-04: yes.** Use existing MIS photos where present, initials otherwise. Shared screens (projector, hall floor) can switch to initials-only with one toggle. |

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

**P2 — Interactive building blocks + teacher UI (5 days)**
- [ ] `ui/*` building blocks (§6.11) + `ohTokens.css` (validated palette), with a kitchen-sink route in `DevKitchenSink` for visual review in both themes.
- [ ] `OfficeHoursPage`, `DayBoard`, `TeacherHub` (drag-to-replace week strip), `AssignFlow`, `RegisterBoard`.
- [ ] Band cells (teacher), Home teacher tile, single sidebar item, routes and redirects; delete v1 components.

**P3 — Student and parent (2 days)**
- [ ] `/directory`, `/me`, `/children`, `StudentOfficeHours` (hero, can't-come tiles, journey), `HallDirectory`, student band and Home tile.

**P4 — School view and reports (4 days)**
- [ ] `metrics.ts`, `reports.ts` (+ trend, heatmap), the School view: HallFloor, TeachersBoard (+ ImportDrop, CSV), FollowUpBoard, chart-card Reports, PolicyCard + ClosureCalendar.
- [ ] Escalation, digests, reminders and the scheduler jobs of §8.3.

**P5 — Integrations and docs (1 day)**
- [ ] Reminder Hub occurrences, analytics catalog, NotificationBell kinds.
- [ ] Tendo PR (link + test).
- [ ] Rewrite `docs/OFFICE_HOURS.md` around the policy, with a one-page teacher guide (declare, attend, assign, can't hold).
- [ ] Mark `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` as superseded at the top.

**P6 — Verify and release (1.5 days)**
- [ ] Browser e2e rewrite (§15.3), axe AA in light and dark at 390/768/1366, plus a screenshot review of every board and chart in both themes (label collisions, overflow).
- [ ] Load check (40 teachers × a term of sessions, 50 visits a day) with report queries under 0.5 s.
- [ ] Release per §16.2.

**Total: about 17 working days.** The interactive design adds about 3.5 days over a form-based UI, mostly in the shared building blocks, which later screens reuse.

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

- **Building blocks:**
  - `WeekBoard`/`DraggableToken`: keyboard pick-up / move / drop (Space, arrows, Enter) and tap-tap placement give the same result as a pointer drag; `aria-live` announces the move;
  - `StatusRing`: icon + label for each status, never colour alone;
  - `IconTileGroup`: radio-group semantics;
  - `CountdownRing`: before / during / after the band with a faked Kigali clock;
  - `ChartCard`: the Table view renders the same numbers as the chart;
  - every component renders with reduced motion.
- **DayBoard:**
  - the second token auto-confirms, and Undo restores;
  - a third token is refused with a shake;
  - a change shows "From Mon …" and floats affected weekly students with *Move* / *Release* targets.
- **TeacherHub:**
  - first-run vs declared states;
  - the hero button changes with time;
  - dragging a session tile shows same-week drop zones only, and dropping shows the move count and confirms;
  - dropping on the tray opens reason tiles.
- **AssignFlow:**
  - tapping selects into the tray;
  - a blocked card shakes and shows Message / Ask to release;
  - dropping the tray on a session tile selects it;
  - "Every week" reveals the duration slider;
  - the preview text matches the selection;
  - the partial-success animation states.
- **RegisterBoard:**
  - tap cycles ? → ✓ → ✕;
  - swipe right/left sets present/absent;
  - long-press opens Late/Excused;
  - recent-visitor bubbles add, and tap removes with undo;
  - the Finish bar shows the "→ absent" count;
  - "No one came · Finish" appears when empty;
  - an offline finish is queued.
- **StudentOfficeHours:**
  - the hero shows the reason and note;
  - a can't-come tile sends and offers undo;
  - the hall board orders own teachers first;
  - parent mode has no can't-come tiles.
- **School:**
  - HallFloor counters update from a refetch without a skeleton flash;
  - TeachersBoard: Nudge all, a missing avatar opens the mini board, and the compliance meters sort;
  - ImportDrop: a dropped CSV animates into Matched / Needs a look;
  - FollowUpBoard: drag or button to Acknowledged asks for a note chip;
  - PolicyCard controls self-save with undo;
  - ClosureCalendar: drag-select shows the affected-sessions count.
- **Charts:** the assigned/voluntary colours come from the tokens (no hard-coded hex in components); there is a legend for ≥ 2 series and one y-axis.
- **Sidebar:** one *Office Hours* item for teachers, students and leadership.

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
| Drag-and-drop is unfamiliar or hard on old phones | Every drag has a tap-tap and keyboard path; first-use coach marks ("Drag your tokens onto two days"); 6 px drag threshold so scrolling still works |
| Rich graphics slow low-end devices | recharts and celebration lazy-loaded; SVG rings, not canvas; virtualised visitor bubbles; reduced-motion path; load check on a mid-range Android in P6 |
| The v1 code path is needed back | 103 only renames v1 tables; drop only after one clean week |

---

*Next step: once §12 is confirmed and §16.1 returns empty counts, start P1 on this branch.*
