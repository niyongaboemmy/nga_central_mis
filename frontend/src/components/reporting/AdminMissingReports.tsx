import React from "react";
import { UserX } from "lucide-react";

interface AdminMissingReportsProps {
  missing: any[];
  loading: boolean;
}

const AdminMissingReports: React.FC<AdminMissingReportsProps> = ({
  missing,
  loading,
}) => {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-6 h-24"
          ></div>
        ))}
      </div>
    );
  }

  if (!missing || missing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-gray-900/40 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
          <UserX className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-white">
          All Submissions Received
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-xs font-medium">
          Great! All active instructors have submitted their reports for the
          selected period.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom duration-700">
      {missing.map((instructor, idx) => (
        <div
          key={instructor.user_id || idx}
          className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-5 transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xl font-black">
                {instructor.instructor_name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors truncate">
                  {instructor.instructor_name}
                </h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  {instructor.program_name && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[9px] font-black rounded uppercase">
                      {instructor.program_name}
                    </span>
                  )}
                  {instructor.grade_name && (
                    <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 text-[9px] font-black rounded uppercase">
                      {instructor.grade_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* <div className="mt-6 flex items-center gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20">
              <Bell className="w-3.5 h-3.5" />
              Send Reminder
            </button>
            <button className="p-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl transition-all border border-gray-100 dark:border-gray-700 group-hover:border-blue-200">
              <Mail className="w-4 h-4" />
            </button>
          </div> */}
        </div>
      ))}
    </div>
  );
};

export default AdminMissingReports;
