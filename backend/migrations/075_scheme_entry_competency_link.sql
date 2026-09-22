-- ============================================
-- Scheme of Work: link each weekly entry to a Learning Outcome
-- ============================================
-- The correct Scheme of Work template groups weeks under a "Competence
-- code and name" (Learning Outcome), each with its own code/title and a
-- total duration spanning several weeks. Curriculum already models this
-- as SubjectCompetency (title, learning_hours, indicative_content), so we
-- link to it directly rather than inventing a parallel table -- keeps
-- Curriculum and Scheme of Work related-but-separate, per
-- CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md.
--
-- Nullable: existing rows are unaffected; AI generation, DOCX import, and
-- manual entry populate it going forward (see schemeAIController.ts /
-- schemeOfWorkController.ts).

ALTER TABLE `SchemeOfWorkEntry`
  ADD COLUMN `competency_id` BIGINT DEFAULT NULL AFTER `scheme_id`,
  ADD CONSTRAINT `fk_swe_competency`
    FOREIGN KEY (`competency_id`) REFERENCES `SubjectCompetency`(`competency_id`)
    ON DELETE SET NULL;
