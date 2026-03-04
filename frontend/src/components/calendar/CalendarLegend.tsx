import React from "react";

interface CalendarLegendProps {
  showActivityLegend?: boolean;
}

const CalendarLegend: React.FC<CalendarLegendProps> = ({
  showActivityLegend = false,
}) => {
  return (
    <div className="mt-6 flex flex-wrap gap-4">
      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
        <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
        Regular Class
      </div>
      {showActivityLegend && (
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
          <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
          Activity/Event
        </div>
      )}
    </div>
  );
};

export default CalendarLegend;
