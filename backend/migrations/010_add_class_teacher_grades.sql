-- Add class teacher grade assignment functionality

-- Create UserGrade junction table for assigning grades to class teachers
CREATE TABLE UserGrade (
  user_id BIGINT NOT NULL,
  grade_id BIGINT NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, grade_id),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE,
  FOREIGN KEY (grade_id) REFERENCES Grade(grade_id) ON DELETE CASCADE
);

-- Insert new permissions for class teacher grade management
INSERT INTO Permission (name, description, status) VALUES
('ASSIGN_GRADE_TO_CLASS_TEACHER', 'Can assign and remove grades from class teachers', 'ACTIVE'),
('VIEW_USERS_BY_CLASS_TEACHER_GRADE', 'Can view users assigned to grades that the logged user is assigned to', 'ACTIVE'),
('VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE', 'Can view subjects in grades that the logged user is assigned to', 'ACTIVE');