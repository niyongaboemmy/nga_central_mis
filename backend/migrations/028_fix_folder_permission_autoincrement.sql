-- Fix FolderPermission table to add AUTO_INCREMENT and PRIMARY KEY
-- The table was missing these constraints

ALTER TABLE `FolderPermission`
  CHANGE `permission_id` `permission_id` BIGINT(20) NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`permission_id`);
