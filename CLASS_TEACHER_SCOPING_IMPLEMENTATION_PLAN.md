# Class-Teacher / Program-Lead Scoping + Users Stats Consolidation — Implementation Plan

## Problem statement

1. **Scoped pages don't consistently honour `assignedGrades` / `assignedPrograms`.**
   - `Class Subjects` and `Class Users` loop `getSubjectsByGrade` / `getUsersByGrade`
     **once per assigned grade** (N requests), then dedupe client-side. Pagination is
     computed against a client-side slice, so `X-Total-Count` from the server is
     meaningless and page 2+ re-fetches the same rows.
   - `Class Subjects` renders duplicate teacher chips (see screenshot: "Niyitegeka
     Faustin" three times) because `getSubjectsByGrade` joins
     `TeacherSubjectAssignment × ClassGroup` and emits one row per class group /
     year, with no dedupe on `user_id`.
   - `Class Users` groups by `role_name`, but `getUsersByGrade` joins `UserRole ×
     Role` producing one row per role and then dedupes by `user_id`, so a
     multi-role user is silently filed under whichever role row won the race.
   - `Academic Calendar` requires the user to manually pick a class group, and the
     dropdown lists **every** class group in the year. A class teacher should land
     directly on their own class group's calendar and should not see others'.
   - Scoping is client-side only in the calendar (`grade_name` string matching in
     `handleCreateCalendarClick`) — not enforced by the backend.

2. **`users?page=1&limit=1&userRole=<n>[&status=ACTIVE]` request storm.**
   `utils/userRoleCounts.ts` issues `3 + 2 × roles` requests just to get counts
   (with 12 roles that is 27 requests, visible in the Network panel). Each one runs
   the full `getUsers` handler including per-user role/permission/profile fan-out.
   `UsersManagement` and `UsersDashboard` both call it, and the 30s TTL cache does
   not cover the case where the two mount in the same tick with `force`.

## Design

### Scope model

`GET /users/me` already returns:

- `assignedGrades: [{ grade_id, name, class_group_id, program_id, ... }]` — class
  teacher assignments, **scoped to a specific class group** and the current year.
- `assignedPrograms: [{ program_id, name }]` — program lead assignments.
- `allGrades: [{ grade_id, program_id, ... }]` — used to expand programs → grades.

Effective scope (both client and server compute this the same way):

| assignedGrades | assignedPrograms | scope |
| --- | --- | --- |
| non-empty | any | those grades + those class groups (narrowest) |
| empty | non-empty | every grade in those programs; all class groups within |
| empty | empty | unscoped (admin) — no filtering applied |

Server-side helper `resolveUserScope(userId, academicYearId)` in a new
`backend/src/services/userScope.ts` returns
`{ scoped: boolean, gradeIds: number[], classGroupIds: number[], programIds: number[] }`.
This is the **enforcement** point; the client-side hook only drives defaults/UI.

### Backend changes

**`backend/src/services/userScope.ts` (new)**
- `resolveUserScope(userId, academicYearId?)` — reads `UserGrade` (current year) →
  grade + class group ids; falls back to `UserProgramLead` → programs → grades →
  class groups. Returns `scoped: false` when both are empty.
- `intersectScope(requested, scope)` — clamps caller-supplied `grade_ids` to the
  resolved scope so a scoped user can narrow but never widen.

**`userController.ts`**
- `getScopedSubjects` — `GET /users/scope/subjects?grade_ids=&search=&page=&limit=`
  One query across all scoped grades. Subjects deduped by `subject_id`, teachers
  deduped by `user_id` inside each subject (fixes the repeated chips), each subject
  annotated with the `grades` / `class_groups` it belongs to. Server-side search +
  pagination, correct `X-Total-Count`.
- `getScopedUsers` — `GET /users/scope/users?grade_ids=&search=&role=&page=&limit=`
  Students (via `StudentClassGroup`) ∪ teachers (via `TeacherSubjectAssignment`),
  deduped by `user_id`, each with **all** their roles as an array (not one row per
  role) plus `grade_names` / `class_group_names`. Also returns a
  `X-Role-Breakdown` style `roleGroups` block in the payload so the UI can render
  role tabs with counts without a second request.
- `getScopedUserDetail` — `GET /users/scope/users/:id`
  Read-only profile payload (user, profile, roles+permissions, grades, class
  groups, programs, subjects taught/enrolled). **403 unless the target user falls
  inside the requester's scope.** Needed because `GET /users/:id` is a
  general-purpose route and the read-only viewer must not require `MANAGE_USERS`.
- `getUserStats` — `GET /users/stats`
  Replaces the `3 + 2N` fan-out with two `GROUP BY` queries:
  ```
  overall: SELECT status, COUNT(*) FROM User GROUP BY status
  perRole: SELECT ur.role_id, u.status, COUNT(*) FROM UserRole ur
           JOIN User u USING (user_id) GROUP BY ur.role_id, u.status
  ```
  Response: `{ overall: {total, active, disabled}, roles: [{role_id, name, total, active, disabled}] }`.
  Optional `?search=` mirrors the list filter so the chips stay in sync.
- `getCalendarClassGroups` (calendarController) — add `grade_id` to the select and
  clamp results to `resolveUserScope` when the requester is scoped.

**`routes/users.ts`** — register `/stats` and `/scope/*` **before** `/:id`.
Authorization:
- `/stats` → `VIEW_USERS` (same audience as the management list).
- `/scope/subjects` → `VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE`.
- `/scope/users`, `/scope/users/:id` → `VIEW_USERS_BY_CLASS_TEACHER_GRADE`.

Existing `/grades/:gradeId/users|subjects` routes stay (other callers / back-compat)
but get the same teacher/role dedupe fix.

### Frontend changes

**`hooks/useScopedGrades.ts` (new)** — derives
`{ isScoped, gradeIds, classGroupIds, grades, classGroups, programIds }` from
`useUser()` using the table above.

**`api/users.ts`** — `getScopedSubjects`, `getScopedUsers`, `getScopedUserDetail`,
`getUserStats` typed wrappers.

**`utils/userRoleCounts.ts`** — `fetchUserBreakdown` becomes a single
`getUserStats()` call, mapped into the existing `UserBreakdown` shape so
`UsersManagement` / `UsersDashboard` need no change beyond the import. Keeps the
TTL cache + in-flight dedupe (now guarding one request instead of 27), and makes
`force` reuse an in-flight promise so two components mounting together share it.

**`ClassTeacherSubjectsPage.tsx`** — one `getScopedSubjects` call; server-side
search and pagination; grade/class-group badges on each card so a teacher covering
two grades can tell them apart.

**`ClassTeacherUsersPage.tsx`** — one `getScopedUsers` call; role tabs driven by the
server `roleGroups` counts (a user with two roles appears under both); opens the new
read-only viewer.

**`components/UserProfileViewer.tsx` (new, read-only)** — deliberately *not*
`UserProfileModal` (which carries role assignment, enable/disable, profile editing).
A right-side drawer:
- Gradient identity header: initials avatar, full name, username, status pill,
  user-type pill; quick copy-to-clipboard on email/phone.
- Stat strip: roles count, grades count, subjects count.
- Collapsible sections — *Contact*, *Personal*, *Academic placement* (grades +
  class groups), *Roles* (each role expands to its permission chips), *Subjects*.
- Zero mutating controls, zero write API imports. Loading skeleton + empty states.
- Reuses `StatusBadge` / `UserTypeBadge` from `UserProfileTabs/TabShared`.

**`AcademicCalendar.tsx` + `calendar/CalendarHeader.tsx`** — for a scoped user:
- Class-group dropdown lists only scoped class groups (server already clamps).
- On load, auto-select the calendar for `assignedGrades[0].class_group_id`; if no
  calendar row exists yet, select the synthetic placeholder so the existing
  "Create calendar for X" prompt shows.
- Replace the `grade_name` string match in `handleCreateCalendarClick` with
  `class_group_id` / `grade_id` matching.

## Testing

**Backend (`vitest`, disposable `${DB_NAME}_test` schema)** — new
`backend/src/__tests__/`:
- `userStatsEndpoint.test.ts` — counts match a seeded fixture; per-role
  active/disabled split correct; role with zero users returns zeros; one request
  replaces the fan-out.
- `scopedSubjectsAndUsers.test.ts` — teacher assigned to a subject in two class
  groups appears **once**; multi-role user carries both roles; results clamped to
  scope; a `grade_ids` value outside scope is rejected/clamped; program-lead
  fallback resolves grades; unscoped admin sees everything.
- `scopedUserDetailAuthorization.test.ts` — in-scope target → 200; out-of-scope
  target → 403; no `MANAGE_USERS` required.
- `calendarClassGroupScoping.test.ts` — scoped user gets only their class groups
  and each row carries `grade_id`.

**Frontend (`vitest` + Testing Library)**:
- `useScopedGrades.test.ts` — the three scope rows of the table.
- `userRoleCounts.test.ts` — exactly one HTTP call for a 12-role input; cache and
  concurrent-call dedupe hold.
- `UserProfileViewer.test.tsx` — renders identity/roles/grades, and asserts no
  button with an edit/save/assign affordance is present.

Full `npm test` in both packages must pass before deploy.

## Deploy

No schema migration required (read-only endpoints over existing tables).

CI (`.github/workflows/deploy.yml`) deploys on push to `main`: builds the frontend
on the runner, ships `dist/`, rebuilds + restarts `mis-backend` over SSH, reloads
nginx. So deployment = commit to a branch, verify, then merge/push `main` — with
the user's confirmation before the push.

## Order of work

1. `userScope.ts` service + backend endpoints + route wiring.
2. Backend tests → green.
3. Frontend hook, API wrappers, `userRoleCounts` consolidation.
4. Page rewrites (Subjects, Users) + `UserProfileViewer`.
5. Calendar scoping/default selection.
6. Frontend tests → green; typecheck + build.
7. Deploy.
