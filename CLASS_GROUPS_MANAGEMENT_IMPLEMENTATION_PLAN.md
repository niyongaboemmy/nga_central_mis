# Class Groups Management — Implementation Plan

**Target:** a third tab on `/users` (`Users Management`), alongside **Management** and **Dashboard**.
**Tab label:** `Class Groups Management`
**Owner surface:** `frontend/src/components/Users.tsx` → new `frontend/src/components/classgroups/*`
**Status:** proposal / not yet implemented
**Date:** 2026-09-09

---

## 1. Executive summary

The MIS already has *every* backend capability this page needs — grades, class groups,
subjects, grade curricula, teacher-subject assignments, class-teacher (grade) assignments,
student class-group assignment, student subject enrollment, bulk enroll, bulk assign,
promotion preview/execute. What it does **not** have is a single place where an
administrator can see and act on all of them **around one organising entity: the class group**.

Today the same work is spread across:

| Concern | Where it lives now |
| --- | --- |
| Grades, Class Groups, Subjects, Course Categories | [Academics.tsx](frontend/src/components/Academics.tsx) — a 10-tab page |
| Teacher ↔ Subject ↔ Class Group | [TeacherAssignmentsTab.tsx](frontend/src/components/academics/TeacherAssignmentsTab.tsx) |
| Class teacher ↔ Grade ↔ Class Group | [ClassTeachersTab.tsx](frontend/src/components/academics/ClassTeachersTab.tsx) |
| Student ↔ Class Group, Student ↔ Subject | [EnrollmentManager.tsx](frontend/src/components/enrollment/EnrollmentManager.tsx) at `/enrollment` |
| People records | [UsersManagement.tsx](frontend/src/components/UsersManagement.tsx) at `/users` |

An admin setting up a new academic year currently visits **four routes and eight tabs**, with
no feedback on what is still incomplete. The new tab replaces that with a **class-group-centric
workspace**: pick a year + class group once, then drive every relationship from a single
context, with a readiness scorecard that tells you what is missing.

**Design stance (from the research below):** operators do not think in database tables, they
think in tasks. So this is *not* five CRUD tabs bolted together — it is one **workspace shell**
with a persistent context bar, a class-group **navigator** on the left, and five task **lenses**
on the right, all reading from the same shared store.

---

## 2. Research findings applied

Sourced from current SaaS/admin-UX pattern literature (see §14):

1. **List-detail / split view** — a master list (class groups) driving a detail pane keeps
   navigation cheap and preserves context. *Applied:* left navigator + right lens.
2. **Task-centric, not entity-centric** — organise around the flows operators actually run
   (open a year, staff a class, fill a roster), not around tables. *Applied:* the
   "Setup Checklist" and readiness rings are first-class, not an afterthought.
3. **Bulk-action bar tied visually to the selection** — a contextual bar that slides in on
   first selection, showing count, actions, and "select none"; disabled when empty; supports
   partial-selection state. *Applied:* one shared `BulkActionBar` across all five lenses.
4. **Sticky header + sticky identity column** in dense grids; clear sort indicators; inline
   row actions with overflow. *Applied:* the enrollment matrix and roster tables.
5. **Optimistic updates with rollback** for toggles that are individually cheap and
   frequently repeated (a checkbox in an enrollment matrix). Server-confirmed (pessimistic)
   for destructive/structural writes (delete class group, promote year).
6. **Preview-before-commit for irreversible batch operations** — promotion already has
   `/students/promotion-preview`; the same "diff then apply" shape is extended to bulk
   enrollment and copy-assignments.
7. **Progressive disclosure** — five lenses, but only one mounted-and-visible at a time;
   secondary detail lives in a right drawer, never a full page navigation.

---

## 3. Information architecture

```
/users
├── Management   (existing, untouched)
├── Dashboard    (existing, untouched)
└── Class Groups Management        ← NEW
    │
    ├── ContextBar   [Academic Year ▾] [Program ▾] [Grade ▾] [Class Group ▾] [⟳] [Setup Checklist ▸]
    │
    ├── Navigator (left, 280px, collapsible)
    │     Grade ▸ Class Group tree, each row showing
    │       • student count   • subject count   • teacher coverage ring   • class teacher avatar
    │       • search + "show only incomplete" toggle
    │
    └── Lens (right, fills)
          ├─ 1. Students                    — roster of the selected class group
          ├─ 2. Teachers                    — who teaches what here + class teacher
          ├─ 3. Subjects                    — the grade curriculum for this class
          ├─ 4. Grades & Class Groups       — structural CRUD (grades, class groups)
          └─ 5. Enrollments & Assignments   — the student × subject matrix + batch ops
```

**Key rule:** the ContextBar selection is *global to the tab*. Switching lenses never
resets it. Lens 4 (structure) is the only lens that may operate above the selected
class group — it works at the grade/program level.

---

## 4. The five lenses in detail

### Lens 1 — Students
*Question it answers: who is in this class, and is anyone missing?*

- Roster table for `class_group_id + academic_year_id` via `GET /academics/class-groups/:id/students`.
- Columns: avatar+name (sticky), username, email, gender, enrolled-subjects progress
  (`enrolled_count / total_subjects` from the roster endpoint), status chip, row actions.
- **Add students** panel: type-ahead over `GET /users/search`, multi-select, then
  `studentClassGroupApi.bulkAssign` (which auto-enrolls the grade curriculum server-side).
- **Move students**: select rows → `Move to…` → target class group picker → bulk assign.
- **Remove from class**: `studentClassGroupApi.remove`, confirm modal, pessimistic.
- **Unassigned students tray** (collapsible, top-right): students with the STUDENT role who
  have no `StudentClassGroup` row for the selected year. *Requires a new endpoint — see §6.1.*
- Bulk bar actions: `Move to class`, `Enroll in subjects…`, `Remove from class`, `Export`.

### Lens 2 — Teachers
*Question it answers: is every subject in this class actually taught by someone?*

- Two stacked sections:
  - **Class teacher** — the `UserGrade` assignment for (grade, class group, year).
    Single-card display with assign/replace/remove, via
    `assignGradeToUser` / `updateGradeAssignment` / `removeGradeFromUser` in
    [api/users.ts](frontend/src/api/users.ts).
  - **Subject teachers** — one row per subject in the grade curriculum, showing the assigned
    teacher or a red **"Unassigned"** slot. This is the *coverage view*, derived by joining
    `gradeSubjectsApi.getByGrade(gradeId)` against
    `teacherSubjectAssignmentsApi.getAll(yearId)` filtered to `class_group_id`.
- Inline assign: click an empty slot → teacher picker (searchable, shows current load) →
  `teacherSubjectAssignmentsApi.assign`.
- Reassign uses the existing tuple-swap `teacherSubjectAssignmentsApi.update`.
- **Copy from year** action surfaces `teacherSubjectAssignmentsApi.copy` with a
  preview of `{copied, skipped}` before commit.
- Bulk bar: `Assign teacher to selected subjects`, `Clear assignments`.

### Lens 3 — Subjects
*Question it answers: what is this class supposed to study?*

- The grade's curriculum: `gradeSubjectsApi.getByGrade(gradeId)`.
- Left = subjects **in** the curriculum, right = **available** subjects
  (`subjectsApi.getAll()` minus current), dual-list with drag or arrow transfer;
  writes via `gradeSubjectsApi.assign` / `gradeSubjectsApi.remove`.
- Each in-curriculum row shows three derived badges: **teacher assigned?**,
  **students enrolled (n/total)**, **has scheme of work?** (the third is optional, phase 3).
- Create-subject shortcut opens the same modal shape used by
  [SubjectsTab.tsx](frontend/src/components/academics/SubjectsTab.tsx) — reuse, do not fork.
- Guard: removing a subject from the curriculum warns when students are enrolled in it.

### Lens 4 — Grades & Class Groups
*Question it answers: is the structure right?*

- Two-column structural CRUD:
  - **Grades** (per program): create/edit/delete + `level_order` drag-reorder.
  - **Class Groups** (per selected grade): create/edit/delete.
- Delete uses the existing dependency machinery: call
  `classGroupsApi.dependencies(id)` first and render `blocking` vs `detachable` in the
  confirm modal, passing `force=true` only after the admin acknowledges the detachable list.
  *(This endpoint already exists and is currently only lightly surfaced — expose it fully.)*
- Program selector reuses `programsApi`; academic years/terms stay in Academics (out of scope
  for this tab — link out instead of duplicating).

### Lens 5 — Enrollments & Assignments
*Question it answers: who studies what, and what is still incomplete?*

The centrepiece. A **student × subject matrix** built on the single existing call
`enrollmentRosterApi.get(classGroupId, academicYearId)` — one request returns the class
group, its subjects, and per-student `enrolled_subject_ids`.

- Grid: students down (sticky first column), subjects across (sticky header, colour chip
  per subject), cell = checkbox.
- Interactions:
  - Click a cell → optimistic toggle → `studentEnrollmentApi.enroll` / `.unenroll`, rollback + toast on failure.
  - Click a **column header** → select/deselect that subject for every visible (filtered) student.
  - Click a **row label** → select/deselect all subjects for that student.
  - Shift-click for range selection; drag-paint across cells.
  - Selection accumulates into a **staged diff** (`+n enrollments, −m`) shown in the bulk bar;
    `Apply` commits via `studentEnrollmentApi.bulkEnroll` (adds) + parallel unenroll calls.
- Right rail: **Assignments** summary for the same class group — teacher-subject rows and the
  class-teacher card, read-only here with a "manage in Teachers lens" link (avoids two
  sources of truth for the same write).
- Year rollover block: **Promote** button opening the existing
  [PromoteStudentsModal.tsx](frontend/src/components/academics/PromoteStudentsModal.tsx)
  (`promotionApi.getPreview` → override/exclude → `promotionApi.execute`).

---

## 5. Cross-cutting: the Setup Checklist

A slide-over panel, openable from the ContextBar, computed client-side from the store for the
selected **academic year**:

| Check | Signal | Deep link |
| --- | --- | --- |
| Every grade has ≥1 class group | `classGroups.filter(g => g.grade_id === x).length` | Lens 4 |
| Every class group has students | roster student count | Lens 1 |
| Every grade has a curriculum | `gradeSubjects.length > 0` | Lens 3 |
| Every (class group × subject) has a teacher | coverage join | Lens 2 |
| Every class group has a class teacher | `UserGrade` rows | Lens 2 |
| Every student is enrolled in the full curriculum | `enrolled_count === total_subjects` | Lens 5 |

Each row is a click-through that sets the context and opens the right lens. This is what
turns five CRUD screens into a workflow.

---

## 6. Backend work

The backend is ~90% ready. Five additions, all additive and non-breaking.

### 6.1 `GET /academics/class-groups/overview` *(new)*
Powers the navigator and the checklist in one request instead of N.

```
Query:  academic_year_id (optional, defaults to current), program_id (optional)
Returns: [{
  class_group_id, class_group_name,
  grade_id, grade_name, level_order,
  program_id, program_name,
  student_count,             -- StudentClassGroup, status ACTIVE, this year
  curriculum_subject_count,  -- GradeSubject for grade_id
  taught_subject_count,      -- distinct subject_id in TeacherSubjectAssignment for (cg, year)
  class_teacher: { user_id, first_name, last_name } | null,   -- UserGrade
  fully_enrolled_student_count
}]
```
Controller: `academicController.ts`, alongside `getClassGroupEnrollmentRoster`.
Auth: `authenticate` + `authorize("VIEW_ACADEMICS")`.
Implementation: five grouped aggregate queries over `StudentClassGroup`, `GradeSubject`,
`TeacherSubjectAssignment`, `UserGrade`, `StudentSubjectEnrollment`, stitched in JS —
mirrors the style already used in `getClassGroupEnrollmentRoster`.

### 6.2 `GET /academics/students/unassigned` *(new)*
```
Query:  academic_year_id, program_id?, search?, page?, limit?
Returns: paginated users holding the STUDENT role with no ACTIVE
         StudentClassGroup row for the given year
```
Auth: `authorize("ASSIGN_STUDENT_CLASS_GROUPS")`. Backs the "unassigned tray" in Lens 1.

### 6.3 `POST /academics/teachers/bulk-assign-subjects` *(new)*
```
Body: { user_id, subject_ids: number[], class_group_id, academic_year_id? }
Returns: { assigned, skipped, total }
```
Symmetric with the existing `bulkEnrollStudentsInSubjects`. Auth: `MANAGE_ACADEMICS`.
Without it, staffing a 12-subject class is 12 sequential POSTs.

### 6.4 `POST /academics/students/bulk-unenroll-subjects` *(new)*
```
Body: { user_ids: number[], subject_ids: number[], academic_year_id? }
Returns: { unenrolled, skipped, total }
```
Needed to make the matrix's staged-diff `Apply` a single round trip in both directions.
Auth: `MANAGE_STUDENT_ENROLLMENTS`.

### 6.5 Extend `GET /users` with a `class_group_id` filter *(modify)*
`userController.getUsers` currently accepts `userRole, page, limit, search, status`
([userController.ts:535](backend/src/controllers/userController.ts#L535)). Add an optional
`class_group_id` + `academic_year_id` pair that joins `StudentClassGroup`. Purely additive;
existing callers are unaffected.

**Migrations:** none. No schema change is required — every relationship already exists in
[db/schema.ts](backend/src/db/schema.ts) (`StudentClassGroup`, `StudentSubjectEnrollment`,
`TeacherSubjectAssignment`, `UserGrade`, `GradeSubject`, `ClassGroup`, `Grade`).

---

## 7. Frontend architecture

### 7.1 New files

```
frontend/src/components/classgroups/
├── ClassGroupsManagement.tsx        # shell: context bar + navigator + lens router
├── ClassGroupsContext.tsx           # provider: selection + shared cache + invalidation
├── ContextBar.tsx                   # year / program / grade / class group selectors
├── ClassGroupNavigator.tsx          # left tree with readiness rings
├── SetupChecklistPanel.tsx          # slide-over readiness audit
├── BulkActionBar.tsx                # shared contextual action bar
├── ReadinessRing.tsx                # small SVG donut used in navigator + checklist
├── lenses/
│   ├── StudentsLens.tsx
│   ├── TeachersLens.tsx
│   ├── SubjectsLens.tsx
│   ├── StructureLens.tsx            # Grades & Class Groups
│   └── EnrollmentsLens.tsx          # matrix + assignments rail
└── __tests__/...
```

Plus:
- `frontend/src/api/classGroups.ts` — thin wrappers for the five new endpoints (§6),
  keeping [api/academics.ts](frontend/src/api/academics.ts) from growing further.
- `frontend/src/hooks/useClassGroupOverview.ts` — fetch + memoised derivations.

### 7.2 Files modified

- [Users.tsx](frontend/src/components/Users.tsx) — add the third tab. The existing pattern
  already keeps tabs permanently mounted behind `hidden` to preserve state; **do not** follow
  that for this tab. It is heavy (matrix + trees), so mount it lazily on first activation and
  keep it mounted thereafter:
  ```tsx
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["management"]));
  // on tab click: setVisited(prev => new Set(prev).add(tab))
  {visited.has("classgroups") && (
    <div className={activeTab === "classgroups" ? "" : "hidden"}>
      <ClassGroupsManagement />
    </div>
  )}
  ```
  Code-split it with `React.lazy` + `Suspense` so the matrix bundle never loads for admins
  who only use the Management tab.
- The tab strip is currently a `w-fit` pill row; with three tabs add `flex-wrap` and shorten
  the new label to **"Class Groups"** on `<sm` (`hidden sm:inline` on the long form).
- [Academics.tsx](frontend/src/components/Academics.tsx) / `/enrollment` — **left in place**.
  This tab is an additional, faster path, not a replacement. Deprecating the old screens is a
  separate decision (see §12).

### 7.3 State management

No data-fetching library is present (axios only — see `frontend/package.json`). Do **not**
introduce TanStack Query for this feature alone; instead:

- `ClassGroupsContext` holds: `academicYearId`, `programId`, `gradeId`, `classGroupId`,
  `activeLens`, plus caches keyed by those ids:
  `overview`, `gradesByProgram`, `classGroupsByGrade`, `rosterByClassGroup`,
  `curriculumByGrade`, `assignmentsByYear`, `subjects`.
- A single `invalidate(keys[])` helper that lenses call after a write — e.g. bulk-assigning
  students invalidates `overview` + `rosterByClassGroup[cg]`.
- Reference data (`academicYears`, `programs`, `subjects`) is fetched once per tab session.
- Selection persisted to `localStorage` under `nga.classgroups.context` so a reload lands the
  admin back where they were; validated against fetched ids before use.

### 7.4 Permissions

Reuse `usePermissions()` + `Permissions` from
[constants/permissions.ts](frontend/src/constants/permissions.ts). All five already exist:

| Lens / action | Permission |
| --- | --- |
| See the tab at all | `VIEW_ACADEMICS` or `MANAGE_USERS` |
| Lens 4 structural CRUD | `MANAGE_ACADEMICS` |
| Lens 3 curriculum edits | `MANAGE_ACADEMICS` |
| Lens 2 subject teachers | `MANAGE_ACADEMICS` |
| Lens 2 class teacher | `ASSIGN_GRADE_TO_CLASS_TEACHER` |
| Lens 1 class membership | `ASSIGN_STUDENT_CLASS_GROUPS` |
| Lens 5 enrollment | `MANAGE_STUDENT_ENROLLMENTS` |

Lenses the user cannot write to render **read-only** (visible, controls disabled with a
tooltip) rather than hidden — visibility of the whole picture is the point of the page.

---

## 8. Visual & interaction design

Stay inside the existing design language — do not invent a new one. The house style is
already established by `StatCard` / `CardShell` in
[UsersManagement.tsx](frontend/src/components/UsersManagement.tsx) and
[EnrollmentManager.tsx](frontend/src/components/enrollment/EnrollmentManager.tsx):

- Surfaces: `bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/30`
- Motion: `framer-motion`, `initial={{opacity:0,y:12}}`, staggered `delay` per card, `whileHover={{y:-2}}`
- Icons: `lucide-react` only
- Selects: reuse `ui/RichSelect`, `ui/SubjectSelect`, `ui/AcademicPeriodSelector`
- Modals/confirms: reuse `ui/Modal`, `ui/ConfirmModal`, `ui/Button`
- Toasts: `useToast()`

New pieces that must be built to match:
- **ReadinessRing** — 20px SVG donut, `stroke-dasharray` progress, colour ramp
  red `<50%` / amber `<100%` / emerald `100%`. Never colour-only: pair with a numeric label
  (`9/12`) for accessibility.
- **BulkActionBar** — fixed to the bottom of the lens pane, slides up on first selection
  (`AnimatePresence`, `y: 60 → 0`), shows `n selected`, primary actions, `Clear`.
  Announce count changes via `aria-live="polite"`.
- **Matrix cell** — 32px square target minimum, `focus-visible` ring, `role="checkbox"` with
  `aria-checked`, keyboard grid navigation (arrows move, space toggles, shift+arrow extends).

### Responsiveness
- `≥1280px`: navigator + lens side by side.
- `768–1279px`: navigator collapses to a drawer behind a `☰ Classes` button.
- `<768px`: lenses become a horizontally scrollable segmented control; the matrix degrades to
  a per-student accordion (student → subject checkbox list), which is the only usable form of a
  matrix on a phone.
- The matrix container always owns its own `overflow-x: auto`; the page body never scrolls
  horizontally.

### Performance
- Virtualise the matrix rows when `students.length > 60` (a small hand-rolled windowing hook
  is enough; avoid adding a dependency for one grid).
- Debounce all search inputs at the existing 350ms (`SEARCH_DEBOUNCE_MS`).
- Memoise every derived join (`useMemo` on coverage, readiness, filtered rows) — the coverage
  join is O(subjects × assignments) and runs on every keystroke otherwise.

---

## 9. Data-flow contracts (per lens)

| Lens | Reads | Writes |
| --- | --- | --- |
| Students | `class-groups/:id/students`, `class-groups/overview`, `students/unassigned`* | `students/bulk-assign-class-group`, `students/:u/class-groups/:c/years/:y` DELETE |
| Teachers | `grades/:id/subjects`, `teacher-assignments?academic_year_id`, `users/grade-assignments` | `teachers/assign-subject`, `teachers/assignment` PUT, `teachers/.../years/:y` DELETE, `teachers/bulk-assign-subjects`*, `users/:id/grades` |
| Subjects | `grades/:id/subjects`, `subjects` | `grades/assign-subject`, `grades/:g/subjects/:s` DELETE, `subjects` POST/PUT |
| Structure | `programs`, `grades`, `class-groups`, `class-groups/:id/dependencies` | `grades` CRUD, `class-groups` CRUD |
| Enrollments | `class-groups/:id/enrollment-roster` | `students/enroll-subject`, `students/bulk-enroll-subjects`, `students/bulk-unenroll-subjects`*, `students/promote-year` |

`*` = new endpoint from §6.

---

## 10. Phased delivery

Each phase ships independently and leaves the tab usable.

### Phase 0 — Scaffold (0.5 day)
- Add the third tab to `Users.tsx` with lazy mount + code-split.
- `ClassGroupsManagement` shell, `ClassGroupsContext`, `ContextBar` with year/program/grade/
  class-group selectors wired to existing APIs. Lens router with five empty panes.
- **Exit:** tab renders, selection persists across reloads, no lens content.

### Phase 1 — Navigator + overview endpoint (1.5 days)
- Backend §6.1 `class-groups/overview`.
- `ClassGroupNavigator` with counts + `ReadinessRing`; search and "only incomplete" filter.
- **Exit:** an admin can see, at a glance, which classes are unfinished.

### Phase 2 — Students & Structure lenses (2 days)
- Lens 1 (roster, add/move/remove, bulk bar) — backend §6.2 for the unassigned tray.
- Lens 4 (grades + class groups CRUD, dependency-aware delete).
- Shared `BulkActionBar`.
- **Exit:** the structure and the people in it are fully manageable from the tab.

### Phase 3 — Subjects & Teachers lenses (2 days)
- Lens 3 dual-list curriculum editor.
- Lens 2 coverage view + class teacher card + backend §6.3 bulk teacher assign + copy-from-year preview.
- **Exit:** staffing gaps are visible and closable in one screen.

### Phase 4 — Enrollments matrix (2.5 days)
- Lens 5 matrix on `enrollment-roster`, optimistic cells, column/row select, drag-paint,
  staged diff + `Apply`, backend §6.4 bulk unenroll.
- Assignments rail; promotion entry point reusing `PromoteStudentsModal`.
- Row virtualisation.
- **Exit:** the heaviest recurring task (year-start enrollment) is one screen, few clicks.

### Phase 5 — Checklist, polish, a11y (1.5 days)
- `SetupChecklistPanel` with deep links.
- Keyboard grid navigation, `aria-live` regions, focus management for drawers/modals.
- Responsive breakdown incl. the mobile accordion matrix.
- Export (xlsx, reusing the `XLSX` pattern already in `UsersManagement.handleExportExcel`).

**Total: ~10 developer-days.** Phases 0–2 alone (4 days) already deliver a coherent,
shippable improvement.

---

## 11. Testing

**Backend** (`backend/src/__tests__/`, following the existing `scopedSubjectsAndUsers.test.ts` shape):
- `class-groups/overview` — counts correct per year; class group with no students/subjects/
  teacher returns zeros and `class_teacher: null`; year filter isolates cohorts (the
  multi-year membership bug guarded against in `getClassGroupStudents` applies here too).
- `students/unassigned` — excludes students assigned in the queried year but *includes* those
  assigned only in a different year.
- `teachers/bulk-assign-subjects` / `students/bulk-unenroll-subjects` — idempotency (re-running
  yields `skipped`, not duplicates or errors), permission enforcement.
- `GET /users?class_group_id=` — filter applies, and its absence changes nothing.

**Frontend** (`vitest` + Testing Library, as in `components/__tests__/`):
- Context: selection cascade (changing grade clears class group; changing year refetches).
- Navigator: readiness ring maths; "only incomplete" filter.
- Matrix: optimistic toggle rolls back and toasts on rejected request; column-header select
  respects the active row filter (a known footgun — it must not select filtered-out students);
  staged diff produces the minimal enroll/unenroll sets.
- Permissions: a user without `MANAGE_STUDENT_ENROLLMENTS` sees the matrix read-only.
- Tab: lens content is not mounted until the tab is first opened.

**Manual QA script:** create year → create grade → create 2 class groups → add curriculum →
assign teachers → bulk-add 30 students → verify auto-enrollment → flip 3 cells → promote to
next year → confirm checklist goes all-green.

---

## 12. Risks & decisions

| Risk | Mitigation |
| --- | --- |
| **Duplicate sources of truth** with `/academics` and `/enrollment` | Same API layer, same modals, shared components. Nothing is forked. Reuse `PromoteStudentsModal` and the Subjects modal verbatim. |
| **Feature overlap confuses admins** | Phase 5: add a banner on `/enrollment` pointing at the new tab; consider retiring `/enrollment` and the Academics `Class Groups`/`Teacher Assignments`/`Class Teachers` tabs one release later — **a product decision, deliberately out of this plan's scope.** |
| Matrix performance on a 200-student class | Virtualisation + memoised joins; overview endpoint keeps the navigator off the roster call. |
| N+1 request storms from five lenses | Everything routes through the context cache with explicit invalidation; the overview endpoint collapses the navigator's N calls into 1. |
| Optimistic UI diverging from server truth | Optimistic only for the single-cell toggle; every batch operation is server-confirmed and refetches the roster. |
| Year-scoping mistakes | `academic_year_id` is required on every roster/assignment read and is owned by the ContextBar — never defaulted inside a lens. |
| Tab strip overflow on small screens | `flex-wrap` + abbreviated label. |

---

## 13. Definition of done

- [ ] Third tab present, lazy-loaded, permission-gated, keyboard reachable.
- [ ] All five lenses functional against the selected (year, program, grade, class group).
- [ ] Five backend endpoints shipped with tests; zero migrations; no breaking changes.
- [ ] Setup Checklist reports accurately and deep-links correctly.
- [ ] Bulk operations complete in one request each and report `{done, skipped}` in a toast.
- [ ] Read-only degradation verified for each permission independently.
- [ ] Dark mode, `<768px`, and `≥1280px` layouts verified.
- [ ] `npm run lint` and `npm run test` clean in `frontend/`; backend tests clean.

---

## 14. References

- [Bulk selection — PatternFly](https://www.patternfly.org/patterns/bulk-selection/)
- [List/details pattern — Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/list-details)
- [Bulk action UX: 8 design guidelines — Eleken](https://www.eleken.co/blog-posts/bulk-actions-ux)
- [SaaS Data Table & List View UX Patterns (2026)](https://www.saasui.design/blog/saas-data-table-ux-patterns)
- [Admin Dashboard UX Patterns for Operational Teams (2026) — GlitchLabs](https://www.glitchlabs.app/insights/admin-dashboard-ux-patterns)
- [Dashboard Design UX Patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Data Table Pattern — UX Patterns for Developers](https://uxpatterns.dev/patterns/data-display/table)
- [What is a Student Information System (SIS)? — Classe365](https://www.classe365.com/blog/what-is-a-student-information-system-sis-features-and-benefits/)
- [Student Enrollment Management Systems — FlowForma](https://www.flowforma.com/blog/student-enrollment-management-systems)
