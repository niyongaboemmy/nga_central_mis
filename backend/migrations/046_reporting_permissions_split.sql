-- Phase 6 of the Reporting Module Restructure — replaces the single
-- ALL_SUBMITTED_REPORTS permission with three narrower, purpose-specific
-- ones. ALL_SUBMITTED_REPORTS itself is NOT removed (still holds today's
-- roles) and continues to be checked as an OR-fallback alongside the new
-- permissions in every route guard, for at least one release cycle per the
-- plan's rollback strategy — this is a permission-model refinement, not an
-- access reduction, and existing admins should not lose access on cutover.
--
-- VIEW_REPORTS already existed as an unused constant (defined in both
-- backend/frontend permissions.ts, grouped under "reports" in the frontend's
-- permission-management UI) but was never seeded into the Permission table
-- nor checked by any route — adopted here for its evidently intended
-- purpose rather than introducing a colliding name.

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_REPORTS', 'View lesson/mentorship/project reports and admin analytics (read-only)', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_REPORTS');

INSERT INTO Permission (name, description, status)
SELECT 'EXPORT_REPORTS', 'Export/download reporting data (CSV, PDF, rollup)', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'EXPORT_REPORTS');

INSERT INTO Permission (name, description, status)
SELECT 'MANAGE_REPORTS', 'Manage reporting lookup lists (Support/Challenge categories) and future admin edit/delete actions', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'MANAGE_REPORTS');

-- Grant all three to every role that currently holds ALL_SUBMITTED_REPORTS,
-- so no existing admin loses access on cutover.
INSERT INTO RolePermission (role_id, perm_id)
SELECT rp.role_id, p.perm_id
FROM RolePermission rp
JOIN Permission existing ON rp.perm_id = existing.perm_id AND existing.name = 'ALL_SUBMITTED_REPORTS'
JOIN Permission p ON p.name IN ('VIEW_REPORTS', 'EXPORT_REPORTS', 'MANAGE_REPORTS')
WHERE NOT EXISTS (
  SELECT 1 FROM RolePermission existing_grant
  WHERE existing_grant.role_id = rp.role_id AND existing_grant.perm_id = p.perm_id
);
