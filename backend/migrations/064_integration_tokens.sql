-- Integration service tokens.
--
-- Machine-to-machine credentials for partner systems (currently Ganzaa) that
-- need to pull a read-only snapshot of MIS academic data on a schedule.
--
-- Deliberately NOT a user JWT: those are short-lived, carry a person's
-- permissions, and die when that person leaves. A sync that runs nightly for
-- years needs its own identity that an admin can see, scope and revoke.
--
-- Only the SHA-256 hash of the token is stored, so a database leak does not
-- hand over working credentials. `token_prefix` exists purely so the admin UI
-- can show "ganzaa_live_a1b2…" and let a human tell two tokens apart.

CREATE TABLE IF NOT EXISTS `IntegrationToken` (
  `token_id`     BIGINT       NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(100) NOT NULL,
  `token_hash`   CHAR(64)     NOT NULL,
  `token_prefix` VARCHAR(16)  NOT NULL,
  `scopes`       VARCHAR(255) NOT NULL DEFAULT 'sync:read',
  -- Reserved for the day academic data becomes school-scoped. Today User /
  -- Program / Grade / Subject / ClassGroup carry no school_id, so a token
  -- cannot be narrowed below "this MIS instance" — see the note in
  -- integrationController.ts.
  `school_id`    BIGINT       NULL,
  `last_used_at` DATETIME     NULL,
  `expires_at`   DATETIME     NULL,
  `revoked_at`   DATETIME     NULL,
  `created_by`   BIGINT       NULL,
  `created_at`   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `integration_token_hash_unique` (`token_hash`),
  KEY `integration_token_active_idx` (`revoked_at`, `expires_at`),
  CONSTRAINT `integration_token_school_fk`
    FOREIGN KEY (`school_id`) REFERENCES `School` (`school_id`) ON DELETE SET NULL,
  CONSTRAINT `integration_token_creator_fk`
    FOREIGN KEY (`created_by`) REFERENCES `User` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
