-- 130: Blue-only palette for side projects (user preference: primary colour is blue, no sky).
-- The seeded "Other" category used sky-600 (#0284c7); re-colour it to blue-700, only where
-- nobody has changed it. Idempotent; MySQL 5.7 and 8.

UPDATE `SideProjectCategory` SET `color` = '#1d4ed8' WHERE `slug` = 'other' AND `color` = '#0284c7';
