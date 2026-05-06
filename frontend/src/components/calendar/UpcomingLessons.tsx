import React from "react";
import { Bell, Clock } from "lucide-react";
import type { UpcomingLesson } from "../../api/calendar";

interface UpcomingLessonsProps {
  lessons: UpcomingLesson[];
}

const UpcomingLessons: React.FC<UpcomingLessonsProps> = ({ lessons }) => {
  if (lessons.length === 0) return null;

  return (
    <div className="mb-6 p-5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-8 h-8 bg-amber-100 dark:bg-amber-800 rounded-full flex items-center justify-center">
          <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="font-semibold text-amber-800 dark:text-amber-200">
          Upcoming Lessons
        </h3>
      </div>
      <div className="space-y-2">
        {lessons.slice(0, 3).map((lesson, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-sm bg-white dark:bg-gray-800/50 p-3 rounded-xl"
          >
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {lesson.subject_name}
                </span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">
                  - {lesson.class_name}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/50 px-3 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              <span className="text-xs font-medium">
                {lesson.start_time} ({lesson.minutes_until_start}m)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UpcomingLessons;
