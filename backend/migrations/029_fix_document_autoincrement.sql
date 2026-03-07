-- Fix Document table to add AUTO_INCREMENT on document_id
-- The table was missing this constraint

ALTER TABLE `Document`
  MODIFY `document_id` BIGINT(20) NOT NULL AUTO_INCREMENT;
