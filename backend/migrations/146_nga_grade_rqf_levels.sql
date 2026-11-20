-- @tenant: primary-only
-- 146: NGA's TVET years as RQF levels: Year 1 -> Level 3, Year 2 -> Level 4, Year 3 -> Level 5.
-- Matched by the grade's name ("Year 1", "SPES Year 1", "Y1", "Year One"...); only fills
-- grades with no level yet, so a level set in MIS later is kept. Re-runnable.

UPDATE `Grade`
SET `rqf_level` = CASE
  WHEN LOWER(`name`) REGEXP '(^|[^0-9a-z])(year|yr|y)[ -]*(1|one)([^0-9]|$)' THEN 3
  WHEN LOWER(`name`) REGEXP '(^|[^0-9a-z])(year|yr|y)[ -]*(2|two)([^0-9]|$)' THEN 4
  WHEN LOWER(`name`) REGEXP '(^|[^0-9a-z])(year|yr|y)[ -]*(3|three)([^0-9]|$)' THEN 5
  ELSE `rqf_level`
END
WHERE `rqf_level` IS NULL;
