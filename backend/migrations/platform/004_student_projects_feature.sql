-- Student side projects feature key (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md §4.6).
--
-- Control plane only (PLATFORM_DB_NAME). Core for every package: the key exists so a school
-- can have it switched off with an override later. Idempotent; MySQL 5.7 and 8.

INSERT IGNORE INTO `PackageEntitlement` (`package_code`, `ent_key`, `kind`, `value_int`) VALUES
  ('starter', 'feature.student_projects', 'FEATURE', NULL),
  ('gold', 'feature.student_projects', 'FEATURE', NULL),
  ('premium', 'feature.student_projects', 'FEATURE', NULL),
  ('max', 'feature.student_projects', 'FEATURE', NULL);
