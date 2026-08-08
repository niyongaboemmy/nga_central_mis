# Academic Assignment Workflows — Bulk Actions Implementation Plan

**Date:** 2026-08-04
**Author:** Senior fullstack review (Claude)
**Precedes:** builds on the "Copy Class Groups to [academic year]" feature already shipped this session (`classGroupsApi.copy`, `ClassGroupsTab.tsx`) — that is the reference pattern this plan extends to other assignment types.

---

## 1. The problem, stated precisely

Every "who is assigned to what" relationship in the Academics domain is entered **one record at a time, through a per-person modal**, with no bulk path and no way to reuse last year's setup:

| Assignment type | Where it's entered today | What one submission covers |
|---|---|---|
| Teacher → Subject (+ Class Group) | `TeacherSubjectAssignment.tsx`, opened from **one teacher's** profile | 1 teacher × 1 subject × 1 class group |
| Program Lead | `ProgramsTab.tsx`, opened from **one user's** profile | 1 user × 1 program × 1 year |
| Class Teacher of a Grade | `GradesTab.tsx`, opened from **one user's** profile | 1 user × 1 grade × 1 year |
| Student → Subject | `StudentEnrollmentTab.tsx`, opened from **one student's** profile | 1 student × 1 subject × 1 year |
| Student → Class Group | same tab, same student | 1 student × 1 class group |

At real school scale (tens of teachers, dozens of class groups, hundreds of students), rolling over to a new academic year means opening the same modal dozens or hundreds of times, re-entering assignments that are usually **unchanged from last year**. This is the concrete complaint: *"it is more difficult to enroll all teachers at first time... it should be a one button to click."*

The only exception is `copyClassGroups` (shipped this session): pick a source year, pick a target year, click once, and every class group is recreated in the target year (skipping ones that already exist). This plan extends that same shape to the assignment types above, where it fits, and explains why it *doesn't* fit cleanly everywhere.

---

## 2. Which assignment types should get a "Copy from previous year" button — and which shouldn't

### 2.1 Teacher → Subject assignment — yes, this is the main ask

This is the direct pain point named in the request, and it's the best fit: a teacher's subject-and-class-group load is usually **stable year to year** (same teacher, same subject, same grade — just a new class group instance for the new year). This is exactly the same shape of problem `copyClassGroups` already solved for class groups themselves.

**The one wrinkle**: `TeacherSubjectAssignment` has no direct `academic_year_id` — it points at a `class_group_id`, and `ClassGroup` rows are **recreated per year** (a new row, new `class_group_id`, even if the name "Coding A" is identical). So a straight `INSERT ... SELECT` copy (like `copyClassGroups` does) won't work directly — last year's `class_group_id` doesn't exist as a valid target-year class group.

**Resolution**: match by `(grade_id, name)` — the same identity `copyClassGroups` already uses to detect duplicates. Concretely, for each `TeacherSubjectAssignment` row in the source year:
1. Look up its `class_group_id`'s `(grade_id, name)`.
2. Find the target year's `ClassGroup` with the same `(grade_id, name)`.
3. If found and no existing `(user_id, subject_id, that class_group_id)` row exists in the target year → insert it.
4. If not found (the target year doesn't have an equivalent class group yet — e.g., admin hasn't run "Copy Class Groups" first) → **skip and report**, don't error the whole batch.

This means **Copy Class Groups should be a prerequisite step** run before **Copy Teacher Assignments** — the UI should make this ordering obvious (see §4).

### 2.2 Program Lead & Class Teacher of a Grade — yes, same shape, smaller lift

Both are already year-scoped (from this session's earlier migration) and point at stable, year-agnostic targets (`Program`, `Grade` — no per-year row to re-match, unlike `ClassGroup`). This makes them **simpler** to copy than teacher-subject assignments: no matching step needed, just `(user_id, program_id/grade_id)` pairs copied straight into the target year, skipped if already present. Low effort, same pattern.

### 2.3 Student → Subject / Student → Class Group — no, not a straight copy

Recommend **against** a blind "copy" button here, and this is worth stating explicitly since it's the most tempting one to lump in:

- A student's class group changes every year **on purpose** (they're promoted a grade). Copying "Student X was in ClassGroup Coding-A" from last year into this year is usually **wrong**, not a time-saver — Student X should now be in the *next* grade's class group, not the same one.
- Subject enrollment is downstream of class group (the enrollment wizard already gates subject enrollment behind having a class group for the year), so it inherits the same problem.

**What actually helps students instead** (separate, smaller effort, not this plan's Phase 1): a **"Promote class"** action — pick a class group in the source year, pick its equivalent next grade in the target year, and bulk-move every student from the old class group into the new one. That's a different operation (grade *progression*, not year *duplication*) and deserves its own design pass rather than being force-fit into the "copy" pattern. Flagging it here as a follow-up, not building it now.

---

## 3. Backend design (Teacher Subject Assignment — the priority item)

### 3.1 New endpoint

`POST /academics/teachers/copy-assignments`

```ts
{ source_academic_year_id: number, target_academic_year_id: number }
```

Mirrors `copyClassGroups`'s controller shape exactly (`academicController.ts`):

```ts
export const copyTeacherSubjectAssignments = asyncHandler(async (req, res) => {
  const { source_academic_year_id, target_academic_year_id } = req.body;
  // ...validate both years exist, are different...

  // 1. Load source-year assignments with their class group's (grade_id, name)
  const sourceAssignments = await db
    .select({
      user_id: TeacherSubjectAssignment.user_id,
      subject_id: TeacherSubjectAssignment.subject_id,
      grade_id: ClassGroup.grade_id,
      class_group_name: ClassGroup.name,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(ClassGroup, eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id))
    .where(eq(ClassGroup.academic_year_id, sourceYearId));

  // 2. Load target-year class groups, build a (grade_id, name) -> class_group_id map
  const targetGroups = await db.select(...).from(ClassGroup).where(eq(ClassGroup.academic_year_id, targetYearId));
  const targetGroupMap = new Map(targetGroups.map(g => [`${g.grade_id}::${g.name}`, g.class_group_id]));

  // 3. Load existing target-year assignments to skip duplicates
  const existingTarget = await db.select(...).from(TeacherSubjectAssignment)... // where class_group in targetGroups
  const existingKeys = new Set(existingTarget.map(a => `${a.user_id}::${a.subject_id}::${a.class_group_id}`));

  // 4. Resolve + classify each source row
  let copied = 0, skippedNoClassGroup = 0, skippedDuplicate = 0;
  const toInsert = [];
  for (const a of sourceAssignments) {
    const targetClassGroupId = targetGroupMap.get(`${a.grade_id}::${a.class_group_name}`);
    if (!targetClassGroupId) { skippedNoClassGroup++; continue; }
    const key = `${a.user_id}::${a.subject_id}::${targetClassGroupId}`;
    if (existingKeys.has(key)) { skippedDuplicate++; continue; }
    toInsert.push({ user_id: a.user_id, subject_id: a.subject_id, class_group_id: targetClassGroupId });
    copied++;
  }
  if (toInsert.length) await db.insert(TeacherSubjectAssignment).values(toInsert);

  successResponse(res, "Teacher assignments copied", { copied, skippedNoClassGroup, skippedDuplicate, total: sourceAssignments.length });
});
```

Route: `authorize("MANAGE_ACADEMICS")`, same as every other teacher-subject-assignment route.

The three-way result breakdown (`copied` / `skippedNoClassGroup` / `skippedDuplicate`) matters for UX — an admin who forgot to copy class groups first should see *why* rows were skipped, not just a bare count (see §4).

### 3.2 Program Lead / Grade copy endpoints

Same shape, simpler (no class-group matching step needed):

- `POST /academics/programs/copy-leads` — `{ source_academic_year_id, target_academic_year_id }`, copies `UserProgramLead` rows keyed on `(user_id, program_id)`, skips existing.
- `POST /users/grades/copy-assignments` — same for `UserGrade`, keyed on `(user_id, grade_id)`.

---

## 4. Frontend design — where the button lives and what it looks like

### 4.1 The core UX problem to solve, not just "add a button"

Today there is **no page that lists all teacher-subject assignments across all teachers** — the only view is per-teacher, inside that teacher's profile modal. Bolting a "Copy" button onto a per-teacher view wouldn't make sense (whose assignments would it even be copying?). So this plan includes creating a small admin overview, not just an endpoint:

**New tab: "Teacher Assignments"** inside the Academics settings area (`Academics.tsx`, alongside the existing `Academic Years / Academic Terms / Programs / Grades / Course Categories / Subjects / Class Groups` pill-nav — becomes an 8th tab), structurally a near-copy of `ClassGroupsTab.tsx`:

- Table columns: **Teacher, Subject, Class Group, Grade, Academic Year**, filterable by year (same year-filter `<select>` pattern already built for `ClassGroupsTab`).
- Header actions: **Refresh**, **Assign Teacher to Subject** (opens the existing per-record modal, reused as-is), and the new **Copy Teacher Assignments** button.

### 4.2 The "Copy Teacher Assignments" modal

Same shape as the "Copy Class Groups" modal already shipped (`ClassGroupsTab.tsx`'s copy modal), reused almost verbatim:

- **Copy from** — source year select, showing assignment counts per year (e.g. "2025-2026 (42 assignments)").
- **Copy to** — target year select, defaulting to whichever year is currently empty/being viewed.
- A **preflight hint**, computed client-side before submit: *"Target year has 12 of 16 class groups from the source year. 4 assignments may be skipped until those class groups are copied too."* — this directly addresses the ordering dependency from §2.1, so the admin isn't surprised by a partial result. If class groups haven't been copied at all yet, show a stronger nudge: *"No matching class groups found in [target year] — run 'Copy Class Groups' on the Class Groups tab first."* with a shortcut link to that tab.
- On submit, show the same three-part result toast pattern as the class-group copy: *"Copied 38 assignments; 4 skipped (no matching class group yet); 0 already existed."*

### 4.3 Program Lead / Grade copy buttons

Smaller surface — add a **"Copy from previous year"** button directly to the existing per-user `ProgramsTab.tsx` / `GradesTab.tsx`? **No** — same reasoning as §4.1: copying is inherently an *all-users-at-once* operation ("apply last year's program leads to this year"), not a per-user one, so it doesn't belong on a single user's profile.

Instead: add it to wherever Program Leads / Grade-Teachers are administered in bulk today. Worth checking whether such a page exists (e.g. under Programs tab or a Roles/Staffing admin page) before designing new UI — if no such page exists yet, the minimal-effort option is a small "Copy Assignments" action within the existing **Programs** and **Grades** tabs of `Academics.tsx` (parallel structure to Class Groups), each with the same source/target year modal.

---

## 5. Phased rollout

| Phase | Scope | Effort | Depends on |
|---|---|---|---|
| **1** | `copyTeacherSubjectAssignments` backend endpoint + route | Small | — |
| **2** | New "Teacher Assignments" tab in `Academics.tsx` (list view, reusing `ClassGroupsTab.tsx`'s structure) with year filter | Medium | — |
| **3** | "Copy Teacher Assignments" modal wired into the new tab, with the preflight class-group-coverage hint | Small | Phases 1–2 |
| **4** | `copyProgramLeads` / `copyGradeAssignments` backend endpoints | Small | — |
| **5** | Copy buttons for Program Lead / Grade Teacher, wherever those end up being administered in bulk (existing page, or new tabs mirroring Phase 2) | Medium | Phase 4 |
| **6** *(separate effort, not bundled here)* | "Promote Class" flow for students (§2.3) — bulk move students from one year's class group into the next grade's class group in the new year | Medium–Large | Independent of 1–5 |

**Recommended starting point**: Phases 1–3 (Teacher Subject Assignment) — it's the explicit pain point named in the request, has the clearest ROI, and establishes the reusable pattern (list tab + copy modal + preflight hint) that Phases 4–5 then just repeat for Program Lead / Grade.

---

## 6. Open questions before building

1. **Is there already a bulk staffing/roles admin page** for Program Lead / Class Teacher assignments that I haven't found? Worth a quick check before designing new tabs in Phase 5.
2. **Should "Copy Teacher Assignments" require class groups to already exist**, or should it auto-create missing target-year class groups inline (extending the copy to cascade)? Recommend **no auto-cascade** — keep the two actions separate and explicit (the preflight hint nudges the admin to run Class Groups copy first), since silently creating class groups as a side effect of an assignment-copy button would be a surprising, hard-to-audit side effect.
3. **Scale check**: dev DB currently has only 6 `TeacherSubjectAssignment` rows total, too small to validate real-world tedium. Worth pulling a rough count from the production DB (or asking the school directly) — teachers × subjects × class groups per year — to confirm this is worth Phase 2's UI investment versus just shipping Phase 1's endpoint behind a simpler UI (e.g., a one-off admin action without a full list-view tab).
