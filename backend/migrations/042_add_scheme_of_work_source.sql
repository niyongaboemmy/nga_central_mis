-- Track how a Scheme of Work was created (manual entry, DOCX import, or AI generation)
ALTER TABLE SchemeOfWork
  ADD COLUMN source ENUM('MANUAL', 'DOCX_IMPORT', 'AI_GENERATED') NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN ai_source_filename VARCHAR(255) NULL;
