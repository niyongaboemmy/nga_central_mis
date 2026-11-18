-- 134: supervising is its own role.
-- A project's supervisor guides and reviews it from outside the team, so it can't be the owner
-- or a teammate (the API refuses both from now on). This clears the rows that break the rule
-- today, logging each change on the project's timeline. The owner or team can then pick a
-- different staff member. Idempotent: a second run finds nothing to clear.

-- Owner set as their own supervisor.
INSERT INTO SideProjectEvent (project_id, actor_id, type, from_value, to_value, note, created_at)
SELECT sp.project_id, NULL, 'SUPERVISOR', CAST(sp.supervisor_user_id AS CHAR), NULL,
       'Cleared: the owner cannot supervise their own project', UTC_TIMESTAMP()
FROM SideProject sp
WHERE sp.supervisor_user_id IS NOT NULL AND sp.supervisor_user_id = sp.owner_user_id;

UPDATE SideProject SET supervisor_user_id = NULL
WHERE supervisor_user_id IS NOT NULL AND supervisor_user_id = owner_user_id;

-- Supervisor who is also on the team (invited or accepted): they stay a teammate.
INSERT INTO SideProjectEvent (project_id, actor_id, type, from_value, to_value, note, created_at)
SELECT sp.project_id, NULL, 'SUPERVISOR', CAST(sp.supervisor_user_id AS CHAR), NULL,
       'Cleared: a teammate cannot also supervise the project', UTC_TIMESTAMP()
FROM SideProject sp
WHERE sp.supervisor_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM SideProjectMember m WHERE m.project_id = sp.project_id AND m.user_id = sp.supervisor_user_id);

UPDATE SideProject sp
SET sp.supervisor_user_id = NULL
WHERE sp.supervisor_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM SideProjectMember m WHERE m.project_id = sp.project_id AND m.user_id = sp.supervisor_user_id);
