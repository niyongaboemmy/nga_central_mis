-- @tenant: primary-only
-- 144: NGA's logo path was overwritten with the placeholder text 'uploaded' (the old
-- Tenants & Schools form sent it back on Save after an upload), so the logo showed as a
-- broken image everywhere. The file itself was never lost: put its path back.
-- Only touches the placeholder value, so a logo uploaded since then is kept. Re-runnable.
UPDATE `School`
SET `logo` = 'schools/1/logo-primary-1794404100464.png'
WHERE `school_id` = 1 AND `logo` = 'uploaded';
