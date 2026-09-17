-- Adds the permission behind the class teacher's own "Class Calendar" page
-- (/class-calendar), the calendar counterpart to VIEW_USERS_BY_CLASS_TEACHER_GRADE
-- and VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE.
--
-- WHY A SEPARATE PERMISSION
--
-- CLASS_TEACHER already holds MANAGE_ACADEMIC_CALENDAR / VIEW_ACADEMIC_CALENDAR,
-- which is what the school-wide "Academic Calendar" page is gated on. That page
-- opens on a picker listing class groups and expects the user to choose one.
-- A class teacher only ever has one right answer, so they get their own entry
-- that lands directly on their assigned class group's timetable.
--
-- Gating that entry on its own permission (rather than reusing
-- VIEW_ACADEMIC_CALENDAR) is what lets an admin keep the school-wide page while
-- hiding the scoped one, and vice versa -- and it means revoking the scoped page
-- does not also revoke calendar access for every other role.
--
-- Note the reads themselves are confined server-side by resolveUserScope
-- (getCalendarSlots / getAcademicCalendars / getCalendarActivities), so this
-- permission grants the *page*, never a wider slice of the school.

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE',
       'View the weekly calendar of the class group a class teacher is assigned to',
       'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM Permission WHERE name = 'VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE'
);

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name = 'VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE'
WHERE r.name IN ('CLASS_TEACHER', 'SUPER_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp
    WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
