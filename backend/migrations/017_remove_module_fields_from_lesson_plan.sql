-- Migration to remove module_code and module_name from LessonPlan table
ALTER TABLE LessonPlan DROP COLUMN module_code;
ALTER TABLE LessonPlan DROP COLUMN module_name;
ALTER TABLE LessonPlan DROP COLUMN class_name;
ALTER TABLE LessonPlan DROP COLUMN no_trainees;
