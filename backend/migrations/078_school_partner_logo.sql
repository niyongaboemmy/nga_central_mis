-- ============================================
-- School: second logo slot for printed reports (Scheme of Work, etc.)
-- ============================================
-- The Scheme of Work PDF cover page shows two logos (school + partner
-- programme). `logo` remains the primary/left logo; `partner_logo` is the
-- new second/right slot -- both are plain URL strings uploaded through
-- POST /schools/:schoolId/logo, same shape as the existing column.

ALTER TABLE `School`
  ADD COLUMN `partner_logo` VARCHAR(500) DEFAULT NULL AFTER `logo`;
