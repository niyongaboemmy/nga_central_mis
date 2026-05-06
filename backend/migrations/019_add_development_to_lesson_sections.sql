-- Migration to add 'Development' section type to lesson plans
ALTER TABLE LO_LessonSection MODIFY COLUMN section_type ENUM('Introduction', 'Development', 'Conclusion');
