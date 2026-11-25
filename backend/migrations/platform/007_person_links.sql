-- One person, several schools: which accounts are known to be the same person
-- (MIS-ISO-5, school isolation audit 2026-11-25).
--
-- Control plane only (PLATFORM_DB_NAME). A row is written when an account is
-- copied into another school (services/tenantMgmt/crossSchool.ts) and when a
-- person proves they own both accounts by switching school
-- (controllers/schoolSwitchController.ts). /auth/my-schools trusts these links;
-- a bare e-mail match (an e-mail any school administrator can type) is not proof.
-- Stored once per pair, the lower (tid, uid) first. Idempotent; MySQL 5.7 and 8.
CREATE TABLE IF NOT EXISTS `PersonLink` (
  `link_id` BIGINT NOT NULL AUTO_INCREMENT,
  `tid_a` BIGINT NOT NULL,
  `uid_a` BIGINT NOT NULL,
  `tid_b` BIGINT NOT NULL,
  `uid_b` BIGINT NOT NULL,
  `via` VARCHAR(20) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`link_id`),
  UNIQUE KEY `uq_person_link` (`tid_a`, `uid_a`, `tid_b`, `uid_b`),
  KEY `idx_person_link_b` (`tid_b`, `uid_b`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill from the audit trail: copies made before this table existed, and
-- school switches a person already completed.
INSERT IGNORE INTO `PersonLink` (`tid_a`, `uid_a`, `tid_b`, `uid_b`, `via`, `created_at`)
SELECT
  IF(x.t1 < x.t2 OR (x.t1 = x.t2 AND x.u1 < x.u2), x.t1, x.t2),
  IF(x.t1 < x.t2 OR (x.t1 = x.t2 AND x.u1 < x.u2), x.u1, x.u2),
  IF(x.t1 < x.t2 OR (x.t1 = x.t2 AND x.u1 < x.u2), x.t2, x.t1),
  IF(x.t1 < x.t2 OR (x.t1 = x.t2 AND x.u1 < x.u2), x.u2, x.u1),
  x.via, x.at
FROM (
  SELECT
    CAST(JSON_UNQUOTE(JSON_EXTRACT(a.payload, '$.fromTid')) AS UNSIGNED) AS t1,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(a.payload, '$.fromUserId')) AS UNSIGNED) AS u1,
    a.target_tid AS t2,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(a.payload, IF(a.action = 'auth.switch_school', '$.toUserId', '$.userId'))) AS UNSIGNED) AS u2,
    IF(a.action = 'auth.switch_school', 'switch', 'copy') AS via,
    a.at
  FROM `PlatformAudit` a
  WHERE a.action IN ('platform.tenant.person_assign', 'tenant.person_import', 'auth.switch_school')
    AND a.target_tid IS NOT NULL
    AND JSON_EXTRACT(a.payload, '$.fromTid') IS NOT NULL
    AND JSON_EXTRACT(a.payload, '$.fromUserId') IS NOT NULL
) x
WHERE x.t1 > 0 AND x.u1 > 0 AND x.t2 > 0 AND x.u2 > 0 AND x.t1 <> x.t2;
