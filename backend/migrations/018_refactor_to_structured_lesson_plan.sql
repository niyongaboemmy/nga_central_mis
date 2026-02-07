-- Refactor Lesson Plan to Structured Schema

-- 1. Create LO_Lesson
CREATE TABLE IF NOT EXISTS LO_Lesson (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id BIGINT,
    user_id BIGINT NOT NULL,
    session_code VARCHAR(50),
    sector VARCHAR(100),
    trade VARCHAR(100),
    level VARCHAR(50),
    module_code VARCHAR(50),
    module_name VARCHAR(255),
    week INT,
    term VARCHAR(20),
    school_year VARCHAR(20),
    class_name VARCHAR(100),
    number_of_trainees INT,
    lesson_date DATE,
    start_time VARCHAR(50),
    end_time VARCHAR(50),
    instructor_name VARCHAR(255),
    big_question TEXT,
    total_duration_minutes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id)
);

-- 2. Create LO_LearningOutcome
CREATE TABLE IF NOT EXISTS LO_LearningOutcome (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    code VARCHAR(10),
    title VARCHAR(255),
    description TEXT,
    duration_minutes INT,
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE CASCADE
);

-- 3. Create LO_LearningOutcomeActivity
CREATE TABLE IF NOT EXISTS LO_LearningOutcomeActivity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    learning_outcome_id INT NOT NULL,
    trainer_activities TEXT,
    learner_activities TEXT,
    FOREIGN KEY (learning_outcome_id) REFERENCES LO_LearningOutcome(id) ON DELETE CASCADE
);

-- 4. Create LO_LearningOutcomeResource
CREATE TABLE IF NOT EXISTS LO_LearningOutcomeResource (
    id INT AUTO_INCREMENT PRIMARY KEY,
    learning_outcome_id INT NOT NULL,
    resource_name VARCHAR(255),
    FOREIGN KEY (learning_outcome_id) REFERENCES LO_LearningOutcome(id) ON DELETE CASCADE
);

-- 5. Create LO_LessonSection
CREATE TABLE IF NOT EXISTS LO_LessonSection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    section_type ENUM('Introduction', 'Development', 'Conclusion'),
    trainer_activities TEXT,
    learner_activities TEXT,
    resources TEXT,
    duration_minutes INT,
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE CASCADE
);

-- 6. Create LO_IndicativeContent
CREATE TABLE IF NOT EXISTS LO_IndicativeContent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    category VARCHAR(100),
    content TEXT,
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE CASCADE
);

-- 7. Create LO_LessonAssignment
CREATE TABLE IF NOT EXISTS LO_LessonAssignment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    description TEXT,
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE CASCADE
);

-- 8. Create LO_LessonEvaluation
CREATE TABLE IF NOT EXISTS LO_LessonEvaluation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lesson_id INT NOT NULL,
    teacher_notes TEXT,
    `references` TEXT,
    prepared_by VARCHAR(255),
    verified_by VARCHAR(255),
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE CASCADE
);

-- Optional: Drop old table if requested or keep for now
-- DROP TABLE IF EXISTS LessonPlan;
