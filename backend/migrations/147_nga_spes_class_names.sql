-- @tenant: primary-only
-- 147: NGA's Coding Academy classes and grades named by trade and year, as its report
-- cards print them: "L3. Class A" -> "SPES Year 1 A", "L4. Class B" -> "SPES Year 2 B",
-- "L5 Class A" -> "SPES Year 3 A"; grades "Year 1" -> "SPES Year 1" (and Year 2, Year 3).
-- RQF Level 3/4/5 is Year 1/2/3. Only names in the old shapes change; re-runnable.
-- Plain string functions (no REGEXP_REPLACE) so it also runs on MySQL 5.7.

UPDATE `ClassGroup` cg
JOIN `Grade` g ON g.grade_id = cg.grade_id
JOIN `Program` p ON p.program_id = g.program_id
SET cg.name = CONCAT('SPES Year ', CAST(SUBSTRING(TRIM(cg.name), 2, 1) AS SIGNED) - 2, ' ', UPPER(RIGHT(TRIM(cg.name), 1)))
WHERE p.name = 'Coding Academy'
  AND UPPER(TRIM(cg.name)) REGEXP '^L[345][. ]*CLASS [A-Z]$';

UPDATE `Grade` g
JOIN `Program` p ON p.program_id = g.program_id
SET g.name = CONCAT('SPES ', TRIM(g.name))
WHERE p.name = 'Coding Academy'
  AND TRIM(g.name) REGEXP '^[Yy]ear [123]$';
