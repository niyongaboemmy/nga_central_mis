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
| **R2** | **Every instructor holds office hours on two days a week**, each 16:20–17:20. **Leadership decision (P1, 2026-10-04): teachers may choose 1, 2, 3 or more days**; two stays the suggested number. | "Every instructor holds office hours two days each week" · "Set two office-hours days per week" |
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
| Central object | `OfficeHourSchedule`: title, purpose, room, capacity, date window, 1–5 days, any number per teacher | **Availability**: one per teacher per term, **1–5 days of the teacher's choice** (2 suggested), fixed time and place |
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
OfficeHourPolicy         band 16:20–17:20 · location "Academy Hall" · min_days 1 · suggested_days 2 · deadline
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
- A teacher declares **any number of distinct weekdays from `min_days` (default 1) to 5** (P1). `suggested_days` (default 2, from the memo) is shown as a gentle hint, never enforced. The time and place come from the policy and are never entered.
- **First declaration:** the days take effect today if before the band, otherwise tomorrow. `submitted_at` is set.
- **Change of days (P3):** takes effect from **next Monday**, so this week stays as students were told. Implementation: close the old rows (`effective_to = Sunday`) and open new ones. Future sessions on dropped days with no visits are deleted. WEEKLY assignments on a dropped day are listed in the same dialog (move to a kept day / release).
- **Exempt:** leadership (MANAGE_ANY) can mark a teacher `EXEMPT` for the term (part-time, leave) with a note. Exempt teachers disappear from "missing".
- Leadership can also **set days for a teacher**, for example from the Google Form responses already collected (optional import, §12 P9).

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

Every task is a **direct manipulation** of a visual object, not a form to fill in. **Every action is a visible tap target first.** Drag, swipe and long-press are only *shortcuts* for the same action (§6.12). "Steps" counts the deliberate actions a user takes.

| Who | Task | Interaction | Steps | Where it starts |
|---|---|---|---|---|
| Teacher | **Declare my days** | Tap (or drag your avatar onto) the days you want on the **Hall week board** | 1 tap per day → autosaves | First visit; Home tile; band "+ Pick your days"; daily reminder |
| Teacher | **Take attendance** | **Tap who's here** (assigned tiles and visitor bubbles); everyone assigned and not tapped is absent at **Finish** | 1 screen | Today hero card; band cell; 16:25 push |
| Teacher | **Nobody came** | Visible **No one came** button on the Today card (shown when nobody is assigned) or on the Finish bar | 1 | Today hero card; register |
| Teacher | **Assign students** | Tap student cards → drop them on a **session tile** (or tap it) → tap a **reason tile** | 2 screens | Assign button; register tile ⋯; Person 360; suggestion card |
| Teacher | **Can't hold a session** | Tap **Can't hold** on the session tile → tap a day tile of the same week (or a reason tile). Desktop shortcut: drag the tile | 2 taps | Week strip; Today ⋯ |
| Teacher | **Release a student** | Tap ✕ on the assigned card (swipe left is a shortcut on phones), with Undo | 1 | Assigned avatar strip |
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
| Day checkboxes / multi-select | **Tap-to-join day columns on a week board** (avatar flies in; drag is a desktop shortcut) | Declaring days |
| Student dropdown / search form | **Student card grid** with photos, availability rings and tap-to-select; one floating search pill that filters as you type | Assigning |
| Date picker | **Session tiles** on a horizontal week strip | Choosing which session |
| Reason select | **Icon tiles** (big, illustrated, single tap) | Assignment reason, "I can't come", "can't replace" reason |
| Free-text message box | **Quick-phrase chips** ("Bring your exercise book", "Bring your laptop") + an optional one-line "✎ add your own" that expands in place | Assignment message |
| Status radio buttons | **Tap who's here** on avatar tiles (ring fills ✓); the rest are absent at Finish; ⋯ on a tile for Late / Excused | Register |
| Cancel / reschedule form | **Can't hold** on the session tile → day tiles of the same week (drag as a shortcut) | Can't hold it |
| Settings form | **Policy card**: dual-thumb time band slider on a mini timeline, steppers, toggles, calendar popover chips | Leadership policy |
| Closure date-range form | **Drag across days** on a month calendar | Closures |
| File-upload form | **Drop zone** with an animated match preview | Google Form import (optional) |

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
│  [hall line-art]  Pick your office-hours days (school suggests 2)    │
│                   16:20–17:20 · Academy Hall    Due Mon 5 Oct  ◔ 2d  │
│                                                                      │
│   Tap a day to join it — your avatar appears there   ◉ 2 days ✓      │
│                                                                      │
│  ┌── Mon ──┐ ┌── Tue ──┐ ┌── Wed ──┐ ┌── Thu ──┐ ┌── Fri ──┐          │
│  │ ◉◉◉◉◉   │ │ ◉◉◉◉◉◉◉ │ │ ◉◉◉     │ │ ◉◉◉◉◉◉  │ │ ◉◉      │ ← avatars│
│  │ ▮▮▮▮▯▯  │ │ ▮▮▮▮▮▮▯ │ │ ▮▮▯▯▯▯  │ │ ▮▮▮▮▮▯  │ │ ▮▯▯▯▯▯  │ ← load   │
│  │  5      │ │  7 busy │ │  3      │ │  6      │ │  2 quiet│          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

- Each **day column** shows the teachers already on it as an overlapping **avatar stack** (tap to expand), plus a **load meter** in the sequential blue ramp, labelled with the count and "busy"/"quiet".
- **Tap a column** to join it: your avatar flies in and the meter grows with a `fill` animation. Tap again to leave. On desktop you can also **drag your avatar** from one column to another to swap a day. Keyboard: arrow keys move between columns, Space/Enter toggles.
- **Any number of days, 1 to 5** (P1). A small counter chip reads "◉ 2 days ✓" at the suggested number and "School suggests 2" otherwise, as information, never a block. Removing your last day is refused with a gentle shake and "Keep at least one day".
- **Autosave.** Each change saves after a short pause (quick multi-taps become one save). A toast confirms "Tue, Wed & Thu saved · Undo". There is no Save button. `Celebration` plays once, on the first declaration.
- **Changing days later:** the same board, with your avatar already in your columns. Changes made mid-term show a small inline banner, "From Mon 13 Oct". If weekly assignments sit on a day you leave, their student avatars float above the board with two drop targets: *Move to <another of your days>* / *Release*.

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

- **Today hero card.** When nobody is assigned, a visible secondary **No one came** button sits beside *Take attendance*. A countdown ring before 16:20, a pulsing "In session" ring between 16:20 and 17:20, and a green ✓ "Recorded" afterwards. The assigned students show as an avatar stack with their "I can't come" badges. The primary button changes with time: *Take attendance* → *Finish register* → *Edit*.
- **Week strip.** Each session tile shows an assigned-count badge and a visible **Can't hold** action. Tapping it opens a bottom sheet (popover on desktop) with the **other days of the same week** as day tiles (with hall load and "your day" marks), plus reason tiles for *Can't replace* (*Sick* · *Official duty* · *School event* · *Other*). **The change applies at once, with Undo.** Students are notified only when the 10-second undo window closes (§8.1 outbox). On desktop the tile can also be **dragged** onto a glowing same-week day or the *Can't replace* tray, as a shortcut for the same action.
- **Assigned strip.** Horizontal avatar cards (name, day, reason icon) with a visible ✕ **Release** (swipe left is a phone shortcut) and Undo. Tapping a card opens a mini profile with their visit-history sparkline.
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
- The result animates per student: cards that were assigned turn green ✓, and any card blocked in the meantime shakes and stays with its actions. The toast reads **"2 assigned · Undo"**. Students' notices leave only after the 10-second undo window (outbox), so a mistaken assignment never reaches a phone.

### 6.7 Register: tap tiles, not rows (drawer, full screen on phones)

```
 Tue 7 Oct · Academy Hall                         ◕ 7/9 marked   ● saved
 ┌─────────────────────────────────────────────────────────────────────┐
 │ ASSIGNED                                                (All ✓)     │
 │  ┌─────┐  ┌─────┐  ┌─────┐                                          │
 │  │◉✓   │  │◉    │  │◉    │   tap = here ✓ (tap again = undo)       │
 │  │Aline│  │Eric │  │Ivan │   ⋯ on tile: Late ⏱ · Excused ☂ · Absent │
 │  └─────┘  └─────┘  └☂────┘   ☂ badge = "I can't come" notice         │
 ├─────────────────────────────────────────────────────────────────────┤
 │ VISITORS   (🔍 type a name…)    Recent: (◉Jean)(◉Grace)(◉Paul) + tap   │
 │  ◉Jean ✓  ◉Grace ✓  ◉Sam ✓  …   (orange ring = voluntary)            │
 └─────────────────────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────────────────────┐
  │ ◕ 1 here · 2 not here → absent · 9 visitors          [ Finish ✓ ]   │
  └─────────────────────────────────────────────────────────────────────┘
```

- **Assigned tiles: tap who's here.** Tapping a tile marks the student **here** (green ring ✓ with `check` and a light haptic tick where supported). Tap again to undo. Anyone not tapped is **absent at Finish** (R11), so the teacher only touches the students in front of them. A visible **⋯** on each tile offers *Late ⏱*, *Excused ☂* (pre-selected when the student sent "I can't come") or an explicit *Absent*. Swipe right is a phone shortcut for "here". There is no tap-cycling, so a status can't be reached by accident.
- A **progress ring** in the header fills as students are marked.
- **Visitors.** Recent-visitor **bubbles** add with one tap. Search results appear as avatar bubbles too (no list rows); Enter adds the first. Visitors wear the **orange** voluntary ring, and tapping a visitor removes them, with undo.
- **Finish** bar: a live summary with the "→ absent" count. Finishing plays a short tick-burst. A perfect on-day week triggers `Celebration` once.
- **No one came:** with no assigned students and no visitors, the Finish button reads *"No one came · Finish"*.
- Keyboard: arrows move between tiles, Space toggles here, 1/2/3/4 set Present/Absent/Late/Excused, `/` focuses search, ⌘↵ finishes. Works offline (queue), with an "Offline · will send" chip.

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
 COMPLIANCE   avatar · days ◉◉◉ 3 · held ▮▮▮▮▯ 80% · on-day ▮▮▮▮▮ 100% · replaced ▮▮▯ 2/3   (sortable, meters)
 ⋯  Import Google Form (optional, drop zone) · Download CSV
```

- The declaration **progress ring** with **Nudge all** (bell + push), then a burst of "sent" ticks.
- **Hall load** column chart in one sequential hue. The tooltip lists the teachers on that day; there is a Table view.
- The **missing avatar wall**. Tapping an avatar opens a mini week board to **set days** for that teacher (the same drag interaction), plus *Exempt* and *Nudge*.
- **Compliance list:** one card per teacher with their **number of days** (dots) and three inline **meters** (held, on-day, replaced), sortable by tapping a header. A filter chip "Fewer than suggested" lists teachers below `suggested_days`, as information only.
- **Import (optional, P9):** drop the Google Form CSV. Rows animate into *Matched ✓* / *Needs a look* columns. Tap a "needs a look" row to pick the right teacher from avatar suggestions, then **Apply**.

**Follow-up: a board, not a list**

```
  Level 1 (6)            Level 2 (2)            Acknowledged (14)
 ┌──────────────┐      ┌──────────────┐       ┌──────────────┐
 │◉ Eric · S4B   │ ───▶ │◉ Ivan · S5    │ ───▶  │◉ ...          │
 │ ✕✕ 2 in a row │      │ ✕✕✕ 3 in a row│       │ note: "met..."│
 │ ▁▁▅▁ history  │      │ [Refer] [Assign]│     └──────────────┘
 └──────────────┘      └──────────────┘
```

Each card shows an absence-history dot strip (✓/✕ per assigned session). Tap the visible **✓ Acknowledge** on a card (dragging it to the column is a desktop shortcut) to add a note chip ("Met with student", "Parent called", "✎ other"). The *Refer* button opens the prefilled Tendo discipline form, and *Assign* opens the Assign drawer for that student.

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
- **Closures:** a month calendar where leadership **taps a start day and an end day** (or drags across days as a shortcut) to create a closure. Because this cancels many sessions at once, it is the one place that keeps an explicit confirm step. A popover then asks for a label chip (*Holiday* · *Exams* · *Event* · ✎) and shows "4 sessions affected" before confirming.

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
| `DropZone` | CSV import (optional) | Animated match preview |
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

### 6.12 Modern-app UX check (what every screen must pass)

This section checks the design against the conventions users already know from modern apps (Material 3, Apple HIG, the Laws of UX, WCAG 2.2 AA). It also records what this revision changed to comply. Every PR in P2–P4 is reviewed against this table.

| Principle | What it means here | How the design meets it |
|---|---|---|
| **Visible first, gestures accelerate** (HIG, Material) | No action may exist only as a drag, swipe or long-press | Every drag/swipe/long-press has a visible button: *Can't hold*, ✕ Release, ✓ Acknowledge, ⋯ on register tiles, No one came. *Changed in this revision:* removed long-press-only and drag-only paths |
| **Undo over confirm** (Material, Nielsen #3) | Act immediately and let the user take it back; confirm only for bulk, high-impact actions | Days, assignments, releases, replacements, acknowledgements and policy changes apply at once with **Undo**. Notifications wait in an outbox until the 10 s undo window closes (§8.1). Only closures (many sessions cancelled) keep a confirm step |
| **Recognition over recall** (Nielsen #6) | Show, don't make users remember | Photos/avatars, recent visitors, suggested students, quick-phrase chips, session tiles with dates, live notice preview, the hall board showing who's where |
| **Hick's law** | Few choices per moment | One primary action per screen (Take attendance / Assign / Finish). At most 6 reason tiles. Rare options behind ⋯ |
| **Fitts's law and thumb zone** | Big, reachable targets | Tiles ≥ 64 px, controls ≥ 44 px (WCAG 2.5.8 needs 24 px). On phones the primary action sits in the bottom bar within thumb reach, respecting safe-area insets |
| **Doherty threshold** | Feedback under 100 ms, completion under 400 ms | Optimistic UI on every tap. Server targets p95 < 300 ms for `/hub` and register saves. Interaction to Next Paint (INP) < 200 ms on a mid-range Android |
| **Visibility of system status** (Nielsen #1) | Users always know what's happening | "Saved ✓ 16:41", "Offline · will send", a countdown ring, a live pulse during the band, a progress ring while marking, sending ticks after Nudge. Screen readers hear `aria-live` status messages (WCAG 4.1.3) |
| **Error prevention** (Nielsen #5) | Impossible choices aren't offered | Only same-week days for a replacement; blocked students shown, not hidden; the last day can't be removed; the register opens only from 16:05 |
| **Jakob's law and consistency** | Behave like apps people already use, and like the rest of MIS | Bottom sheets on phones and side drawers on desktop; the standard MIS shell (sidebar, academic period selector, bell); the same tile/ring components on every screen; Assigned blue and Voluntary orange everywhere |
| **Progressive disclosure** | Simple first, detail on demand | Late/Excused, history, reports and policy all sit one tap deeper. First visit shows only the day board |
| **Discoverable gestures** | Users learn shortcuts without being blocked | One-time coach marks ("Tap who's here", "Tip: drag a session to move it"), dismissible and remembered per user |
| **Forgiving input and no redundant entry** (WCAG 3.3.7) | Never ask twice | Autosave, offline register queue, last-used reason and phrase pre-highlighted, students' "I can't come" pre-fills Excused, weekly assignments repeat automatically |
| **Accessibility, WCAG 2.2 AA** | Usable by everyone | 2.5.7 a single-pointer alternative to every drag; 2.4.11 focus never hidden under sticky bars (`scroll-padding`); 1.4.1 icons + labels with colour; 2.3.3 reduced motion; contrast checked; keyboard maps for board and register; axe in CI e2e |
| **Mobile-first PWA** | Teachers use phones in the hall | Designed at 390 px first. Installable, push notifications, offline register, light haptics on marking (off with reduced motion), pull-to-refresh on hub and hall floor |
| **Calm, purposeful motion** | Motion explains change, never decorates | Named motions from `design/motion.ts` (≤ 320 ms). `Celebration` only on milestones (first declaration, perfect week), **never during the register** |
| **Plain, friendly content** | Short, human copy | Sentence case, verbs on buttons ("Assign 2", "Finish"), Kigali-style dates ("Tue 7 Oct"), one help line per screen. All strings live in one `copy.ts` so French/Kinyarwanda can be added later |
| **Helpful empty and error states** | Never a dead end | Hall illustration + one action ("Pick your days"). Errors say what to do ("Mr K already assigned Grace — ask to release"), never codes |
| **Dark mode designed, not inverted** | Comfortable at night | Own dark tokens (§6.3), validated chart colours, photos with a subtle ring so they don't glow |
| **Performance budget** | Fast on school Wi-Fi | Office-hours route chunk ≤ 150 KB gzip before recharts; recharts + celebration lazy-loaded; avatars lazy with initials fallback; LCP < 2.5 s on a mid-range Android; skeleton only on first load |
| **Privacy by design in UI** | Show only what each viewer needs | The directory has no student data; the initials-only toggle for projected screens; reasons hidden from parents unless escalated (P5); badges never compared |

**Usability validation (added to P2 and P3).** Before the screens are wired to real data, run the clickable building blocks with 3 teachers and 3 students:
- a 5-second test of the hub ("what do you do next?");
- task success for declare / assign / take attendance / can't hold, with a target of ≥ 90% unaided and each task under 30 s;
- a quick System Usability Scale (SUS) questionnaire, aiming for ≥ 80.

Fix anything that fails before P4.

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
  min_days TINYINT DEFAULT 1,              -- P1: teacher chooses min_days..5
  suggested_days TINYINT DEFAULT 2,        -- the memo's number, shown as a hint only
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

OfficeHourOutbox (                                     -- notices wait out the undo window
  outbox_id BIGINT PK AI, event VARCHAR(40), subject_key VARCHAR(80),   -- e.g. 'assignment:812'
  payload JSON, send_after DATETIME, sent_at DATETIME NULL, cancelled_at DATETIME NULL,
  INDEX (send_after, sent_at, cancelled_at))

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
| `teacherDays.ts` | `getMyDays`, `saveMyDays` (first declaration vs change-from-next-Monday), `setDaysFor` (leadership), `setExempt`, `hallLoad(term, week)`, `importDays(csvRows, dryRun)` (optional, P9), `effectiveDaysOn(date)` |
| `sessions.ts` | `ensureSessions(teacherIds?, from, to)` (closure-aware, idempotent through the unique key), `sessionsFor(viewer, range)`, `cantHold(sessionId, {replacementDate} \| {reason}, message)` |
| `assignments.ts` | `candidates(actor, query)` (teachable students + availability state: free / with you / assigned by X), `assign(actor, input)` (partial success: `assigned[]`, `blocked[]` with holder, `ineligible[]`), `release`, `askToRelease`, `completeForSession(sessionId)`, `suggestions` (moved from v1) |
| `register.ts` | `openRegister` (snapshot assigned rows), `saveRegister(sessionId, rows, version)` (auto-absent, late flag, history, HELD, completes ONCE assignments, triggers escalation), `noOneCame`, `recentVisitors(teacherId)` |
| `views.ts` | `teacherHub(actor, term)`, `studentPage(studentId, term)` (assignment + reason + directory + history), `directory(term, weekStart, viewer)`, `band(viewer, weekStart)` |
| `metrics.ts` | One place for formulas: assigned attendance rate, presence rate, voluntary visits, unique visitors, consistency band, teacher compliance |
| `reports.ts` | Scoped datasets on the period engine: summary, breakdown (teacher / subject / class / grade / weekday / reason), consistency, student 360, teacher 360, declarations, compliance, daily sheet |
| `escalation.ts` | Kept logic, re-pointed to `OfficeHourVisit` (assigned only) |
| `notify.ts` / `events.ts` / **`outbox.ts`** | Event texts of §10; same delivery helper. Student-facing notices for undoable actions (assign, release, replace, not-replaced) are written to `OfficeHourOutbox` with `send_after = now + 10 s`. `undo` cancels the action and its outbox rows in one transaction. A 5-second scheduler tick delivers due rows exactly once |
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
| POST | `/undo/:token` | the actor who made the change, within 10 s | Reverses an assignment batch, release, replacement or acknowledgement; cancels its outbox notices. Tokens come back in each undoable response |
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
| POST | `/school/teachers/import?dry_run=1` | MANAGE_ANY | Google Form CSV → days (optional, P9) |
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
| Outbox delivery | every 5 s | Send due, uncancelled notices (idempotent per `outbox_id`) |
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
| `components/officeHours/teacher/TeacherHub.tsx` | new | §6.5 (Today hero, week strip with Can't hold, assigned strip, KPI tiles, weekly chart) |
| `components/officeHours/teacher/AssignFlow.tsx` | new | §6.6 card grid + session drop + reason tiles + live preview (availability logic ported from `StudentPicker`) |
| `components/officeHours/teacher/RegisterBoard.tsx` | new | §6.7 tap-who's-here tiles, visitor bubbles, Finish bar (offline queue, keyboard and version-conflict merge ported from `RegisterSheet`) |
| `components/officeHours/teacher/CantHoldSheet.tsx` | new | Same-week day tiles + reason tiles (§6.5); the drag shortcut on the week strip calls the same action |
| `components/officeHours/ui/useUndoToast.ts`, `copy.ts`, `CoachMark.tsx` | new | Undo toasts bound to server undo tokens; all strings in one place; one-time gesture tips (§6.12) |
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
| Days declared | Teacher (toast); leadership digest | "Tue, Wed & Thu, 16:20–17:20, Academy Hall — your students can see this now." |
| Days changed | Leadership (digest + Teachers view) | "Ms A: Tue & Thu → Mon & Thu from 13 Oct" |
| Declaration missing | Missing instructors, daily | "Pick your office-hours days — due Mon 5 Oct." |
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

**All decisions are confirmed (2026-10-04).** P1, P5, P6, P9, P12 and P13 were decided explicitly; the rest follow the recommendation. All are policy settings or small changes.

| # | Question | Recommendation |
|---|---|---|
| **P1** ✅ | How many days does a teacher hold? | **Confirmed 2026-10-04: the teacher chooses 1, 2, 3 or more days** (`min_days = 1`, max 5). The memo's two is shown as a suggestion (`suggested_days = 2`). Leadership can still exempt or set days for a teacher. |
| **P2** ✅ | Limit how many teachers share one weekday in the hall? | **Confirmed 2026-10-04 (recommendation).** **No cap; show the load live** so teachers balance. Add a soft cap later if a day overflows. |
| **P3** ✅ | May teachers change their days mid-term? | **Confirmed 2026-10-04 (recommendation).** **Yes, effective next Monday**, leadership informed. Weekly assignments on a dropped day are moved or released in the same dialog. |
| **P4** ✅ | Statuses | **Confirmed 2026-10-04 (recommendation).** **Present / Absent** up front; **Late / Excused** under ⋯ (Tendo-compatible). |
| **P5** ✅ | The reason is shown to the student (R9). Shown to parents too? | **Confirmed 2026-10-04: students see the reason; parents only when an escalation reaches them.** |
| **P6** ✅ | If the teacher records no register, are assigned students absent? | **Confirmed 2026-10-04: no.** It is a missing register (teacher compliance). R11 applies when a register is recorded. |
| **P7** ✅ | On replacement, notify all the teacher's students or only assigned ones? | **Confirmed 2026-10-04 (recommendation).** **Only assigned students.** Everyone else sees the change in the directory and timetable. |
| **P8** ✅ | Default assignment mode | **Confirmed 2026-10-04 (recommendation).** **Once (next session)**; "Every week until…" one tap away (default 4 weeks). |
| **P9** ✅ | Teachers already sent days through the **Google Form** by 05 Oct. | **Confirmed 2026-10-04: optional.** Built last (P4b) and skippable. When used, leadership drops the form's CSV once (School → Teachers → Import) so nobody enters days twice; teachers can still adjust. Without it, teachers declare their own days on the board. |
| **P10** ✅ | Register edit window | **Confirmed 2026-10-04 (recommendation).** **On the day** normally; the next day is accepted and flagged *late*; after 2 days only leadership. |
| **P11** ✅ | Self check-in by QR (v1 feature) | **Confirmed 2026-10-04 (recommendation).** **Not in v2.** Teachers record visits with quick-add. Revisit a single hall kiosk if typing proves slow. |
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
- [ ] *(Optional, P9)* Get the Google Form response export (columns: teacher email/name, days) if the import will be built.
- [ ] Re-check the next free migration number (103 expected) before merging.

**P1 — Data and core services (3 days)**
- [ ] `103_office_hours_v2.sql`, the new `officeHoursSchema.ts`, and `test/officeHoursFixtures.ts` rewritten.
- [ ] `outbox.ts` + undo tokens.
- [ ] `policy.ts`, `access.ts`, `teacherDays.ts`, `sessions.ts` (ensure, can't hold), `assignments.ts` (lock, partial success, complete, release, ask), `register.ts` (auto-absent, late, no-one-came, history).
- [ ] Routes for teacher and student flows; delete v1 services and routes.

**P2 — Interactive building blocks + teacher UI (5 days)**
- [ ] `ui/*` building blocks (§6.11) + `ohTokens.css` (validated palette), with a kitchen-sink route in `DevKitchenSink` for visual review in both themes.
- [ ] **Usability test** of the building-block prototype with 3 teachers (§6.12) and fixes.
- [ ] `OfficeHoursPage`, `DayBoard`, `TeacherHub` (Can't-hold sheet + drag shortcut), `AssignFlow`, `RegisterBoard` (tap who's here).
- [ ] Band cells (teacher), Home teacher tile, single sidebar item, routes and redirects; delete v1 components.

**P3 — Student and parent (2 days, including a 3-student usability check)**
- [ ] `/directory`, `/me`, `/children`, `StudentOfficeHours` (hero, can't-come tiles, journey), `HallDirectory`, student band and Home tile.

**P4 — School view and reports (4 days)**
- [ ] `metrics.ts`, `reports.ts` (+ trend, heatmap), the School view: HallFloor, TeachersBoard (+ CSV download), FollowUpBoard, chart-card Reports, PolicyCard + ClosureCalendar.
- [ ] Escalation, digests, reminders and the scheduler jobs of §8.3.

**P4b — Optional: Google Form import (0.5 day, P9)**
- [ ] `importDays` + `POST /school/teachers/import`, `ImportDrop` in TeachersBoard. Skip entirely if leadership doesn't need it.

**P5 — Integrations and docs (1 day)**
- [ ] Reminder Hub occurrences, analytics catalog, NotificationBell kinds.
- [ ] Tendo PR (link + test).
- [ ] Rewrite `docs/OFFICE_HOURS.md` around the policy, with a one-page teacher guide (declare, attend, assign, can't hold).
- [ ] Mark `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` as superseded at the top.

**P6 — Verify and release (1.5 days)**
- [ ] Browser e2e rewrite (§15.3), axe AA in light and dark at 390/768/1366, plus a screenshot review of every board and chart in both themes (label collisions, overflow).
- [ ] Load check (40 teachers × a term of sessions, 50 visits a day) with report queries under 0.5 s.
- [ ] Release per §16.2.

**Total: about 18 working days (the usability rounds and the undo outbox add about one day), plus 0.5 day if the optional import (P4b) is built.** The interactive design adds about 3.5 days over a form-based UI, mostly in the shared building blocks, which later screens reuse.

---

## 15. Testing

### 15.1 Backend (vitest + supertest, `src/__tests__/officeHoursV2*.test.ts`)

- **Policy:** validation (band order, `min_days` 1–5, `suggested_days` 1–5, deadline date).
- **Teacher days:**
  - 1 to 5 distinct days accepted; 0 days, duplicates, weekends or fewer than `min_days` → 400;
  - first save is effective today or tomorrow around the band;
  - a change is effective next Monday and keeps this week's sessions;
  - sessions on dropped days with visits are kept, those without are removed;
  - `affected_weekly` is listed;
  - exempt removes the teacher from "missing";
  - leadership set-days records `submitted_by`;
  - *(optional P9)* CSV import dry-run writes nothing, matches by email, and reports unknown teachers and invalid days.
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
- **Outbox and undo:** an undo within 10 s reverses the change and cancels the notices; an undo after 10 s → 410; the outbox delivers each row once, even across two scheduler ticks or a restart.
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
  - tapping a day toggles it and autosaves after a short pause (one save for quick multi-taps); Undo restores the previous set;
  - any count from 1 to 5 is accepted; removing the last day is refused with a shake and "Keep at least one day";
  - the suggestion hint reads "✓ 2 days" at the suggested number and "School suggests 2" otherwise, without blocking;
  - a change shows "From Mon …" and floats affected weekly students with *Move* / *Release* targets.
- **TeacherHub:**
  - first-run vs declared states;
  - the hero button changes with time;
  - **Can't hold** opens same-week day tiles only; choosing one applies at once with Undo, and no notice is sent until the undo window closes;
  - the reason tiles complete a not-replaced cancel;
  - the desktop drag shortcut produces the same result as the taps.
- **AssignFlow:**
  - tapping selects into the tray;
  - a blocked card shakes and shows Message / Ask to release;
  - dropping the tray on a session tile selects it;
  - "Every week" reveals the duration slider;
  - the preview text matches the selection;
  - the partial-success animation states;
  - Undo within 10 s cancels the assignment, and the outbox never sends the notice.
- **RegisterBoard:**
  - tapping a tile marks it here, and tapping again clears it;
  - ⋯ sets Late / Excused / Absent; an "I can't come" student pre-selects Excused in ⋯;
  - Finish marks every untapped assigned tile absent, matching the footer count;
  - swipe right is equivalent to a tap;
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
  - *(optional P9)* ImportDrop: a dropped CSV animates into Matched / Needs a look;
  - FollowUpBoard: the ✓ button (and the drag shortcut) asks for a note chip;
  - PolicyCard controls self-save with undo;
  - ClosureCalendar: tap-start/tap-end and drag both select a range, and confirm shows the affected-sessions count.
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
8. Leadership checks Teachers (A declared, C missing → remind; leadership sets C's days on the mini board), then Today, Follow-up and Reports (the assigned/voluntary split), and exports CSV.
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
4. Leadership sets `declaration_deadline` (and, if P9 was built, imports the Google Form CSV).
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
| Teachers already used the Google Form | Declaring on the board takes seconds; the optional CSV import (P9) avoids re-entry if leadership wants it |
| Cached PWA still calls removed v1 endpoints | Service-worker cache bump on release; old URLs redirect to `/office-hours` |
| Tendo lane breaks on the new shape | `/me` and `/sessions` keep compatible fields; Tendo PR ships in the same release; lane test updated |
| Drag-and-drop is unfamiliar or hard on old phones | Every drag has a tap-tap and keyboard path; first-use coach marks ("Tap the days you'll be in the hall"); 6 px drag threshold so scrolling still works |
| Rich graphics slow low-end devices | recharts and celebration lazy-loaded; SVG rings, not canvas; virtualised visitor bubbles; reduced-motion path; load check on a mid-range Android in P6 |
| The v1 code path is needed back | 103 only renames v1 tables; drop only after one clean week |

---

*Next step: once §12 is confirmed and §16.1 returns empty counts, start P1 on this branch.*
