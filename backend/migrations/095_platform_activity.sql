-- 095: Platform usage analytics & live monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §12).
--
-- Idempotent: every statement is CREATE TABLE IF NOT EXISTS / INSERT IGNORE, so
-- re-running is a no-op. Works on MySQL 5.7 (local dev) and 8.x (production).
--
-- Conventions:
--   * every DATETIME(3) is UTC (the activity pool connects with timezone 'Z');
--   * app codes: 1 = mis, 2 = tm (Task Mentor), 3 = tendo (D&A), 4 = tupo;
--   * IPs are VARBINARY(16) in INET6_ATON form (4 bytes for IPv4, 16 for IPv6);
--   * user ids are BIGINT like User.user_id; no foreign keys -- analytics must
--     never block deleting a user, and the partitioned table cannot have them.

-- Raw events, one partition per month. The PK has to include the partition
-- column; ingest makes occurred_at deterministic per event so retries collide.
-- The nightly job splits pmax into the next month and drops expired months.
CREATE TABLE IF NOT EXISTS AnalyticsEvent (
  event_id      CHAR(26)          NOT NULL,
  occurred_at   DATETIME(3)       NOT NULL,
  received_at   DATETIME(3)       NOT NULL,
  app           TINYINT UNSIGNED  NOT NULL,
  user_id       BIGINT            NULL,
  device_id     CHAR(22)          NOT NULL,
  session_id    BIGINT UNSIGNED   NULL,
  pv_id         VARCHAR(16)       NULL,
  name          VARCHAR(64)       NOT NULL,
  route         VARCHAR(191)      NULL,
  feature       VARCHAR(80)       NULL,
  engagement_ms INT UNSIGNED      NOT NULL DEFAULT 0,
  ip            VARBINARY(16)     NULL,
  geo_id        INT UNSIGNED      NULL,
  params        JSON              NULL,
  flags         TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, occurred_at),
  KEY ix_ae_user_time    (user_id, occurred_at),
  KEY ix_ae_device_time  (device_id, occurred_at),
  KEY ix_ae_feature_time (app, feature, occurred_at),
  KEY ix_ae_session      (session_id),
  KEY ix_ae_ip_time      (ip, occurred_at),
  KEY ix_ae_time         (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE COLUMNS (occurred_at) (
  PARTITION p202609 VALUES LESS THAN ('2026-10-01'),
  PARTITION p202610 VALUES LESS THAN ('2026-11-01'),
  PARTITION p202611 VALUES LESS THAN ('2026-12-01'),
  PARTITION p202612 VALUES LESS THAN ('2027-01-01'),
  PARTITION pmax    VALUES LESS THAN (MAXVALUE)
);

CREATE TABLE IF NOT EXISTS AnalyticsSession (
  session_id       BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  device_id        CHAR(22)         NOT NULL,
  user_id          BIGINT           NULL,
  stitched_at      DATETIME(3)      NULL,
  started_at       DATETIME(3)      NOT NULL,
  last_activity_at DATETIME(3)      NOT NULL,
  ended_at         DATETIME(3)      NULL,
  entry_app        TINYINT UNSIGNED NOT NULL,
  entry_route      VARCHAR(191)     NULL,
  entry_kind       ENUM('direct','sso_launch','pwa','push_click','referral','campaign') NOT NULL DEFAULT 'direct',
  referrer_host    VARCHAR(191)     NULL,
  utm_source       VARCHAR(100)     NULL,
  utm_medium       VARCHAR(100)     NULL,
  utm_campaign     VARCHAR(100)     NULL,
  exit_app         TINYINT UNSIGNED NULL,
  exit_route       VARCHAR(191)     NULL,
  apps_mask        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  app_path         VARCHAR(100)     NULL,
  page_views       INT UNSIGNED     NOT NULL DEFAULT 0,
  events           INT UNSIGNED     NOT NULL DEFAULT 0,
  engagement_ms    INT UNSIGNED     NOT NULL DEFAULT 0,
  key_events       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_engaged       TINYINT(1)       NOT NULL DEFAULT 0,
  entry_ip         VARBINARY(16)    NULL,
  last_ip          VARBINARY(16)    NULL,
  geo_id           INT UNSIGNED     NULL,
  network_label    VARCHAR(40)      NULL,
  ua_id            INT UNSIGNED     NULL,
  user_type        VARCHAR(16)      NULL,
  is_bot           TINYINT(1)       NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id),
  KEY ix_as_user_start   (user_id, started_at),
  KEY ix_as_device_start (device_id, started_at),
  KEY ix_as_start        (started_at),
  KEY ix_as_open         (ended_at, last_activity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsDevice (
  device_id         CHAR(22)      NOT NULL,
  first_seen        DATETIME(3)   NOT NULL,
  last_seen         DATETIME(3)   NOT NULL,
  first_ip          VARBINARY(16) NULL,
  last_ip           VARBINARY(16) NULL,
  last_geo_id       INT UNSIGNED  NULL,
  ua_id             INT UNSIGNED  NULL,
  standalone_seen   TINYINT(1)    NOT NULL DEFAULT 0,
  screen            VARCHAR(24)   NULL,
  first_user_id     BIGINT        NULL,
  last_user_id      BIGINT        NULL,
  linked_user_ids   JSON          NULL,
  guest_names       JSON          NULL,
  bot_score         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bot_override      ENUM('none','human','bot') NOT NULL DEFAULT 'none',
  sessions          INT UNSIGNED  NOT NULL DEFAULT 0,
  page_views        INT UNSIGNED  NOT NULL DEFAULT 0,
  precise_loc_state ENUM('unasked','granted','denied') NOT NULL DEFAULT 'unasked',
  PRIMARY KEY (device_id),
  KEY ix_ad_last_seen (last_seen),
  KEY ix_ad_last_user (last_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsUa (
  ua_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ua_hash     BINARY(32)   NOT NULL,
  ua          VARCHAR(512) NOT NULL,
  browser     VARCHAR(40)  NULL,
  browser_ver VARCHAR(20)  NULL,
  os          VARCHAR(40)  NULL,
  os_ver      VARCHAR(20)  NULL,
  device_type ENUM('desktop','mobile','tablet','bot','unknown') NOT NULL DEFAULT 'unknown',
  is_bot_ua   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (ua_id),
  UNIQUE KEY uq_aua_hash (ua_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsGeo (
  geo_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  geo_key      CHAR(40)     NOT NULL,
  country_code CHAR(2)      NULL,
  country      VARCHAR(80)  NULL,
  region       VARCHAR(120) NULL,
  city         VARCHAR(120) NULL,
  lat          DECIMAL(8,5) NULL,
  lon          DECIMAL(8,5) NULL,
  asn          INT UNSIGNED NULL,
  isp          VARCHAR(160) NULL,
  conn_type    ENUM('mobile','fixed','hosting','education','private','unknown') NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (geo_id),
  UNIQUE KEY uq_ageo_key (geo_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsIp (
  ip            VARBINARY(16) NOT NULL,
  geo_id        INT UNSIGNED  NULL,
  network_label VARCHAR(40)   NULL,
  first_seen    DATETIME(3)   NOT NULL,
  last_seen     DATETIME(3)   NOT NULL,
  users_count   INT UNSIGNED  NOT NULL DEFAULT 0,
  devices_count INT UNSIGNED  NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (ip),
  KEY ix_aip_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsUserIp (
  user_id    BIGINT        NOT NULL,
  ip         VARBINARY(16) NOT NULL,
  first_seen DATETIME(3)   NOT NULL,
  last_seen  DATETIME(3)   NOT NULL,
  hits       INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ip),
  KEY ix_auip_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsDeviceIp (
  device_id  CHAR(22)      NOT NULL,
  ip         VARBINARY(16) NOT NULL,
  first_seen DATETIME(3)   NOT NULL,
  last_seen  DATETIME(3)   NOT NULL,
  hits       INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, ip),
  KEY ix_adip_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsLocationFix (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id   CHAR(22)        NOT NULL,
  user_id     BIGINT          NULL,
  session_id  BIGINT UNSIGNED NULL,
  lat         DECIMAL(8,5)    NOT NULL,
  lon         DECIMAL(8,5)    NOT NULL,
  accuracy_m  INT UNSIGNED    NULL,
  captured_at DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_alf_user (user_id, captured_at),
  KEY ix_alf_device (device_id, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsUserState (
  user_id           BIGINT           NOT NULL,
  first_seen_at     DATETIME(3)      NULL,
  first_seen_by_app JSON             NULL,
  last_seen_at      DATETIME(3)      NULL,
  last_seen_app     TINYINT UNSIGNED NULL,
  last_ip           VARBINARY(16)    NULL,
  last_geo_id       INT UNSIGNED     NULL,
  last_login_at     DATETIME(3)      NULL,
  last_login_method VARCHAR(20)      NULL,
  total_sessions    INT UNSIGNED     NOT NULL DEFAULT 0,
  excluded          TINYINT(1)       NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id),
  KEY ix_aus_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AuthEvent (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  occurred_at        DATETIME(3)     NOT NULL,
  kind               ENUM('login','otp','google','password_reset','app_launch','logout','suspend','reactivate','password_change','scheme_verify','notice_ack') NOT NULL,
  outcome            ENUM('success','failure','info') NOT NULL,
  reason             VARCHAR(40)     NULL,
  method             VARCHAR(20)     NULL,
  user_id            BIGINT          NULL,
  username_attempted VARCHAR(120)    NULL,
  app                TINYINT UNSIGNED NULL,
  initiator          VARCHAR(20)     NULL,
  actor_id           BIGINT          NULL,
  device_id          CHAR(22)        NULL,
  ip                 VARBINARY(16)   NULL,
  geo_id             INT UNSIGNED    NULL,
  ua_id              INT UNSIGNED    NULL,
  source             ENUM('live','backfill') NOT NULL DEFAULT 'live',
  source_ref         VARCHAR(40)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aue_source_ref (source_ref),
  KEY ix_aue_time (occurred_at),
  KEY ix_aue_user (user_id, occurred_at),
  KEY ix_aue_ip (ip, occurred_at),
  KEY ix_aue_username (username_attempted, occurred_at),
  KEY ix_aue_device (device_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rollups, bucketed by Africa/Kigali day.
CREATE TABLE IF NOT EXISTS AnalyticsUserDay (
  day           DATE             NOT NULL,
  user_id       BIGINT           NOT NULL,
  app           TINYINT UNSIGNED NOT NULL,
  sessions      SMALLINT UNSIGNED NULL,
  page_views    INT UNSIGNED     NOT NULL DEFAULT 0,
  events        INT UNSIGNED     NOT NULL DEFAULT 0,
  engagement_ms INT UNSIGNED     NOT NULL DEFAULT 0,
  key_events    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  logins        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active     TINYINT(1)       NOT NULL DEFAULT 0,
  first_at      DATETIME(3)      NULL,
  last_at       DATETIME(3)      NULL,
  source        ENUM('live','backfill') NOT NULL DEFAULT 'live',
  PRIMARY KEY (day, user_id, app),
  KEY ix_aud_user_day (user_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsDeviceDay (
  day           DATE             NOT NULL,
  device_id     CHAR(22)         NOT NULL,
  app           TINYINT UNSIGNED NOT NULL,
  sessions      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  page_views    INT UNSIGNED     NOT NULL DEFAULT 0,
  engagement_ms INT UNSIGNED     NOT NULL DEFAULT 0,
  is_active     TINYINT(1)       NOT NULL DEFAULT 0,
  is_bot        TINYINT(1)       NOT NULL DEFAULT 0,
  geo_id        INT UNSIGNED     NULL,
  PRIMARY KEY (day, device_id, app)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsFeatureDay (
  day           DATE             NOT NULL,
  app           TINYINT UNSIGNED NOT NULL,
  feature       VARCHAR(80)      NOT NULL,
  audience      ENUM('user','visitor') NOT NULL,
  views         INT UNSIGNED     NOT NULL DEFAULT 0,
  users         INT UNSIGNED     NOT NULL DEFAULT 0,
  engaged_users INT UNSIGNED     NOT NULL DEFAULT 0,
  engagement_ms BIGINT UNSIGNED  NOT NULL DEFAULT 0,
  events        INT UNSIGNED     NOT NULL DEFAULT 0,
  key_events    INT UNSIGNED     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, feature, audience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsDimDay (
  day      DATE             NOT NULL,
  app      TINYINT UNSIGNED NOT NULL,
  dim      VARCHAR(24)      NOT NULL,
  value    VARCHAR(191)     NOT NULL,
  audience ENUM('user','visitor') NOT NULL,
  users    INT UNSIGNED     NOT NULL DEFAULT 0,
  sessions INT UNSIGNED     NOT NULL DEFAULT 0,
  views    INT UNSIGNED     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, dim, value, audience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsGeoDay (
  day           DATE             NOT NULL,
  app           TINYINT UNSIGNED NOT NULL,
  geo_id        INT UNSIGNED     NOT NULL,
  audience      ENUM('user','visitor') NOT NULL,
  users         INT UNSIGNED     NOT NULL DEFAULT 0,
  sessions      INT UNSIGNED     NOT NULL DEFAULT 0,
  views         INT UNSIGNED     NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, geo_id, audience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsHourly (
  day           DATE             NOT NULL,
  hour          TINYINT UNSIGNED NOT NULL,
  app           TINYINT UNSIGNED NOT NULL,
  users         INT UNSIGNED     NOT NULL DEFAULT 0,
  visitors      INT UNSIGNED     NOT NULL DEFAULT 0,
  sessions      INT UNSIGNED     NOT NULL DEFAULT 0,
  views         INT UNSIGNED     NOT NULL DEFAULT 0,
  logins        INT UNSIGNED     NOT NULL DEFAULT 0,
  failed_logins INT UNSIGNED     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, app)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feature catalog pushed by each app.
CREATE TABLE IF NOT EXISTS AnalyticsFeature (
  app         TINYINT UNSIGNED NOT NULL,
  feature_key VARCHAR(80)      NOT NULL,
  label       VARCHAR(120)     NOT NULL,
  module      VARCHAR(60)      NULL,
  patterns    JSON             NULL,
  is_event    TINYINT(1)       NOT NULL DEFAULT 0,
  key_event   TINYINT(1)       NOT NULL DEFAULT 0,
  is_public   TINYINT(1)       NOT NULL DEFAULT 0,
  version     VARCHAR(20)      NULL,
  updated_at  DATETIME(3)      NOT NULL,
  PRIMARY KEY (app, feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Governance & control.
CREATE TABLE IF NOT EXISTS AnalyticsWatch (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_kind        ENUM('user','device','ip') NOT NULL,
  target_user_id     BIGINT       NULL,
  target_device_id   CHAR(22)     NULL,
  target_cidr        VARCHAR(50)  NULL,
  created_by         BIGINT       NOT NULL,
  reason             TEXT         NOT NULL,
  rules              JSON         NOT NULL,
  channels           JSON         NOT NULL,
  starts_at          DATETIME(3)  NOT NULL,
  expires_at         DATETIME(3)  NOT NULL,
  status             ENUM('active','revoked','expired') NOT NULL DEFAULT 'active',
  target_notified_at DATETIME(3)  NULL,
  revoked_by         BIGINT       NULL,
  revoked_at         DATETIME(3)  NULL,
  revoke_reason      TEXT         NULL,
  PRIMARY KEY (id),
  KEY ix_aw_target_user (target_user_id, status),
  KEY ix_aw_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsAlert (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  watch_id         INT UNSIGNED    NULL,
  rule             VARCHAR(40)     NOT NULL,
  severity         ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  title            VARCHAR(255)    NOT NULL,
  target_user_id   BIGINT          NULL,
  target_device_id CHAR(22)        NULL,
  ip               VARBINARY(16)   NULL,
  fired_at         DATETIME(3)     NOT NULL,
  payload          JSON            NULL,
  delivered        JSON            NULL,
  ack_by           BIGINT          NULL,
  ack_at           DATETIME(3)     NULL,
  PRIMARY KEY (id),
  KEY ix_aal_fired (fired_at),
  KEY ix_aal_unacked (ack_at, fired_at),
  KEY ix_aal_watch (watch_id, fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsBlock (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind       ENUM('device','ip','cidr') NOT NULL,
  value      VARCHAR(50)  NOT NULL,
  reason     TEXT         NOT NULL,
  created_by BIGINT       NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  expires_at DATETIME(3)  NOT NULL,
  revoked_at DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY ix_ab_active (kind, value, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only: no code path updates or deletes rows here.
CREATE TABLE IF NOT EXISTS MonitorAccessLog (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  at               DATETIME(3)     NOT NULL,
  viewer_id        BIGINT          NOT NULL,
  action           VARCHAR(40)     NOT NULL,
  target_user_id   BIGINT          NULL,
  target_device_id CHAR(22)        NULL,
  target_ip        VARBINARY(16)   NULL,
  reason           TEXT            NULL,
  detail           JSON            NULL,
  viewer_ip        VARBINARY(16)   NULL,
  PRIMARY KEY (id),
  KEY ix_mal_viewer (viewer_id, at),
  KEY ix_mal_target (target_user_id, at),
  KEY ix_mal_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsSetting (
  setting_key VARCHAR(60) NOT NULL,
  value       JSON        NOT NULL,
  updated_by  BIGINT      NULL,
  updated_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS AnalyticsSavedView (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id   BIGINT       NOT NULL,
  kind       VARCHAR(20)  NOT NULL,
  name       VARCHAR(120) NOT NULL,
  definition JSON         NOT NULL,
  shared     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL,
  updated_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_asv_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO AnalyticsSetting (setting_key, value, updated_at) VALUES
  ('collect_enabled',          CAST('true' AS JSON),  UTC_TIMESTAMP(3)),
  ('session_timeout_min',      CAST('30' AS JSON),    UTC_TIMESTAMP(3)),
  ('engaged_seconds',          CAST('10' AS JSON),    UTC_TIMESTAMP(3)),
  ('idle_after_s',             CAST('120' AS JSON),   UTC_TIMESTAMP(3)),
  ('offline_after_s',          CAST('90' AS JSON),    UTC_TIMESTAMP(3)),
  ('background_ttl_s',         CAST('600' AS JSON),   UTC_TIMESTAMP(3)),
  ('raw_retention_months',     CAST('13' AS JSON),    UTC_TIMESTAMP(3)),
  ('session_retention_months', CAST('25' AS JSON),    UTC_TIMESTAMP(3)),
  ('campus_cidrs',             CAST('[]' AS JSON),    UTC_TIMESTAMP(3)),
  ('precise_location',         CAST('"off"' AS JSON), UTC_TIMESTAMP(3)),
  ('dormant_days',             CAST('14' AS JSON),    UTC_TIMESTAMP(3)),
  ('bot_threshold',            CAST('60' AS JSON),    UTC_TIMESTAMP(3)),
  ('school_hours',             CAST('{"from":"07:00","to":"18:00","days":[1,2,3,4,5]}' AS JSON), UTC_TIMESTAMP(3));
