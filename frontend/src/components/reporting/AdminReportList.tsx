import React from "react";
import {
  FileText,
  User as UserIcon,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

interface AdminReportListProps {
  reports: any[];
  loading: boolean;
  onViewDetails: (report: any) => void;
}

const AdminReportList: React.FC<AdminReportListProps> = ({
  reports,
  loading,
  onViewDetails,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">
          Loading reports...
        </p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 px-6 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-2xl">
          <FileText className="w-8 h-8 text-gray-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            No reports found
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
            Try adjusting your filters to see more results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        {reports.map((report) => (
          <div
            key={report.report_id}
            onClick={() => onViewDetails(report)}
            className="group bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-4 hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer relative overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Instructor Section */}
              <div className="flex items-center space-x-4 lg:w-1/4">
                <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50 group-hover:scale-105 transition-transform duration-300 flex-shrink-0">
                  <UserIcon className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white truncate text-base">
                    {report.instructor_name}
                  </h3>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-black flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    Instructor
                  </div>
                </div>
              </div>

              {/* Vertical Divider (Desktop) */}
              <div className="hidden lg:block w-px h-10 bg-gray-100 dark:bg-gray-800"></div>

              {/* Academic Context Section */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-tight border border-gray-100 dark:border-gray-700">
                    {report.program_name}
                  </span>
                  <span className="text-gray-300 dark:text-gray-700 font-light">
                    •
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-tight border border-blue-100/30 dark:border-blue-800/20">
                    {report.grade_name}
                  </span>
                </div>
              </div>

              {/* Period Section */}
              <div className="lg:w-1/6 flex flex-col justify-center">
                <div className="flex items-center text-xs font-bold text-gray-700 dark:text-gray-200 gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>{report.start_date}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tighter">
                  {report.academic_year_name}{" "}
                  <span className="text-gray-200 dark:text-gray-800">/</span>{" "}
                  {report.academic_term_name}
                </div>
              </div>

              {/* Metrics Section */}
              <div className="flex items-center gap-4 lg:w-1/6">
                <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-800/30">
                  <div className="text-center">
                    <div className="text-base font-black text-gray-900 dark:text-white leading-none">
                      {report.lessons_delivered_count}
                    </div>
                    <div className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase mt-1 tracking-tighter">
                      Lessons
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-800/30">
                  <div className="text-center">
                    <div className="text-base font-black text-gray-900 dark:text-white leading-none">
                      {report.mentorship_sessions_count}
                    </div>
                    <div className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase mt-1 tracking-tighter">
                      Mentor
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Section */}
              <div className="lg:w-1/6 flex items-center justify-between lg:justify-end gap-3">
                <span
                  className={`inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    report.progress_status === "ON_TRACK" ||
                    report.progress_status === "AHEAD"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-800/30"
                      : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-800/30"
                  }`}
                >
                  {report.progress_status === "ON_TRACK" ||
                  report.progress_status === "AHEAD" ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  <span>{report.progress_status.replace("_", " ")}</span>
                </span>

                <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 text-gray-300 dark:text-gray-600 flex items-center justify-center border border-gray-100 dark:border-gray-700 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all duration-300">
                  <ChevronRight className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Hover Accent Animation */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center"></div>
          </div>
        ))}
      </div>

      <div className="bg-white/50 dark:bg-gray-900/50 px-8 py-4 rounded-2xl flex items-center justify-between backdrop-blur-sm">
        <div className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
          Found{" "}
          <span className="text-blue-600 dark:text-blue-400 mx-1">
            {reports.length}
          </span>{" "}
          Reports Total
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-tighter border border-white dark:border-gray-700">
          Verified Data Summary
        </div>
      </div>
    </div>
  );
};

export default AdminReportList;
