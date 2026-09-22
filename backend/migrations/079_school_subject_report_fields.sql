-- ============================================
-- Scheme of Work PDF cover page: source institutional fields from their
-- real owning entities instead of duplicating them per-scheme
-- ============================================
-- Sector/Trade/Qualification Title are School-level facts (the same for
-- every scheme this school produces), and RQF Level/Learning Hours are
-- Subject-level facts (the same for every scheme of that subject) -- so
-- they belong on School and Subject respectively, not re-entered per
-- SchemeOfWork row. The SchemeOfWork.sector/trade/qualification_title/
-- rqf_level/learning_hours_per_week columns added in migration 077 are
-- left in place (additive-only policy) but are no longer read by the PDF
-- renderer or exposed in the cover-page editor.

ALTER TABLE `School`
  ADD COLUMN `sector` VARCHAR(100) DEFAULT NULL,
  ADD COLUMN `trade` VARCHAR(150) DEFAULT NULL,
  ADD COLUMN `qualification_title` VARCHAR(255) DEFAULT NULL;

ALTER TABLE `Subject`
  ADD COLUMN `rqf_level` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `learning_hours` VARCHAR(100) DEFAULT NULL;
