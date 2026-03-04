import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekNavigatorProps {
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  onPreviousWeek,
  onNextWeek,
  onToday,
}) => {
  return (
    <div className="flex items-center space-x-1">
      <button
        onClick={onPreviousWeek}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700/20 rounded-full transition-colors"
        title="Previous Week"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
      <button
        onClick={onToday}
        className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700/20 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors text-gray-700 dark:text-gray-300"
      >
        Today
      </button>
      <button
        onClick={onNextWeek}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700/20 rounded-full transition-colors"
        title="Next Week"
      >
        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  );
};

export default WeekNavigator;
