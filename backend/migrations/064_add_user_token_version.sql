-- Adds token_version to User, used to revoke JWTs on logout. A JWT embeds
-- the version it was signed with; authenticate() rejects any token whose
-- embedded version no longer matches the user's current value. Logout bumps
-- it. Pre-migration tokens have no tokenVersion claim, treated as 0 by the
-- middleware, which matches this column's default -- so existing sessions
-- keep working until their next logout or natural expiry.
ALTER TABLE `User`
  ADD COLUMN `token_version` INT NOT NULL DEFAULT 0 AFTER `preferred_theme`;
