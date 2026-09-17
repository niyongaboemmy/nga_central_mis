-- Brings a drizzle-bootstrapped database in line with src/db/schema.ts.
--
-- WHY THIS IS NEEDED
--
-- There are two migration lineages in this folder and they are not composable:
--
--   * the hand-written series (001…064) evolved a database that was originally
--     created WITHOUT explicit constraint names, so MySQL auto-named its
--     foreign keys `<table>_ibfk_N`;
--   * the drizzle series (0000…0003) names every foreign key explicitly
--     (`TeacherSubjectAssignment_user_id_User_user_id_fk`, …).
--
-- So migrations that say `DROP FOREIGN KEY studentsubjectenrollment_ibfk_3` or
-- `DROP FOREIGN KEY classgroup_ibfk_1` cannot run on a drizzle-built database —
-- the constraint exists, under a different name. 032, 033 and 059 fail there for
-- exactly that reason, and each failure leaves behind a NOT NULL column that
-- schema.ts does not declare:
--
--   TeacherSubjectAssignment.academic_term_id   NOT NULL, not in schema.ts
--   StudentSubjectEnrollment.academic_term_id   NOT NULL, not in schema.ts
--   ClassGroup.academic_year_id                 NOT NULL, not in schema.ts
--
-- That is worse than cosmetic: Drizzle never supplies those columns, they have
-- no default, so every ORM INSERT into those three tables fails. Reads are
-- unaffected, which is exactly why it can go unnoticed.
--
-- Rather than rewrite migrations that have already run elsewhere, this repairs
-- forward. It resolves each foreign key by looking its real name up in
-- information_schema, so it works on BOTH lineages, and every step is guarded by
-- an existence check so it is safe to run repeatedly and safe on a database that
-- was already correct (where it does nothing).

-- ---------------------------------------------------------------------------
-- TeacherSubjectAssignment: drop academic_term_id, re-key on academic_year_id
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TeacherSubjectAssignment'
    AND COLUMN_NAME = 'academic_term_id');

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TeacherSubjectAssignment'
    AND COLUMN_NAME = 'academic_term_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1);
SET @s := IF(@fk IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE `TeacherSubjectAssignment` DROP FOREIGN KEY `', @fk, '`'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Re-key first: the old primary key contains the column we are about to drop.
SET @s := IF(@col = 0, 'SELECT 1',
  'ALTER TABLE `TeacherSubjectAssignment`
     DROP PRIMARY KEY,
     DROP COLUMN `academic_term_id`,
     ADD PRIMARY KEY (`user_id`,`subject_id`,`class_group_id`,`academic_year_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- StudentSubjectEnrollment: drop academic_term_id, re-key on academic_year_id
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StudentSubjectEnrollment'
    AND COLUMN_NAME = 'academic_term_id');

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StudentSubjectEnrollment'
    AND COLUMN_NAME = 'academic_term_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1);
SET @s := IF(@fk IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE `StudentSubjectEnrollment` DROP FOREIGN KEY `', @fk, '`'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF(@col = 0, 'SELECT 1',
  'ALTER TABLE `StudentSubjectEnrollment`
     DROP PRIMARY KEY,
     DROP COLUMN `academic_term_id`,
     ADD PRIMARY KEY (`user_id`,`subject_id`,`academic_year_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- ClassGroup: drop academic_year_id (059 makes class groups permanent, so the
-- year lives on the membership rows instead of on the group itself)
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClassGroup'
    AND COLUMN_NAME = 'academic_year_id');

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClassGroup'
    AND COLUMN_NAME = 'academic_year_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1);
SET @s := IF(@fk IS NULL, 'SELECT 1',
  CONCAT('ALTER TABLE `ClassGroup` DROP FOREIGN KEY `', @fk, '`'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- The FK's backing index survives the FK and would block the column drop.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ClassGroup'
    AND INDEX_NAME = 'academic_year_id');
SET @s := IF(@idx = 0, 'SELECT 1',
  'ALTER TABLE `ClassGroup` DROP INDEX `academic_year_id`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF(@col = 0, 'SELECT 1',
  'ALTER TABLE `ClassGroup` DROP COLUMN `academic_year_id`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
