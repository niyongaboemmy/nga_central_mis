-- Add google_id to AuthCredential to support "Sign in with Google"
-- Stores the Google account's stable subject id (payload.sub) once an
-- existing NGA MIS account is linked via a Google login.

ALTER TABLE `AuthCredential`
  ADD COLUMN `google_id` VARCHAR(255) NULL UNIQUE AFTER `locked_until`;
