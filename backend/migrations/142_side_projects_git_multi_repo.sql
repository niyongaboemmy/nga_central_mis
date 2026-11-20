-- 142: Side projects -- a project can connect several GitHub repositories (an ecosystem: the MIS,
-- Task Mentor, Tupo, ...). GitRepoLink was one row per project (uq_git_link_project); it becomes
-- one row per project and repository. The first link (lowest link_id) holds the automation
-- settings shown on the GitHub tab; changes there apply to every link of the project.
-- Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitRepoLink' AND INDEX_NAME = 'uq_git_link_project_repo') > 0,
  'SELECT 1', 'ALTER TABLE `GitRepoLink` ADD UNIQUE KEY `uq_git_link_project_repo` (`project_id`, `repo_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitRepoLink' AND INDEX_NAME = 'uq_git_link_project') > 0,
  'ALTER TABLE `GitRepoLink` DROP INDEX `uq_git_link_project`', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
