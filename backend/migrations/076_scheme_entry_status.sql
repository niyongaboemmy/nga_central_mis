-- ============================================
-- Scheme of Work: explicit per-week entry status (fixes vanishing skip weeks)
-- ============================================
-- AI generation's "skip weeks" (holidays/breaks) used to be omitted from
-- the database entirely, so the calendar/timeline/PDF had no row at all
-- for that week and rendered a blank, unlabeled gap instead of a visible
-- placeholder. entry_status makes "this week is intentionally empty"
-- (SKIPPED) a real, queryable state, distinct from a week that's simply
-- not filled in yet (PLANNED) or delivered (COMPLETED).
--
-- is_completed is left untouched for backward compatibility; entry_status
-- is the new source of truth going forward.

ALTER TABLE `SchemeOfWorkEntry`
  ADD COLUMN `entry_status` ENUM('PLANNED','SKIPPED','COMPLETED') NOT NULL DEFAULT 'PLANNED' AFTER `is_completed`;
