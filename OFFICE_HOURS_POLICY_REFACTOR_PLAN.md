# Office Hours v2 — Final Implementation Plan

**Status:** FINAL. Approved for implementation; all decisions confirmed on 2026-10-04 (§12).
**Branch:** `feat/office-hours-policy-refactor` (from `origin/main` e84056cb)
**Source of truth:** *Memo: Office Hours Policy* (Administration → all staff, dated 01 Oct 2026, effective 05 Oct 2026), file `NGA-Office-Hours-Policy.pdf`. Where leadership decided differently from the memo, §12 records it.
**Replaces:** the v1 design in `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` (MIS #53, migration 102). v1 was deployed but **never used in production**, so v2 is built from the policy, not adapted from v1.
**Audience:** developers and Claude Code sessions doing the work. School leadership: §1, §5 and §12.

---

## Contents

1. What the policy requires (R1–R12)
2. Why v1 is replaced, not patched
3. What we keep from v1 and what we delete
4. Domain model and rules
5. Workflows
6. Interactive UI/UX design
7. Data model: migration `103_office_hours_v2.sql`
8. Backend: services, API, jobs, access
9. Frontend: file map
10. Notifications
11. Metrics, reports and follow-up
12. Decisions (all confirmed)
13. Integrations
14. Phases and task checklist
15. Testing
16. Rollout and risks

---

## 1. What the policy requires

| # | Rule | Memo text |
|---|---|---|
| **R1** | Office hours run **every weekday, 16:20–17:20, in the Academy Hall**. The time and place are fixed. | "take place daily from 4:20 PM to 5:20 PM in the Academy Hall" |
| **R2** | Every instructor holds office hours on set days each week. The memo says two; **leadership decided teachers choose 1–5 days, with 2 suggested** (P1). | "Every instructor holds office hours two days each week" |
| **R3** | The instructor **shares the days with all their students** and **sends them to the administration** by the deadline. | §1 bullet 2 |
| **R4** | The instructor **holds them as scheduled**. | §1 bullet 3 |
| **R5** | To cancel, the instructor **tells students in advance** and **offers another time that week**. | §1 bullet 3 |
| **R6** | **Voluntary:** a student comes on their own to ask for help. | §2 |
| **R7** | **Mandatory:** the instructor directs a student to attend, **assigned through MIS**. | §2, §3 |
| **R8** | **No student is sent to two instructors at once.** A student who already has an assignment **cannot be assigned again**. If MIS blocks the instructor, they **coordinate with the instructor who assigned the student**. | §3 |
| **R9** | When assigning, **tell the student the day, time, place and reason**. | §3 |
| **R10** | **Record attendance for every session, on the day**, noting whether each visit was **voluntary or assigned**. | §4 |
| **R11** | **Assigned students who don't attend are marked absent.** | §4 |
| **R12** | Administration tracks **who attends consistently** and **follows up students who miss assigned sessions**. | §4 |

**What this means for the design:**
- Office hours are **teacher availability**: "Ms A is in the Academy Hall on Tue & Thu." A session exists on every declared day, whether or not anyone is assigned.
- **Voluntary visits are the normal traffic.** An assignment is an exception placed on top of availability.
- **Declaring days in MIS *is* "sending them to the administration"** (R3). MIS replaces the memo's Google Form.
- "Every session" includes sessions where nobody came. There is a one-tap **No one came**.

---

## 2. Why v1 is replaced, not patched

| Topic | v1 | v2 (policy) |
|---|---|---|
| Central object | `OfficeHourSchedule`: a teacher-built group of named students, with title, purpose, room, capacity and date window, any number per teacher | **Teacher days**: one set per teacher per term, 1–5 weekdays, fixed time and place |
| A session exists when… | …a schedule (student group) exists | …a declared day arrives, always |
| Voluntary visits | An add-on inside a schedule | **Primary** register action |
| Assigning | Schedule → draft → students → publish (3 screens, ~12 inputs) | **Assign**: who → session and reason (2 screens, no typing) |
| Double-assignment lock | (term, student, weekday), two modes | **One active assignment per student**: PK (term, student) |
| Reason | Hidden from students | **Shown to the student** (R9) |
| Cancel | Cancel and Move as separate actions, any date | **Replace in the same week**, or record why not (R5) |
| Register window | 7 days | **On the day**; later saves flagged *late* |
| Unmarked assigned students | Left "not marked" | **Absent at Finish** (R11) |
| Sharing with students | Only assigned students see anything | **Hall directory** of every teacher's days (R3) |
| Submission to admin | None | **Declarations board**: deadline, reminders, CSV |
| Navigation | *Office Hours* and *Office Hours Oversight* | **One *Office Hours* menu**, whose view depends on the user's role |

Every row changes what the data means, not just how it looks. Production holds no office-hours data (the owner said so; the check in §16.1 confirms it), so a clean model costs no data migration.

---

## 3. What we keep from v1 and what we delete

### 3.1 Kept

| Piece | Where | In v2 |
|---|---|---|
| Kigali clock, `todayYmd`, `OFFICE_HOURS_FAKE_NOW`, `withDeadlockRetry`, `officeHoursEnabled/Ready`, term helpers | `services/officeHours/common.ts` | Unchanged (`officeHoursReady` now checks `OfficeHourPolicy`) |
| `SchoolClosure` table + `closures.ts` | migration 102 | Unchanged. Closure days produce no sessions; the UI becomes `ClosureCalendar` |
| Period engine | `period.ts` | Unchanged. The picker UI becomes segmented pills |
| Report export (CSV/Excel/PDF) | `reports/exports.ts` | Unchanged |
| Bell + push delivery helper (independent of Reminder Hub opt-in) | inside `notify.ts` | Called by the outbox (§8.1) |
| Escalation ladder logic, digest framework, scheduler loop | `escalation.ts`, `digests.ts`, `scheduler.ts` | Re-pointed to v2 tables |
| Offline register queue | `offlineQueue.ts` | New payload |
| Suggestions (Task Mentor standing + history) | `suggestionsFor` in `modern.ts` | Moves to `assignments.ts` |
| Motion and visual primitives | `design/motion.ts`; e-learning `ProgressRing`, `ProgressBar`, `Celebration`, `BottomActionBar`, `Skeleton`, `EmptyState` | Used by the building blocks (§6.11) |
| Permissions `OFFICE_HOURS_MANAGE_OWN / MANAGE_ANY / VIEW / VIEW_SELF / CONFIGURE` + preset links | migration 102, `access/manifest.ts` | Same names; meanings in §8.4 |
| Kill switch, scheduler flag | `OFFICE_HOURS_ENABLED`, `OFFICE_HOURS_SCHEDULER` | Unchanged |

### 3.2 Deleted

- **Tables (archived by 103 as `v1_*`, dropped by a later migration):**
  - `OfficeHourSchedule`, `OfficeHourScheduleDay`;
  - `OfficeHourAssignment`, `OfficeHourStudentLock`;
  - `OfficeHourSession`, `OfficeHourAttendance`, `OfficeHourAttendanceHistory`;
  - `OfficeHourTransferRequest`, `OfficeHourEscalation`, `OfficeHourAbsenceNotice`;
  - the v1 `OfficeHourSetting`.

  The concepts behind escalations and absence notices continue as **new v2 tables** with the same names (§7.2).
- **Backend:**
  - deleted outright: `schedules.ts`, `transfers.ts`, `live.ts` (SSE register), and QR check-in and rollover in `modern.ts`, along with their routes;
  - rewritten on v2 tables: `assignments.ts`, `sessions.ts`, `register.ts`, `views.ts`, `metrics.ts`, `reports.ts`, `admin.ts`, `reconcile.ts` and `settings.ts` (which becomes `policy.ts`).
- **Frontend:**
  - components: `ScheduleDrawer`, `ScheduleDetail`, `StudentPicker`, `RegisterSheet`, `MyOfficeHours`, `CheckIn`, `OfficeHoursHub`, `AbsenceNoticeButton`, `ohUi`, `admin/*`;
  - routes: `/office-hours/admin`, `/office-hours/checkin`;
  - the *Office Hours Oversight* sidebar item.
- **Tests:**
  - backend `officeHoursPhase0/Core/Views/Register/Notifications/Reports/Modern.test.ts`;
  - the frontend `__tests__` for deleted components.

  Both are replaced by the v2 suites (§15).

---

## 4. Domain model and rules

### 4.1 Concepts

```
OfficeHourPolicy          band 16:20–17:20 · "Academy Hall" · min_days 1 · suggested_days 2 · deadline
OfficeHourTeacher         (term, teacher): ACTIVE | EXEMPT · submitted_at
 └─ OfficeHourTeacherDay     weekday + effective_from / effective_to  (history of changes)
OfficeHourSession         (teacher, date): SCHEDULED | HELD | CANCELLED · replaced_by_session_id
 └─ OfficeHourVisit          student × session · ASSIGNED | VOLUNTARY · status
OfficeHourAssignment      student → teacher · ONCE (a session) | WEEKLY (days, until) · reason · message
 └─ OfficeHourAssignmentLock (term, student) PK: at most one ACTIVE assignment per student
OfficeHourEscalation      follow-up on missed assigned sessions
OfficeHourAbsenceNotice   a student's "I can't come" for an assigned session
OfficeHourOutbox          notices waiting out the 10-second undo window
OfficeHourUndo            single-use undo tokens
SchoolClosure             (kept) dates without office hours
UserProfile.photo_url     (new column) Google profile photo for avatars (P13)
```

### 4.2 Teacher days (R1–R4)

- An **instructor** is a user with `OFFICE_HOURS_MANAGE_OWN` and at least one `TeacherSubjectAssignment` in the term's year. These are the people the declarations board expects.
- A teacher declares **any 1–5 distinct weekdays** (`min_days` = 1). `suggested_days` = 2 is shown as a hint and never enforced. Time and place come from the policy and are never entered.
- **First declaration:** the days take effect today if before the band starts, otherwise tomorrow. `submitted_at` is set.
- **Changing days (P3)** takes effect **next Monday**, so this week stays as students were told:
  - old day rows are closed (`effective_to` = Sunday) and new ones opened;
  - future sessions on dropped days are deleted if they have no visits, or cancelled `DAYS_CHANGED` if they do;
  - **ONCE and WEEKLY assignments** that target a dropped day after next Monday are returned as `affected[]`, and the teacher moves each to another of their days or releases it, in the same view.
- **Exempt:** leadership marks a teacher `EXEMPT` for the term (part-time, leave) with a note. Future sessions are cancelled (`ADMIN`), affected assignments are listed for leadership, and the teacher leaves the "missing" list.
- **Set days for a teacher:** leadership can declare on a teacher's behalf (`submitted_by` = leadership).

### 4.3 Sessions (R4, R5)

- A session is created for every effective declared date that isn't a closure. A sweep keeps 14 days ahead, and `ensureSessions` runs on every read and save. The unique key is `(teacher_id, session_date)`.
- **Can't hold** is allowed until the band starts that day.
  - **Replace:** the teacher picks a date in the **same Mon–Fri week**, later than today (or today, if before the band), not a closure.
    - If the teacher already has a session that date, the original points to it. Otherwise a one-off session is created (`is_extra = 1`).
    - The original becomes `CANCELLED / REPLACED` with `replaced_by_session_id`.
    - ONCE assignments follow the replacement automatically.
  - **Not possible:** the teacher taps a reason, and the session becomes `CANCELLED / NOT_REPLACED`. ONCE assignments targeting it **complete without attendance** (not absent; the lock is freed). Leadership is told.
  - Both apply at once with **Undo** (§4.6).
- After the band starts there is no cancel. An unrecorded session becomes a **missing register**: it counts against teacher compliance and is never a student absence (P6).

### 4.4 Assignments (R7–R9)

- **Who can assign whom:** a teacher assigns students they teach (subject, class teacher or mentor, the existing `teachableStudentIds` rule). Leadership can assign any student to any teacher's office hours.
- **Mode (P8):**
  - `ONCE` (default): one session, by default the teacher's next one. After the 14:00 cut-off on a session day, the default moves to the following session.
  - `WEEKLY`: every session on chosen declared day(s) until an end date (default 4 weeks, at most term end) or until released.
- **Lock (R8):** the assignment and `OfficeHourAssignmentLock(term, student)` are inserted in one transaction. A duplicate key becomes a structured conflict: *"Already assigned by Mr K — Thu 9 Oct · Physics"*, with **Message Mr K** and **Ask to release**. Ask to release sends a bell notice that opens the assignment with *Release*.
- **The lock is freed (row deleted) when:**
  - a ONCE assignment completes, which happens when its register is saved or its session is cancelled without replacement;
  - a WEEKLY assignment completes after its last session's register, or at its end date;
  - the assigning teacher or leadership releases the assignment, at any time.
- **Reason (R9, P5):** a required reason tile plus an optional message (≤ 300 characters). The student sees both in the notice, on their page and in the timetable. Parents see them only when an escalation reaches them. The reasons are:
  - `TOPIC_HELP`: Help with a topic;
  - `MISSED_WORK`: Catch up on missed work;
  - `ASSESSMENT_REVIEW`: Review your assessment;
  - `ABSENCE_CATCH_UP`: Catch up after absence;
  - `PROJECT_SUPPORT`: Project support;
  - `OTHER` (the message is required).

### 4.5 Visits and register (R10, R11)

- **When it opens:** at band start − 15 min (16:05). Normal editing is **on the day**. A save on a later day is accepted and stamped `register_late = 1`. After `register_edit_days` (2), only MANAGE_ANY can edit (P10).
- **Assigned rows** come from ACTIVE assignments covering the session, snapshotted on first open.
- **Voluntary rows** are added by the teacher. They never take a lock and never count as absent. If an assigned student is added as a visitor, the existing assigned row is kept (no duplicate).
- **Marking (P4):** the teacher **taps who's here** (Present). *Late*, *Excused* and an explicit *Absent* sit under ⋯. Attended = Present + Late + Excused, as in Tendo.
- **Finish:**
  - assigned rows not marked become **ABSENT** (R11), and the footer shows the count first;
  - the session becomes HELD;
  - ONCE assignments complete;
  - the escalation check runs.
- **No one came:** with no assigned students, one tap saves an empty HELD register.
- Every change is written to history. Saves carry a version number, so a stale save can't overwrite a newer one (409 + merge).

### 4.6 Undo and the outbox

- Undoable actions are: day changes, assigning, releasing, replacing or cancelling a session, acknowledging a follow-up, and policy changes. Each returns a single-use **undo token** that is valid for 10 seconds.
- Notices to students and teachers for undoable actions are written to `OfficeHourOutbox` with `send_after = now + 10 s`. **Undo** reverses the change and cancels its outbox rows in one transaction, so a mistake never reaches a phone.
- A 5-second tick delivers due rows exactly once.
- Closures are the one exception. Because they cancel many sessions at once, they keep an explicit confirm step instead of Undo.

---

## 5. Workflows

Every task is direct manipulation of a visual object. **Every action is a visible tap target first.** Drag, swipe and long-press are only shortcuts for the same action.

| Who | Task | How | Steps |
|---|---|---|---|
| Teacher | Declare days | Tap the day columns on the **Hall week board**; it autosaves | 1 tap per day |
| Teacher | Take attendance | **Tap who's here** (assigned tiles, visitor bubbles) → **Finish** | 1 screen |
| Teacher | Nobody came | **No one came** on the Today card or the Finish bar | 1 |
| Teacher | Assign students | Tap student cards → tap a session tile and a reason tile → **Assign** | 2 screens |
| Teacher | Can't hold a session | **Can't hold** on the session tile → tap a same-week day (or a reason) | 2 taps |
| Teacher | Release a student | ✕ on the assigned card, with Undo | 1 |
| Teacher | Resolve a block | Tap the holder badge → Message / Ask to release | 1 |
| Student | See who's in the hall | Week board of teacher avatars | 0 |
| Student | See my assignment | Countdown hero card | 0 |
| Student | Say I can't come | Tap a reason tile on the hero card | 1 |
| Leadership | Check declarations | Progress ring + avatar wall; **Nudge all** | 0–1 |
| Leadership | Follow up a student | **✓ Acknowledge** on the card + a note chip | 1 |
| Leadership | Set a teacher's days | Tap the missing avatar → mini week board | 1 per day |
| Leadership (optional) | Import the Google Form | Drop the CSV → review the matches → **Apply** | 2 |

Entry points: first visit, Home tiles, the timetable band (where "+ Pick your days" and session cells open the same flows), push reminders, and the Person 360 / suggestion cards.

---

## 6. Interactive UI/UX design

### 6.1 No forms

No classic form fields (text inputs, selects, date pickers, field grids, bottom Save buttons) are used for any office-hours task:

| Instead of… | We use… |
|---|---|
| Day checkboxes | **Week board**: tap a day column to join it (your avatar flies in); on desktop, dragging your avatar to another column is a shortcut |
| Student dropdown / search form | **Student card grid** with photos and availability rings, tap to select, plus one floating search pill |
| Date picker | **Session tiles** on a week strip |
| Reason select | **Icon tiles** (large, single tap) |
| Message box | **Quick-phrase chips** ("Bring your exercise book") + an optional one-line "✎ add your own" |
| Status radios | **Tap who's here** tiles; ⋯ for Late / Excused / Absent |
| Cancel / reschedule form | **Can't hold** → same-week day tiles (drag is a desktop shortcut) |
| Settings form | **Policy card**: steppers, toggles, segmented pills, a locked time-band slider, a date chip |
| Closure range form | **Month calendar**: tap a start day and an end day (drag is a shortcut) |
| File upload form | **Drop zone** with an animated match preview (optional import) |

Text entry is limited to the search pill and the optional one-line note. Neither is needed to finish a task.

### 6.2 Visual language

- **People first.** Every person appears as an **avatar**:
  - their Google profile photo (P13, §7.2 `photo_url`), or initials on their subject colour (golden-angle subject colours);
  - state is a **ring** around the avatar, never a text column;
  - shared screens get a one-tap **initials-only** toggle, a per-device preference.
- **Graphics carry the information:**
  - a countdown ring to 16:20;
  - a live pulse during the band;
  - fill rings for progress (declarations 41/48, register 7/9);
  - sparklines on KPI tiles;
  - load meters per weekday;
  - an Academy Hall line illustration (SVG, theme-aware) in empty states and board headers.
- **Cards and tiles for daily work.** Tables appear only in reports, behind a "Table view" toggle.
- **Motion with meaning**, through `design/motion.ts` (`tap`, `reveal`, `check`, `fill`, `shake`, `fade`; reduced-motion safe, ≤ 320 ms):
  - avatars fly into a day;
  - rings fill on tap;
  - a replaced session tile flies to its new day and leaves a dotted ghost;
  - a blocked card shakes once;
  - `Celebration` plays only on milestones: the first declaration, and a perfect on-day week, shown after Finish, never while marking.
- **Surfaces:**
  - `rounded-2xl` cards and `rounded-full` chips;
  - soft elevation on hover and drag;
  - a frosted bottom action bar on phones (`BottomActionBar`);
  - a designed dark mode, not an inverted one.
- **Copy:** one short line per screen at most, in plain words, with verbs on buttons ("Assign 2", "Finish").

### 6.3 Colour and chart rules

The palette follows the `dataviz` skill and was **validated with `validate_palette.js`** on the MIS surfaces (light `#ffffff`, dark `#0f172a`). All checks pass, with a worst-case colour-blindness ΔE of 24.7 in light and 26.8 in dark.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--oh-assigned` | `#2a78d6` | `#3987e5` | **Assigned** visits (categorical slot 1) |
| `--oh-voluntary` | `#eb6834` | `#d95926` | **Voluntary** visits (categorical slot 2) |
| `--oh-seq-100…700` | `#cde2fb` … `#0d366b` | same ramp, ≥ step 250 | Hall load, heatmap |
| `--oh-good` | `#0ca30c` | same | Present ✓ |
| `--oh-critical` | `#d03b3b` | same | Absent ✕ |
| `--oh-warning` | `#fab219` | same | Late ⏱ / register due |
| excused | slate-400 | slate-500 | Excused ☂ |

Rules:
- Colour follows the entity (Assigned is always blue, Voluntary always orange).
- Status colours always come with an icon and a label.
- Charts use **recharts** (installed), lazy-loaded:
  - thin marks, 4 px rounded ends, 2 px gaps between stacked segments;
  - a solid, recessive grid and **one y-axis**;
  - a legend for ≥ 2 series plus selective direct labels;
  - a tooltip on every mark, with generous hit areas;
  - a **Table view** on every chart;
  - a skeleton on first load only.
- Hero numbers use sans ≥ 48 px with proportional digits.

### 6.4 Teacher: Hall week board (declaring days)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [hall art]  Pick your office-hours days          Due Fri 17 Oct ◔ 3d │
│             16:20–17:20 · Academy Hall · school suggests 2           │
│                                                    ◉ 2 days ✓        │
│  ┌── Mon ──┐ ┌── Tue ──┐ ┌── Wed ──┐ ┌── Thu ──┐ ┌── Fri ──┐          │
│  │ ◉◉◉◉◉   │ │ ◉◉◉◉◉◉◉ │ │ ◉◉◉     │ │ ◉◉◉◉◉◉  │ │ ◉◉      │ avatars  │
│  │ ▮▮▮▮▯▯  │ │ ▮▮▮▮▮▮▯ │ │ ▮▮▯▯▯▯  │ │ ▮▮▮▮▮▯  │ │ ▮▯▯▯▯▯  │ load     │
│  │ 5       │ │ 7 busy  │ │ 3       │ │ 6       │ │ 2 quiet │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

- **Tap a column** to join it: your avatar flies in and the load meter fills. Tap again to leave. On desktop, dragging your avatar between columns is a shortcut. Keyboard: arrow keys move between columns, Space/Enter toggles.
- **1–5 days.** The chip reads "✓ 2 days" at the suggested number and "School suggests 2" otherwise, as information only. Removing the last day is refused with a shake: "Keep at least one day".
- **Autosave** after a short pause (rapid taps become one save), then a toast: "Tue, Wed & Thu saved · Undo". `Celebration` plays on the first declaration only.
- **Later changes:** a banner reads "From Mon 13 Oct". Affected assignments float above the board as student avatars, each with *Move to <one of your days>* / *Release* buttons.

### 6.5 Teacher hub

```
┌──────────────────────────────────────────────────────────────────────┐
│ Office hours · Tue & Thu · Academy Hall                 ✎  [+ Assign] │
├──────────────────────────────┬───────────────────────────────────────┤
│ TODAY                        │ THIS WEEK                             │
│  ◔ 2h 14m → 16:20            │  Mon   Tue●    Wed   Thu    Fri       │
│  ◉◉◉ 3 assigned              │       [▣ 3 ]        [▣ 2 ]            │
│  [ Take attendance ]         │       Can't hold    Can't hold        │
├──────────────────────────────┴───────────────────────────────────────┤
│ ASSIGNED  (◉ Aline · Thu ✕) (◉ Eric · every Tue ✕) (◉ Ivan · Thu ✕) … │
├──────────────────────────────────────────────────────────────────────┤
│ [Visits 61 ▁▃▅▂▆▇] [On-day ◕ 7/8 🔥5] [Assigned attended ◕ 83%]       │
│ Weekly visits — stacked columns: assigned · voluntary (8 weeks)      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Today hero:**
  - a countdown ring, then a pulsing "In session", then ✓ "Recorded";
  - assigned students as an avatar stack, with ☂ badges for "I can't come";
  - the primary button follows the time: *Take attendance* → *Finish register* → *Edit*;
  - when nobody is assigned, a visible secondary **No one came** button.
- **Week strip:**
  - each session tile shows an assigned-count badge and a visible **Can't hold**;
  - Can't hold opens a bottom sheet (a popover on desktop) with **same-week day tiles** (hall load, "your day" mark) and **reason tiles** (*Sick* · *Official duty* · *School event* · *Other*);
  - the change applies at once, with Undo, and students are notified when the undo window closes;
  - desktop shortcut: drag the tile onto a glowing same-week day or the *Can't replace* tray.
- **Assigned strip:** avatar cards (name, day, reason icon) with a visible ✕ Release and Undo; swipe left is a phone shortcut. Tapping a card opens a mini profile with a visit sparkline.
- **Attention chips**, shown only when relevant: "⚠ Register missing · Thu 2 Oct → Record" and "↔ Mr K asks for Grace → Release / Keep".
- **Insights:**
  - KPI tiles: visits this term with a sparkline; on-day registers as a ring with a streak; the assigned attendance ring;
  - an 8-week stacked column chart of assigned and voluntary visits, with a Table view.

### 6.6 Assign (drawer; full screen on phones)

**Screen 1 · Who**

```
 (🔍 Search pill)   (S4A)(S4B)(S5 Maths)(✦ Suggested 3)
 ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
 │ ◯Aline│ │ ◯Eric │ │ ⊘Grace│ │ ◯Ivan │   ◯ free → tap → ✓ ring
 │ S4A   │ │ S4B   │ │ by MrK│ │ ✦ low │   ⊘ blocked (holder badge) · ✦ evidence
 └──────┘ └──────┘ └──────┘ └──────┘
                          [ ◉◉ 2 selected      Next → ]   floating tray
```

- Tap to select: the ring fills and the avatar flies into the tray.
- A **blocked** card is desaturated and shows the holder's avatar. Tapping it gives one shake and a popover: *Message Mr K* · *Ask to release*.
- **Suggested** cards carry an evidence chip ("Low quiz results", "3 missing tasks").
- Class chips and the search pill filter instantly (name or registration number).

**Screen 2 · When & why**

```
 Session  [Tue 7 ▣2] [Thu 9 ▣1] [Tue 14] [Thu 16]        (⟳ Every week)
 Reason   [💡 Topic] [📝 Missed work] [📊 Assessment] [🗓 After absence] [🛠 Project] [… Other]
 Note     (Bring exercise book)(Bring laptop)(✎ add your own)
 ┌ Aline will receive ─────────────────────────┐
 │ 🔔 Office hours with Ms A                    │
 │ Tue 7 Oct · 16:20–17:20 · Academy Hall       │
 │ 💡 Help with a topic · "Bring exercise book" │
 └──────────────────────────────────────────────┘
                                   [← Back]  [ Assign 2 ✓ ]
```

- **Session tiles:** tap to choose. Dragging the tray onto a tile is a shortcut. The next valid session is pre-selected (cut-off aware).
- **⟳ Every week:** reveals a 1–8 week slider that shows the end date as you slide.
- **Reasons:** single-select icon tiles. The last-used reason and phrase are pre-highlighted. *Other* opens the one-line note.
- **Live preview:** exactly what the student will receive.
- **Result:** assigned cards turn ✓ and cards blocked in the meantime shake and keep their actions. The toast reads "2 assigned · Undo", and notices leave after the undo window.

### 6.7 Register (drawer; full screen on phones)

```
 Tue 7 Oct · Academy Hall                          ◕ 1/3 here    ● saved
 ASSIGNED                                                 (All here)
  [◉✓ Aline]  [◉ Eric]  [◉☂ Ivan]     tap = here ✓ · ⋯ = Late / Excused / Absent
 VISITORS · voluntary      (🔍 type a name)   Recent: (◉Jean)(◉Grace)(◉Paul)
  ◉Jean ✓  ◉Grace ✓  ◉Sam ✓ …                        (orange ring)
 ┌──────────────────────────────────────────────────────────────────────┐
 │ 1 here · 2 not here → absent · 9 visitors              [ Finish ✓ ]  │
 └──────────────────────────────────────────────────────────────────────┘
```

- **Assigned tiles:**
  - **tap = here** (green ✓ ring, with a light haptic tick where supported); tap again to clear;
  - untapped tiles become absent at **Finish**;
  - a visible ⋯ on each tile offers Late, Excused (pre-selected for an "I can't come" student) or Absent;
  - swipe right is a phone shortcut;
  - there is no tap-cycling.
- **Visitors:** recent-visitor bubbles add with one tap. Search results are avatar bubbles, and Enter adds the first. Visitors wear the orange ring. Tapping a visitor removes them, with Undo.
- **Status:** a header ring fills as students are marked. The Finish bar shows a live summary including "→ absent". With nobody assigned and no visitors, the button reads **"No one came · Finish"**.
- **Keyboard:** arrows move, Space = here, 1/2/3/4 = Present/Absent/Late/Excused, `/` = search, ⌘↵ = Finish.
- **Offline:** shows an "Offline · will send" chip and replays later.

### 6.8 Student: My office hours

```
 ┌ HERO ───────────────────────────────────────────┐
 │ ◔ Today 16:20 · in 2h 14m                        │
 │ ◉ Ms A · Mathematics · Academy Hall              │
 │ 💡 Help with a topic · "Bring exercise book"     │
 │ Can't come?  [🤒 Sick bay] [🏃 Team] [✋ Permission]│
 └──────────────────────────────────────────────────┘
 WHO'S IN THE HALL THIS WEEK                     (🔍 any teacher)
  Mon ◉K   Tue ◉A ◉D   Wed ◉M   Thu ◉A   Fri —     your teachers first
 MY JOURNEY
  ◕ 3/3 assigned attended   🔥 4-week visit streak   🏅 Regular visitor
  ▁▂▅▃▆ visits per week (blue assigned · orange voluntary)
```

- **Hero:** a countdown to the next assigned session, with the reason and note. Tapping a can't-come tile turns it into "Ms A has been told ✓ · Undo".
- **Hall board:** teacher avatars with subject-colour rings, the student's own teachers first. Tapping one opens a mini card (subject, days, next session).
- **My journey (P12)** is positive only:
  - an assigned attendance ring;
  - a visit streak;
  - a "Regular visitor" badge (≥ 3 of the last 4 weeks);
  - a weekly chart.

  It has no rankings and no comparisons, and leadership can switch it off.
- **Parents** see the same page per child, read-only, without the can't-come tiles and without the reason unless an escalation has reached them (P5).

### 6.9 Leadership: Office Hours → School

The views switch with segmented pills: **Today · Teachers · Follow-up · Reports · ⚙**.

**Today: live hall floor**

```
 ◉ 12 teachers   ▣ 9 recorded   👥 31 assigned · 74 visitors      (auto-refresh 30 s)
 [◉✓ Ms A 3·9] [◉● Mr K 2·5] [◉⏱ Mr D] [◉✕ Ms N] …
  ✓ recorded · ● in session · ⏱ due · ✕ missing      tap → read-only register
```

Counters animate, and screen readers get a polite `aria-live` summary. A substitute recorder can be set from a tile (MANAGE_ANY).

**Teachers: declarations, load, compliance**

```
 [◕ 41/48 declared · 5 missing · 2 exempt  (Nudge all 5)]   [Hall load: Mon 9 · Tue 14 · Wed 6 …]
 MISSING   ◉ ◉ ◉ ◉ ◉     tap → set days (mini week board) · Exempt · Nudge
 TEACHERS  ◉ Ms A  days ●●  held ▮▮▮▮▯ 80%  on-day ▮▮▮▮▮ 100%  replaced ▮▮▯ 2/3
 ⋯ Download CSV · Import Google Form (optional)
```

- **Declarations:** a progress ring with **Nudge all** (bell + push), followed by "sent" ticks.
- **Hall load:** a single-hue column chart whose tooltip lists the names; it has a Table view.
- **Teacher cards:** day dots plus three meters, sortable. A "Fewer than suggested" filter chip is informational only.
- **Optional import:** drop the CSV and rows animate into *Matched ✓* / *Needs a look*. Pick the right teacher from avatar suggestions, then **Apply**.

**Follow-up board**

```
  Level 1 (6)            Level 2 (2)               Acknowledged (14)
  [◉ Eric · S4B ✕✕ ✓Ack] [◉ Ivan · S5 ✕✕✕ Refer Assign ✓Ack] [◉ … note]
```

Each card shows a ✓/✕ dot strip of assigned sessions.
- **✓ Acknowledge** adds a note chip ("Met with student", "Parent called", ✎). Dragging a card to the column is a desktop shortcut.
- **Refer** opens the prefilled Tendo discipline form.
- **Assign** opens the Assign drawer.

**Reports: chart cards with a Table view**

| Card | Form |
|---|---|
| KPI row | Stat tiles + sparklines: visits, unique visitors, assigned attendance %, on-day registers %, cancellations replaced % |
| Visits over time | Stacked columns per week: assigned (blue) + voluntary (orange); legend + direct label on the last bar |
| Assigned attendance trend | A single line with a reference line at the watch band (80%); crosshair tooltip |
| When students come | Heatmap, weekday × week, sequential blue |
| Consistency | Horizontal stacked bar: consistent / watch / chronic (sequential steps + labels); tap → students |
| By teacher / class / subject / reason | Sorted horizontal bars in one hue, with emphasis on the selected item; tap → 360 |
| Teacher 360 / Student 360 | Avatar header, KPI tiles, a visit timeline with ✓/✕ icons |

A single filter row sits above all cards:
- period pills: *Week · Month · Term · Year · Custom* (Custom opens a calendar popover);
- grade, class and teacher chips;
- ⋯ Export (CSV, Excel, PDF).

**⚙ Policy and closures**

- **Time band:** a slider on a mini timeline, 🔒 locked at 16:20–17:20 by policy.
- **Location:** a chip ("Academy Hall"). **Days:** a *Minimum* stepper (1) and a *Suggested* stepper (2).
- **Deadline:** a date chip. **Edit window and escalation thresholds:** steppers.
- **Parent notifications:** pills (Off · Escalations · Weekly). **Motivation graphics:** a toggle (P12).
- Every control saves itself, with "Saved ✓" and Undo.
- **Closures:** tap a start day and an end day on a month calendar (drag is a shortcut), then pick a label chip (*Holiday* · *Exams* · *Event* · ✎). A **confirm** step shows "4 sessions affected".

### 6.10 Accessibility and fallbacks

- **Gestures have alternatives.** Every drag, swipe or long-press has a visible tap control and a keyboard path: tap the item then the target, or Space / arrows / Enter, announced through `aria-live`. Pointer drag starts after 6 px, so scrolling still works.
- **Targets and signals:** tiles ≥ 64 px, controls ≥ 44 px. Colour always comes with an icon and a label. Focus rings are visible, and focus is never hidden under sticky bars (`scroll-padding`).
- **Reduced motion:** every animation goes through `useMotion()`. Celebration, flights and pulses become fades.
- **Charts:** a Table view and an `aria-label` summary on each.
- **Layout:** phone-first at 390 px. Boards scroll horizontally with snap, drawers become full-screen sheets, and safe-area insets are respected.
- **Verification:** axe WCAG 2.2 AA in both themes, with no horizontal overflow.

### 6.11 Shared building blocks (`frontend/src/components/officeHours/ui/`)

| Component | Used by |
|---|---|
| `Avatar`, `AvatarStack` (photo / initials, state ring, initials-only mode) | everywhere |
| `StatusRing` (✓ ✕ ⏱ ☂, animated) | register, hall floor, assigned strip |
| `CountdownRing` (Kigali clock; pulse during band) | Today hero, student hero |
| `WeekBoard` (columns, load meters, tap/drag/keyboard model) | day board, set-days, hall directory, can't-hold targets |
| `DraggableToken` (framer-motion `drag` + layout; keyboard fallback) | board avatar, session tiles, assign tray, follow-up cards |
| `SessionTile` | week strip, assign screen 2 |
| `IconTile`, `IconTileGroup` (radio-group semantics) | reasons, can't-come, can't-replace |
| `PhraseChips` | assignment note, acknowledgement note |
| `StepperControl`, `SegmentedPills`, `TimeBandSlider`, `DateChip` | policy, report filters |
| `RangeCalendar` (tap start/end, drag shortcut) | closures |
| `DropZone` | optional CSV import |
| `KpiTile` (+ sparkline), `ChartCard` (legend, Table view, export) | hub, school, reports |
| `HallIllustration` | empty states, headers |
| `useUndoToast` (bound to server undo tokens), `CoachMark` (one-time gesture tips), `copy.ts` (all strings) | everywhere |
| `ohTokens.css` (§6.3, light + dark) | everywhere |
| Reused: `ProgressRing`, `ProgressBar`, `Celebration`, `BottomActionBar`, `Skeleton`, `EmptyState`, `design/motion.ts` | — |

**No new npm dependency:** framer-motion 12, recharts 3 and lucide-react are already installed.

### 6.12 Modern-app UX checklist (every PR in P2–P4 is reviewed against it)

| Principle | How the design meets it |
|---|---|
| Visible first, gestures accelerate (HIG, Material) | Every gesture has a visible control: Can't hold, ✕ Release, ✓ Acknowledge, ⋯ on tiles, No one came |
| Undo over confirm (Nielsen #3) | Immediate actions with Undo; notices wait in the outbox; only closures confirm |
| Recognition over recall (Nielsen #6) | Avatars, recent visitors, suggestions, phrase chips, session tiles, live preview |
| Hick's law | One primary action per screen; ≤ 6 reason tiles; rare options behind ⋯ |
| Fitts's law / thumb zone | Large tiles; primary actions in the bottom bar on phones |
| Doherty threshold | Optimistic UI under 100 ms; server p95 < 300 ms for `/hub` and register saves; Interaction to Next Paint (INP) < 200 ms on a mid-range Android |
| Visibility of system status (Nielsen #1) | Saved / Offline chips, countdown, live pulse, progress rings, `aria-live` (WCAG 4.1.3) |
| Error prevention (Nielsen #5) | Only same-week targets; blocked students shown with a way forward; the last day can't be removed; the register opens at 16:05 |
| Consistency / Jakob's law | Bottom sheets on phones and drawers on desktop; the standard MIS shell; the same tiles and colours everywhere |
| Progressive disclosure | ⋯ for Late/Excused; reports and policy one level deeper; first visit shows only the day board |
| Discoverable gestures | One-time coach marks ("Tap who's here", "Tip: drag a session to move it") |
| No redundant entry (WCAG 3.3.7) | Autosave, offline queue, last-used reason, "I can't come" pre-selects Excused, weekly repeats |
| WCAG 2.2 AA | 2.5.7 dragging alternatives, 2.5.8 target size, 2.4.11 focus not obscured, 1.4.1 colour, 2.3.3 motion; axe in e2e |
| Mobile-first PWA | 390 px first, installable, push, offline register, haptics, pull-to-refresh on hub and hall floor |
| Calm motion | Named motions ≤ 320 ms; Celebration on milestones only, never during marking |
| Plain content | Sentence case, verbs on buttons, "Tue 7 Oct" dates; strings in `copy.ts` for future French/Kinyarwanda |
| Helpful empty and error states | Illustration + one action; errors say what to do ("Mr K already assigned Grace — ask to release") |
| Designed dark mode | Own tokens, validated chart colours, ringed photos |
| Performance budget | Route chunk ≤ 150 KB gzip before recharts; lazy charts and celebration; lazy avatars; LCP < 2.5 s on a mid-range Android |
| Privacy by design | No student data in the directory; initials-only toggle; reasons hidden from parents unless escalated; badges never compared |

**Usability validation.** Run the clickable building blocks with 3 teachers (P2) and 3 students (P3):
- a 5-second test of the hub;
- task success for declare / assign / attendance / can't hold, with a target of ≥ 90% unaided and each task under 30 s;
- a System Usability Scale (SUS) score ≥ 80.

Fix any failures before P4.

---

## 7. Data model: migration `103_office_hours_v2.sql`

The migration is idempotent and runs on MySQL 5.7 and 8, in the same style as 102 (information_schema guards, `INSERT IGNORE`). Drizzle definitions are in the rewritten `backend/src/db/officeHoursSchema.ts`, and `UserProfile.photo_url` is added to `schema.ts`.

### 7.1 Archive v1

For each v1 table listed in §3.2: `RENAME TABLE X TO v1_X` if `X` exists and `v1_X` doesn't. Nothing reads `v1_*`. `SchoolClosure` is untouched.

### 7.2 New tables and columns

```sql
OfficeHourPolicy (id TINYINT PK,                          -- one row, id = 1
  band_start CHAR(5) DEFAULT '16:20', band_end CHAR(5) DEFAULT '17:20',
  location VARCHAR(100) DEFAULT 'Academy Hall',
  min_days TINYINT DEFAULT 1, suggested_days TINYINT DEFAULT 2,           -- P1
  declaration_deadline DATE NULL,                                         -- set by leadership at rollout
  roster_cutoff_time CHAR(5) DEFAULT '14:00',
  register_edit_days TINYINT DEFAULT 2,                                   -- P10
  weekly_default_weeks TINYINT DEFAULT 4,                                 -- P8
  escalation_consecutive_l1 TINYINT DEFAULT 2, escalation_month_l1 TINYINT DEFAULT 2,
  escalation_consecutive_l2 TINYINT DEFAULT 3,
  rate_band_consistent TINYINT DEFAULT 90, rate_band_watch TINYINT DEFAULT 80,
  min_sessions_for_rate TINYINT DEFAULT 3,
  parent_notifications ENUM('OFF','ESCALATIONS','WEEKLY') DEFAULT 'ESCALATIONS',
  motivation_enabled TINYINT DEFAULT 1,                                   -- P12
  updated_by BIGINT NULL, updated_at DATETIME NULL)

OfficeHourTeacher (academic_term_id BIGINT, teacher_id BIGINT,  PK (academic_term_id, teacher_id),
  status ENUM('ACTIVE','EXEMPT') DEFAULT 'ACTIVE', exempt_note VARCHAR(255) NULL,
  submitted_at DATETIME NULL, submitted_by BIGINT NULL, updated_at DATETIME)

OfficeHourTeacherDay (id BIGINT PK AI, academic_term_id BIGINT, teacher_id BIGINT,
  day_of_week TINYINT,                                     -- 1 = Mon … 5 = Fri
  effective_from DATE, effective_to DATE NULL,             -- NULL = open-ended
  created_by BIGINT, created_at DATETIME,
  INDEX (academic_term_id, teacher_id), INDEX (academic_term_id, day_of_week, effective_from))

OfficeHourSession (session_id BIGINT PK AI, academic_term_id BIGINT, teacher_id BIGINT,
  session_date DATE,  UNIQUE (teacher_id, session_date),
  status ENUM('SCHEDULED','HELD','CANCELLED') DEFAULT 'SCHEDULED',
  is_extra TINYINT DEFAULT 0,
  cancel_reason ENUM('REPLACED','NOT_REPLACED','CLOSURE','DAYS_CHANGED','ADMIN') NULL,
  cancel_note VARCHAR(255) NULL, cancelled_by BIGINT NULL, cancelled_at DATETIME NULL,
  replaced_by_session_id BIGINT NULL, recorder_id BIGINT NULL,
  register_first_saved_at DATETIME NULL, register_last_saved_at DATETIME NULL,
  register_saved_by BIGINT NULL, register_late TINYINT DEFAULT 0, version INT DEFAULT 1,
  INDEX (session_date, status), INDEX (academic_term_id, teacher_id, session_date))

OfficeHourAssignment (assignment_id BIGINT PK AI, academic_term_id BIGINT,
  student_id BIGINT, teacher_id BIGINT, assigned_by BIGINT,
  mode ENUM('ONCE','WEEKLY'), session_id BIGINT NULL,      -- ONCE target (follows replacements)
  weekly_days VARCHAR(9) NULL, starts_on DATE, ends_on DATE,
  reason_code VARCHAR(30), message VARCHAR(300) NULL,
  status ENUM('ACTIVE','COMPLETED','RELEASED') DEFAULT 'ACTIVE',
  ended_at DATETIME NULL, ended_by BIGINT NULL, end_note VARCHAR(255) NULL, created_at DATETIME,
  INDEX (teacher_id, status), INDEX (student_id, academic_term_id), INDEX (session_id))

OfficeHourAssignmentLock (academic_term_id BIGINT, student_id BIGINT,
  PK (academic_term_id, student_id), assignment_id BIGINT UNIQUE, created_at DATETIME)   -- R8

OfficeHourVisit (session_id BIGINT, student_id BIGINT, PK (session_id, student_id),
  visit_type ENUM('ASSIGNED','VOLUNTARY'), assignment_id BIGINT NULL,
  status ENUM('PRESENT','ABSENT','LATE','EXCUSED') NULL,   -- NULL only before Finish
  excuse_reason VARCHAR(30) NULL, note VARCHAR(255) NULL,
  marked_by BIGINT NULL, marked_at DATETIME NULL, INDEX (student_id, session_id))

OfficeHourVisitHistory (history_id BIGINT PK AI, session_id, student_id,
  previous_status, new_status, previous_type, new_type, changed_by, changed_at)

OfficeHourEscalation (escalation_id BIGINT PK AI, academic_term_id, student_id, assignment_id,
  level TINYINT, trigger_code VARCHAR(20), trigger_session_id, notified_user_ids TEXT,
  created_at, acknowledged_by NULL, acknowledged_at NULL, resolution_note VARCHAR(500) NULL)

OfficeHourAbsenceNotice (notice_id BIGINT PK AI, session_id, student_id, reason VARCHAR(30),
  note VARCHAR(255) NULL, created_at, UNIQUE (session_id, student_id))

OfficeHourOutbox (outbox_id BIGINT PK AI, event VARCHAR(40), subject_key VARCHAR(80),
  undo_token CHAR(32) NULL, payload JSON, send_after DATETIME,
  sent_at DATETIME NULL, cancelled_at DATETIME NULL,
  INDEX (send_after, sent_at, cancelled_at), INDEX (undo_token))

OfficeHourUndo (token CHAR(32) PK, actor_id BIGINT, action VARCHAR(40),
  payload JSON, expires_at DATETIME, used_at DATETIME NULL)

ALTER TABLE UserProfile ADD COLUMN photo_url VARCHAR(500) NULL;           -- P13 (guarded)
```

- **Seed:** `INSERT IGNORE` the policy row.
- **Permissions:** no new ones. Update the five `OFFICE_HOURS_*` labels to the v2 wording (§8.4).

### 7.3 Clean-up

After one week in production with no rollback, a separate PR adds `10x_drop_office_hours_v1.sql`, which drops the `v1_*` tables.

---

## 8. Backend: services, API, jobs, access

### 8.1 Services (`backend/src/services/officeHours/`)

| File | Responsibility |
|---|---|
| `common.ts` | Kept |
| `policy.ts` | Replaces `settings.ts`: cached read, validated save, `publicPolicy()` |
| `access.ts` | `actorOf`, `isInstructor`, `canRecord(session)` (teacher, substitute recorder, MANAGE_ANY), `readScopeOf` (from v1) |
| `teacherDays.ts` | `getMyDays`, `saveMyDays` (first vs next-Monday change, returns `affected[]`), `setDaysFor`, `setExempt`, `hallLoad(term, week)` (with avatars), `effectiveDaysOn(date)`, `importDays(rows, dryRun)` *(optional, P4b)* |
| `sessions.ts` | `ensureSessions` (closure-aware, idempotent via the unique key), `sessionsFor(viewer, range)`, `cantHold(sessionId, { replacementDate } \| { reason }, message)` |
| `assignments.ts` | `candidates` (teachable students + free / with you / assigned by X), `assign` (partial success: `assigned[]`, `blocked[]` with holder, `ineligible[]`), `release`, `askToRelease`, `completeForSession`, `suggestions` |
| `register.ts` | `openRegister` (snapshot), `finishRegister(sessionId, rows, version)` (unmarked assigned → ABSENT, late flag, history, HELD, completes ONCE, escalation), `noOneCame`, `recentVisitors` |
| `undo.ts` + `outbox.ts` | Issue undo tokens; `undo(token, actor)` reverses the action and cancels its outbox rows in one transaction; `enqueue(event, payload, undoToken)`; `deliverDue()` sends each row once through the bell + push helper |
| `views.ts` | `teacherHub` (incl. 8-week series and on-day streak), `studentPage` (assignment, reason, directory, journey if `motivation_enabled`), `parentPage`, `directory(term, week, viewer)`, `band(viewer, week)` |
| `metrics.ts` | The only place formulas live (§11) |
| `reports.ts` | Scoped datasets on the period engine: summary, breakdown, consistency, trend, heatmap, student/teacher 360, declarations, compliance, daily sheet |
| `escalation.ts` | v1 logic on `OfficeHourVisit` (assigned only) |
| `notify.ts`, `events.ts` | Notice texts (§10) |
| `digests.ts` | Friday teacher and leadership digests; parent summary if `WEEKLY` |
| `reminders.ts` | Reminder Hub occurrences: teacher days (teacher), assigned sessions (student) |
| `reconcile.ts` | Nightly: complete expired WEEKLY, delete orphan locks, release students who left their class, cancel future sessions on new closures, expire undo tokens |
| `scheduler.ts` | Jobs in §8.3 |

Also:
- **`controllers/authController.ts`:** every Google sign-in path (web and desktop hand-off) saves `payload.picture` to `UserProfile.photo_url` when it changes (P13).
- **People payloads** include `photo_url`, initials and subject colour.

### 8.2 API (`/office-hours`)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/config` | auth | Policy + the caller's capabilities |
| GET | `/hub` | MANAGE_OWN | Teacher hub payload |
| GET / PUT | `/my-days` | MANAGE_OWN | Days + hall load + deadline / `{ days }` → result, `affected[]`, `undo_token` |
| GET | `/directory?week=` | auth | Teachers per weekday (no student data) |
| GET | `/candidates?q=&class_group_id=` · `/suggestions` | MANAGE_OWN | Assign screen 1 |
| POST | `/assignments` | MANAGE_OWN / MANAGE_ANY (`teacher_id`) | `{ student_ids, mode, session_id \| weekly_days+ends_on, reason_code, message }` → partial result + `undo_token` |
| POST | `/assignments/:id/release` | assigner, teacher, MANAGE_ANY | → `undo_token` |
| POST | `/assignments/:id/ask-release` | MANAGE_OWN | Bell notice to the holder |
| POST | `/undo/:token` | token owner, ≤ 10 s | Reverse the action; 410 when expired |
| GET | `/sessions?from=&to=` | auth (scoped) | Sessions for the viewer (**Tendo contract**, §13) |
| POST | `/sessions/:id/cant-hold` | recorder / MANAGE_ANY | Replace or not-replaced → `undo_token` |
| GET / PUT | `/sessions/:id/register` | recorder (VIEW reads) / MANAGE_ANY | Open / Finish (versioned) |
| POST | `/sessions/:id/no-one-came` | recorder | Empty HELD register |
| GET | `/sessions/:id/recent-visitors` | recorder | Quick-add bubbles |
| PUT | `/sessions/:id/recorder` | MANAGE_ANY | Substitute recorder |
| POST / DELETE | `/sessions/:id/absence-notice` | VIEW_SELF (student) | "I can't come" / undo |
| GET | `/me`, `/children` | VIEW_SELF | Student and parent pages (**Tendo contract**) |
| GET | `/band?week=` | auth | Timetable band entries |
| GET | `/school/today` | VIEW | Live hall floor |
| GET | `/school/teachers` | VIEW | Declarations, load, compliance |
| POST | `/school/teachers/remind` | MANAGE_ANY | Nudge missing |
| PUT | `/school/teachers/:id/days` · `/school/teachers/:id/exempt` | MANAGE_ANY | Set days / exempt |
| POST | `/school/teachers/import?dry_run=1` | MANAGE_ANY | *(Optional, P4b)* Google Form CSV |
| GET / POST | `/escalations` · `/escalations/:id/ack` | VIEW / MANAGE_ANY | Follow-up (ack → `undo_token`) |
| GET | `/reports/{summary,breakdown,consistency,trend,heatmap,compliance,declarations,daily}` · `/reports/students/:id` · `/reports/teachers/:id` | VIEW (scoped; summary depth = totals) · teachers: own | Reports |
| GET / POST / DELETE | `/closures` · `/closures/preview` | VIEW / CONFIGURE | Kept |
| GET / PUT | `/policy` | CONFIGURE | Policy (PUT → `undo_token`) |

The kill switch (404) and the not-migrated guard (503 `OFFICE_HOURS_NOT_SET_UP`) are kept.

### 8.3 Jobs (Kigali time; each keyed and idempotent; off in tests)

| Job | When | What |
|---|---|---|
| Outbox delivery | every 5 s | Send due, uncancelled rows once |
| Ensure sessions | every 6 h | 14 days ahead for every ACTIVE teacher |
| Declaration reminder | 07:30 weekdays while a deadline is set and instructors are missing | Bell + push to missing instructors; leadership summary on and after the deadline |
| Morning note | 06:30 on a teacher's day | "Office hours today 16:20 · Academy Hall · 3 assigned" |
| Register reminder | start + 5 min; end + 10 min if missing; 20:00 if still missing | Push to recorder |
| Escalations | 18:30 (also after each Finish) | Ladder on assigned absences |
| Reconcile | 02:00 | §8.1 |
| Digests | Friday 17:30 | §8.1 |

### 8.4 Access

| Capability | Meaning in v2 |
|---|---|
| `OFFICE_HOURS_MANAGE_OWN` | Declare my days, assign students I teach, record my sessions (all teacher roles, as linked in 102) |
| `OFFICE_HOURS_MANAGE_ANY` | Set days or exempt any teacher, assign anyone to anyone, correct any register, substitute recorder, closures |
| `OFFICE_HOURS_VIEW` (summary / detail, scoped) | School view and reports within scope; summary depth shows totals without names |
| `OFFICE_HOURS_VIEW_SELF` | Student / parent page, "I can't come" |
| `OFFICE_HOURS_CONFIGURE` | Policy |

Scope uses `resolveUserScope` (class teacher → class, programme lead → programme, head and deputies → school). The directory needs only authentication: teacher names and days are meant to be shared (R3), and it returns no student data.

---

## 9. Frontend: file map (`frontend/src/`)

| File | Status | Content |
|---|---|---|
| `api/officeHours.ts` | rewrite | §8.2 endpoints and types |
| `components/officeHours/ui/*` | new | §6.11 building blocks, `ohTokens.css`, `copy.ts` |
| `components/officeHours/OfficeHoursPage.tsx` | new | `/office-hours`: teacher hub, student/parent page, or the Me / School switch, by capability |
| `components/officeHours/teacher/DayBoard.tsx` | new | §6.4 (also used by leadership *Set days*) |
| `components/officeHours/teacher/TeacherHub.tsx` | new | §6.5 |
| `components/officeHours/teacher/CantHoldSheet.tsx` | new | §6.5 same-week day tiles + reason tiles |
| `components/officeHours/teacher/AssignFlow.tsx` | new | §6.6 (availability logic ported from `StudentPicker`) |
| `components/officeHours/teacher/RegisterBoard.tsx` | new | §6.7 (offline queue, keyboard, version merge ported from `RegisterSheet`) |
| `components/officeHours/student/StudentOfficeHours.tsx` | new | §6.8 (student + parent modes) |
| `components/officeHours/student/HallDirectory.tsx` | new | Teacher week board (page, band popover, Home) |
| `components/officeHours/school/SchoolView.tsx` | new | Pills: Today · Teachers · Follow-up · Reports · ⚙ |
| `components/officeHours/school/{HallFloor,TeachersBoard,FollowUpBoard,PolicyCard,ClosureCalendar}.tsx` | new | §6.9 |
| `components/officeHours/school/ImportDrop.tsx` | new, optional | P4b |
| `components/officeHours/reports/*` | rewrite | Chart cards, 360 pages; `exports.ts` kept |
| `components/officeHours/OfficeHoursBandCells.tsx`, `useOfficeHoursBand.ts` | adapt | Avatar-ring band cells: teacher "◉ 3 assigned" → register, or "+ Pick your days"; student assignment or teacher avatar stack; class grid avatar stack |
| `components/officeHours/offlineQueue.ts` | keep | — |
| v1 components (§3.2) | delete | — |
| `App.tsx` | edit | Routes: `/office-hours`, `/office-hours/reports/students/:id`, `/office-hours/reports/teachers/:id`. Redirect `/office-hours/schedules/:id` and `/my-office-hours` to `/office-hours`. Remove `/office-hours/admin` and `/office-hours/checkin` |
| `components/ui/Sidebar.tsx`, `NavSearch.tsx` | edit | One **Office Hours** item for any `OFFICE_HOURS_*` holder; remove *Office Hours Oversight* |
| `components/ui/NotificationBell.tsx` | edit | New kinds in `kindIcon` |
| `components/elearning/DevKitchenSink.tsx` | edit | Office-hours building-block gallery (both themes) |
| `activity/mis.catalog.json` + backend `catalogs/mis.json` | edit | New routes and actions |

---

## 10. Notifications

Mandatory notices go to the **bell + push** directly, whatever the user's Reminder Hub opt-in. Undoable ones pass through the outbox (§4.6).

| Event | To | Text |
|---|---|---|
| Days saved | Teacher (toast); leadership digest | "Tue, Wed & Thu, 16:20–17:20, Academy Hall — your students can see this now." |
| Days changed | Leadership (digest, Teachers view) | "Ms A: Tue & Thu → Mon & Thu from 13 Oct" |
| Declaration missing | Missing instructors, daily | "Pick your office-hours days — due Fri 17 Oct." |
| Assigned (once) | Student | "Office hours with Ms A — Tue 7 Oct, 16:20–17:20, Academy Hall. Reason: Catch up on missed work." (+ note) |
| Assigned (weekly) | Student | "Office hours with Ms A — every Tuesday until 4 Nov, 16:20–17:20, Academy Hall. Reason: …" |
| Released | Student | "You no longer need to attend office hours with Ms A." |
| Ask to release | Holder teacher | "Mr K asks you to release Grace U. so he can assign her." |
| Session replaced | Assigned students | "Ms A moved Tuesday's office hours to Thursday 9 Oct, 16:20–17:20, Academy Hall." |
| Not replaced | Assigned students; leadership | "Ms A's office hours on Tue 7 Oct are cancelled — you don't need to attend." / "Ms A could not replace Tue 7 Oct: <reason>" |
| Before session (Reminder Hub, opt-in) | Assigned students, teacher | "Office hours at 16:20 in the Academy Hall" |
| I can't come | Teacher | "Ivan K. can't come today: sick bay" |
| Missed assigned session | Student; class teacher; ladder | "You missed office hours with Ms A on Tue 7 Oct." |
| Register missing | Recorder; leadership (Today, digest) | "Record Tuesday's office-hours attendance." |

Students who only come voluntarily aren't notified of replacements (P7). The directory and timetable update for everyone.

---

## 11. Metrics, reports and follow-up

**Metrics** (`metrics.ts` only; each is explained in the UI under "How is this calculated?"):
- **Assigned attendance rate** = (present + late + excused) ÷ assigned visits in HELD sessions. **Presence rate** = (present + late) ÷ the same denominator.
- **Voluntary visits** = count of VOLUNTARY rows; **unique visitors** = distinct students.
- **Consistency band** (assigned, ≥ 3 sessions): consistent ≥ 90%, watch 80–89%, chronic < 80%.
- **Regular visitor** = voluntary visits in ≥ 3 of the last 4 weeks.
- **Visit streak** = consecutive weeks with ≥ 1 visit of either type.
- **Teacher compliance:**
  - declared;
  - held ÷ due (due excludes closures and replaced originals);
  - on-day registers %;
  - late registers;
  - cancellations replaced %.

**Reports:**
- summary;
- breakdowns by teacher / subject / class / grade / programme / weekday / reason;
- trend;
- heatmap;
- consistency lists (chronic, watch, regular visitors, never seen);
- student 360 and teacher 360;
- **declarations** (teacher, subjects, days, submitted at/by), which replaces the Google Form sheet;
- printable daily register.

Every report exports to CSV, Excel and PDF.

**Follow-up (R12), on assigned absences only:**
- **Level 1** (2 in a row, or 2 in 30 days): the student, the assigning teacher and the class teacher are told.
- **Level 2** (3 in a row, or a rate below the watch band): the programme lead is told, and parents by email under the parent-notification policy. The reason becomes visible to parents from this point (P5).
- A level re-arms after two attended assigned sessions in a row.
- Leadership acknowledges with a note, assigns again, or refers to Tendo discipline (prefilled, never automatic).

---

## 12. Decisions (all confirmed 2026-10-04)

| # | Decision |
|---|---|
| **P1** | Teachers choose **1–5 days** (`min_days` 1); the memo's **2 is a suggestion** (`suggested_days` 2). Leadership can exempt or set days for a teacher. |
| **P2** | **No cap** on teachers per weekday. The load is shown live; a soft cap can be added later if a day overflows. |
| **P3** | Teachers may **change days mid-term, effective next Monday**. Leadership is informed; affected assignments are moved or released in the same view. |
| **P4** | Register: **tap who's here** (Present); **Late / Excused / Absent under ⋯**; Tendo-compatible semantics. |
| **P5** | **Students see the reason; parents only once an escalation reaches them.** |
| **P6** | A register never recorded is a **teacher compliance gap, not a student absence**. |
| **P7** | Replacements notify **assigned students only**; everyone else sees the directory and timetable update. |
| **P8** | Default assignment is **Once (next session)**; "Every week until…" is one tap away (default 4 weeks). |
| **P9** | Google Form import is **optional** (P4b, skippable). |
| **P10** | Registers are **recorded on the day**. A later save is accepted and flagged *late*; after 2 days only leadership can edit. |
| **P11** | **No QR self check-in** in v2. Teachers add visitors with quick-add; a hall kiosk can be revisited later. |
| **P12** | **Streaks and badges for students: yes.** Positive only, never compared; leadership can switch them off. |
| **P13** | **Profile photos on boards: yes.** MIS doesn't store photos today, so the Google profile photo is saved at sign-in (`UserProfile.photo_url`), with initials until then; an initials-only toggle exists for shared screens. |

---

## 13. Integrations

- **Timetable band** (`CalendarGrid`, `DashboardCalendarWidget`, `TeacherWelcome`): reads `/office-hours/band`. The `calendarConstants.ts` band stays as the offline fallback. The "Office Hours" activity type stays removed from `CalendarSlotModal`.
- **Home** (`services/home/officeHoursProvider.ts`, rewritten):
  - teacher tile: "Pick your days", or "Today 16:20 · 3 assigned · Take attendance";
  - student tile: the assignment card, or "3 of your teachers in the hall today";
  - leadership tile: "Declared 41/48 · 12 teachers today · 63 visits this week";
  - attention items: registers missing for more than 1 day, and undeclared instructors after the deadline.
- **Reminder Hub:** the `office_hours` kind is kept, fed by teacher days and assigned sessions.
- **Tendo** (`nga-discipline-attendance/server/src/modules/attendance/officeHours.ts`):
  - it reads `/office-hours/me` and `/office-hours/sessions`; v2 keeps both with compatible fields (`session_id`, `session_date`, `start_time`, `end_time`, `title` = "Office hours — Ms A", `location`, `status`) plus `assigned`;
  - its deep link changes from `/office-hours/schedules/:id` to `/office-hours?session=<id>`, and MIS redirects the old path;
  - a small Tendo PR updates the link and `officeHoursLane.test.ts`, and the lane shows assigned sessions only.
- **Task Mentor:** `GET /api/integration/student-standing` is unchanged and feeds *Suggested*.
- **Desktop app:** no change beyond the new bell kinds.
- **Analytics events:** `oh_days_declared`, `oh_assigned`, `oh_register_finished`, `oh_cant_hold`, `oh_released`, `oh_undo`.

---

## 14. Phases and task checklist

Each phase ends green: backend vitest on a private test-DB clone, frontend vitest, and `tsc`. Never run vitest alongside the e2e API or another DB-heavy suite (MAMP drops connections).

**P0 — Pre-flight (0.5 day)**
- [ ] Owner runs the production check (§16.1); all v1 counts are 0.
- [ ] Confirm the next free migration number (103 expected).
- [ ] *(Optional, P9)* Obtain the Google Form response export.

**P1 — Data and core services (3.5 days)**
- [ ] `103_office_hours_v2.sql`, the new `officeHoursSchema.ts`, `UserProfile.photo_url`, and rewritten `test/officeHoursFixtures.ts`.
- [ ] `policy.ts`, `access.ts`, `teacherDays.ts`, `sessions.ts`, `assignments.ts`, `register.ts`, `undo.ts` + `outbox.ts`, and the `views.ts` hub/student/directory/band payloads.
- [ ] Google sign-in saves `photo_url` (web + desktop paths).
- [ ] Teacher and student routes; delete the v1 services, routes and scheduler jobs.

**P2 — Building blocks and teacher UI (5.5 days)**
- [ ] `ui/*` + `ohTokens.css` + `copy.ts`, and the gallery in `DevKitchenSink` (light + dark).
- [ ] Usability round with 3 teachers on the gallery prototype; fix the findings.
- [ ] `OfficeHoursPage`, `DayBoard`, `TeacherHub`, `CantHoldSheet`, `AssignFlow`, `RegisterBoard`.
- [ ] Teacher band cells, Home teacher tile, single sidebar item, routes and redirects; delete the v1 components.

**P3 — Student and parent (2 days)**
- [ ] `/directory`, `/me`, `/children`, `StudentOfficeHours`, `HallDirectory`, student band, Home student tile.
- [ ] Usability round with 3 students; fix the findings.

**P4 — School view, reports, jobs (4 days)**
- [ ] `metrics.ts`, `reports.ts`; `HallFloor`, `TeachersBoard` (+ CSV), `FollowUpBoard`, chart-card reports, `PolicyCard`, `ClosureCalendar`.
- [ ] Escalation, digests, reminders, `reconcile.ts` and every §8.3 job.

**P4b — Optional Google Form import (0.5 day)**
- [ ] `importDays`, `POST /school/teachers/import`, `ImportDrop`.

**P5 — Integrations and docs (1 day)**
- [ ] Reminder Hub occurrences, analytics catalog, NotificationBell kinds.
- [ ] Tendo PR (link + lane test).
- [ ] Rewrite `docs/OFFICE_HOURS.md` around the policy, plus a one-page teacher guide (declare · attend · assign · can't hold).
- [ ] Mark `OFFICE_HOURS_IMPLEMENTATION_PLAN.md` as superseded.

**P6 — Verify and release (1.5 days)**
- [ ] Browser e2e (§15.3); axe AA in light and dark at 390 / 768 / 1366; screenshot review of every board and chart.
- [ ] Load check: 40 teachers × a term, 50 visits a day; report queries < 0.5 s; INP and LCP measured on a mid-range Android.
- [ ] Release per §16.2.

**Total: 18 working days** (P0 0.5 + P1 3.5 + P2 5.5 + P3 2 + P4 4 + P5 1 + P6 1.5), **plus 0.5 day for the optional P4b**.

---

## 15. Testing

### 15.1 Backend (vitest + supertest, `src/__tests__/officeHoursV2*.test.ts`)

- **Policy:** validates band order, `min_days` / `suggested_days` within 1–5, `min_days` ≤ `suggested_days`, and the deadline; Undo restores the previous values.
- **Teacher days:**
  - accepts 1–5 distinct weekdays; 0 days, duplicates, weekends or fewer than `min_days` → 400;
  - the first save takes effect today or tomorrow depending on the band;
  - a change takes effect next Monday and keeps this week;
  - dropped-day sessions are deleted without visits and cancelled with visits;
  - `affected[]` covers ONCE and WEEKLY assignments;
  - exempt cancels future sessions and leaves "missing";
  - leadership set-days records `submitted_by`;
  - *(P4b)* import dry-run writes nothing.
- **Sessions:**
  - created only on declared, non-closure days;
  - concurrent `ensureSessions` calls create no duplicates;
  - same-week replace creates an extra session or reuses an existing one, and ONCE assignments follow;
  - next-week dates → 400; after the band started → 409;
  - not-replaced completes ONCE assignments without absence and notifies leadership.
- **Assignments:**
  - teachable-only for teachers (403 otherwise); leadership can assign anyone to anyone;
  - two teachers racing → exactly one assignment, and the other gets `blocked` with the holder;
  - partial success; the cut-off default;
  - ONCE completes on Finish and frees the lock; WEEKLY completes at its end or on release;
  - ask-release notifies the holder;
  - the student payload has the reason and note, and the parent payload hides them until an escalation (P5).
- **Register:**
  - snapshot on first open;
  - unmarked assigned → ABSENT at Finish; voluntary rows are never ABSENT; no duplicate for an assigned student added as a visitor;
  - a next-day save is flagged late; after 2 days, 403 for the teacher and OK for MANAGE_ANY;
  - a version conflict → 409 with the latest rows;
  - no-one-came with assigned students → 400;
  - history is written.
- **Undo and outbox:**
  - undo within 10 s reverses the change and cancels its notices; after 10 s → 410; another user's token → 403;
  - each outbox row is delivered exactly once across overlapping ticks and a restart.
- **Metrics and reports:**
  - a hand-checked fixture week;
  - voluntary visits never change attendance rates;
  - compliance excludes replaced originals and closures;
  - summary depth hides names;
  - class, programme and school scopes;
  - trend and heatmap totals reconcile with the summary.
- **Escalation:** assigned absences only; re-arm after two attended.
- **Views:**
  - the directory has no student fields;
  - own teachers come first;
  - a parent sees only linked children;
  - journey fields are absent when `motivation_enabled` = 0.
- **Auth:** a Google sign-in stores or updates `photo_url`.
- **Jobs and routes:**
  - every job is idempotent when run twice;
  - 404 when the kill switch is off;
  - 503 before migration 103.

### 15.2 Frontend (vitest + Testing Library)

- **Building blocks:**
  - `WeekBoard` / `DraggableToken`: tap-tap, keyboard and pointer drag give the same result, announced via `aria-live`;
  - `StatusRing` shows an icon and label for each status;
  - `IconTileGroup` has radio semantics;
  - `CountdownRing` before / during / after the band;
  - `ChartCard` Table view numbers equal the chart's;
  - everything renders with reduced motion;
  - `Avatar` falls back to initials and respects initials-only mode.
- **DayBoard:**
  - toggle + debounced autosave (one save for rapid taps); Undo restores;
  - any 1–5 accepted; removing the last day shakes;
  - the hint text at and away from the suggestion;
  - a change shows "From Mon …" with *Move* / *Release* for affected students.
- **TeacherHub:**
  - first-run vs declared states;
  - the hero button follows the time;
  - No one came is visible when nobody is assigned;
  - Can't hold shows same-week tiles only, applies with Undo, and sends nothing before the window closes;
  - reason tiles complete a not-replaced cancel;
  - the drag shortcut gives the same result.
- **AssignFlow:**
  - selection tray;
  - a blocked card shakes and shows Message / Ask to release;
  - the session tile (tap or tray drop);
  - "Every week" slider;
  - the preview text;
  - partial-success states;
  - Undo cancels and nothing is sent.
- **RegisterBoard:**
  - tap = here, tap again clears;
  - ⋯ sets Late / Excused / Absent, with an "I can't come" student pre-selecting Excused;
  - Finish turns untapped tiles absent, matching the footer;
  - swipe right = tap;
  - recent-visitor bubbles, remove with undo;
  - "No one came · Finish";
  - offline queue.
- **StudentOfficeHours:**
  - reason and note shown;
  - can't-come with undo;
  - own teachers first;
  - the journey hidden when switched off;
  - parent mode without tiles and without the reason before escalation.
- **School:**
  - HallFloor refetch without a skeleton flash;
  - TeachersBoard: nudge, mini board, sorting;
  - FollowUpBoard: ✓ and drag both ask for a note chip;
  - PolicyCard self-saves with undo;
  - ClosureCalendar: tap or drag range, then a confirm with the affected count;
  - *(P4b)* ImportDrop.
- **Charts:** colours come from the tokens only; a legend for ≥ 2 series; one y-axis.
- **Navigation:** one *Office Hours* item for every role, and the old URLs redirect.

### 15.3 Browser end-to-end (`backend/scripts/office-hours-e2e/e2e.cjs`, rewritten; `OFFICE_HOURS_FAKE_NOW`)

1. Teacher A (no days) taps Tue and Thu; teacher C taps Mon, Wed and Fri. Both autosave.
2. Student X sees A and C on the hall board and on the timetable band.
3. A assigns X once (reason + phrase) and taps Undo; nothing reaches X. A assigns again; after 10 s X's bell and page show day, time, place and reason.
4. Teacher B tries X, sees "assigned by A", and taps Ask to release; A sees the chip.
5. At the session, A taps X here, adds 2 visitors and taps Finish. X's lock is free, and B can now assign X.
6. A assigns Y for Thu, then Can't hold Thu → Fri. Y is told after the undo window, and the Fri session exists.
7. On an empty session, A taps No one came and the session is HELD.
8. Leadership checks Teachers (C declared; D missing → Nudge; sets D's days), Today, Follow-up (acknowledge with a note chip) and Reports (assigned/voluntary split, Table view), then exports CSV.
9. Axe AA with no horizontal overflow in light and dark at 390, 768 and 1366 px on the hub, register, student page and School view.

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

Every count except closures must be 0. If not, stop and export the data before running 103. Closures are kept as they are.

### 16.2 Release order

1. **Merge the MIS PR.** The automatic deploy ships v2 code, and until 103 is applied the API answers 503 `OFFICE_HOURS_NOT_SET_UP`.
2. **Apply 103 right after the deploy finishes, through `migrate.yml`,** which takes a mysqldump first. Never apply it *before* the deploy: the v1 scheduler still running would query renamed tables.
3. **Smoke check:**
   - `/office-hours/config` answers 401 (not 503);
   - the logs show the scheduler started;
   - a test teacher sees the day board.
4. **Leadership setup:** set `declaration_deadline` and review the policy and closures. Optionally run the P4b import.
5. **Merge the Tendo PR.**
6. **Announce** to staff with the one-page guide. The daily reminders then run until everyone has declared.
7. **After one clean week,** merge the v1 drop migration.

### 16.3 Risks

| Risk | Mitigation |
|---|---|
| The Academy Hall overcrowds on popular days | Live load on the day board and the leadership chart; soft cap later if needed (P2) |
| Typing visitors at 16:20 is slow | Recent-visitor bubbles, Enter-to-add, keyboard flow; kiosk later (P11) |
| The same-day register is too strict (network, power) | Offline queue; late saves accepted and flagged; leadership can correct |
| Showing reasons to students feels stigmatising | Student-friendly reason wording, no marks or scores, parents excluded until escalation (P5) |
| Few photos at first | Initials on subject colours look intentional; photos fill in as people sign in with Google |
| Gestures unfamiliar on older phones | Visible controls first, coach marks once, 6 px drag threshold |
| Rich graphics slow low-end devices | Lazy charts and celebration, SVG rings, virtualised visitor bubbles (> 80), reduced-motion path, measured in P6 |
| A cached PWA calls removed v1 endpoints | Service-worker cache bump; old URLs redirect to `/office-hours` |
| Tendo lane breaks | Compatible `/me` and `/sessions` fields; Tendo PR in the same release; updated test |
| v1 needed back | 103 only renames v1 tables; the drop happens after a clean week |

---

*Next step: run the §16.1 check, then start P1 on this branch.*
