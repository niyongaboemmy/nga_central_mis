-- Add program leads functionality and VIEW_PROGRAM_USERS permission

-- Create UserProgramLead table
CREATE TABLE UserProgramLead (
  user_id BIGINT NOT NULL,
  program_id BIGINT NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, program_id),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE,
  FOREIGN KEY (program_id) REFERENCES Program(program_id) ON DELETE CASCADE
);

-- Insert VIEW_PROGRAM_USERS permission
INSERT INTO Permission (name, description, status) VALUES
('VIEW_PROGRAM_USERS', 'Can view users assigned to programs they lead', 'ACTIVE');