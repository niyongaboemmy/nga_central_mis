-- ============================================
-- School: dedicated logo for reports/documents (Scheme of Work PDF header, and any future
-- generated document), distinct from the cover-page logos
-- ============================================
-- `logo`/`partner_logo` (migration 078) are the two cover-page logo slots on the Scheme of
-- Work's first page. The running header repeated on every page is a different, smaller mark
-- (matching the correct template's single logo top-left) -- schools may reasonably want a
-- simplified/cropped version there rather than reusing a cover-page logo, so it gets its own
-- field rather than being hardcoded to `logo`.

ALTER TABLE `School`
  ADD COLUMN `documents_logo` VARCHAR(500) DEFAULT NULL AFTER `partner_logo`;
