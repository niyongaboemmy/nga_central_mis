-- Migration 094: Single sign-out across the NGA apps (OpenID Connect
-- Back-Channel Logout 1.0). When someone signs out of MIS, MIS POSTs a signed
-- logout_token to each app's back-channel logout endpoint so that app ends the
-- user's sessions too. Additive and idempotent.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'System' AND COLUMN_NAME = 'backchannel_logout_uri') > 0, 'SELECT 1',
  'ALTER TABLE `System` ADD COLUMN `backchannel_logout_uri` VARCHAR(500) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- The first-party apps (external systems such as Ganzaa are left unset; an
-- admin can add theirs on the Systems screen once they support it).
UPDATE `System` SET `backchannel_logout_uri` = 'https://taskmentor-api.amashuri.com/api/auth/backchannel-logout'
  WHERE `client_id` = 'taskmentor_app' AND `backchannel_logout_uri` IS NULL;
UPDATE `System` SET `backchannel_logout_uri` = 'https://tendo.amashuri.com/api/sso/backchannel-logout'
  WHERE `client_id` = 'discipline_attendance' AND `backchannel_logout_uri` IS NULL;
UPDATE `System` SET `backchannel_logout_uri` = 'https://tupo.amashuri.com/api/sso/backchannel-logout'
  WHERE `client_id` = 'tupo' AND `backchannel_logout_uri` IS NULL;
