-- @tenant: primary-only
-- 143: NGA's module weights, as printed on its issued Level 3 TVET report cards (SPES).
-- Matched by module code; MIS may suffix a code with "_<timestamp>" to keep it unique.
-- Only fills a weight that isn't set, so a weight edited in MIS later is kept. Re-runnable.

UPDATE `Subject` s
JOIN (
  SELECT 'CCMKN302' AS code, 30 AS w UNION ALL
  SELECT 'CCMBC302', 30 UNION ALL
  SELECT 'CCMCZ301', 30 UNION ALL
  SELECT 'GENPH302', 100 UNION ALL
  SELECT 'GENEG302', 80 UNION ALL
  SELECT 'GENMA301', 100 UNION ALL
  SELECT 'GENCB302', 60 UNION ALL
  SELECT 'SPEWI302', 80 UNION ALL
  SELECT 'SPEES302', 100 UNION ALL
  SELECT 'SPENF302', 60 UNION ALL
  SELECT 'SPEPE302', 120 UNION ALL
  SELECT 'SPEGI302', 80 UNION ALL
  SELECT 'SPEWJ302', 120 UNION ALL
  SELECT 'SPEDB302', 80 UNION ALL
  SELECT 'SPEWP302', 110
) w ON UPPER(s.code) = w.code OR UPPER(s.code) LIKE CONCAT(w.code, '\_%')
SET s.module_weight = w.w
WHERE s.module_weight IS NULL;
