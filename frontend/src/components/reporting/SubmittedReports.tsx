import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  FileText,
  ChevronRight,
  Calendar as CalendarIcon,
  User,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { InstructorReport } from "../../api/reports";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";

const parseLocalNoShift = (dateStr: string) => {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toYMD = (d: Date) => format(d, "yyyy-MM-dd");

type FilterPreset = "all" | "today" | "week" | "month" | "custom";

interface SubmittedReportsProps {
  reports: InstructorReport[];
  loading: boolean;
  onLoad: (params: {
    start_date?: string;
    end_date?: string;
    key: string;
  }) => void;
}

const SubmittedReports: React.FC<SubmittedReportsProps> = ({
  reports,
  loading,
  onLoad,
}) => {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<FilterPreset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getDateRange = useCallback((): { start?: string; end?: string } => {
    const today = new Date();
    switch (preset) {
      case "today":
        return { start: toYMD(today), end: toYMD(today) };
      case "week":
        return {
          start: toYMD(startOfWeek(today, { weekStartsOn: 1 })),
          end: toYMD(endOfWeek(today, { weekStartsOn: 1 })),
        };
      case "month":
        return {
          start: toYMD(startOfMonth(today)),
          end: toYMD(endOfMonth(today)),
        };
      case "custom":
        return { start: customStart || undefined, end: customEnd || undefined };
      default:
        return {};
    }
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    const range = getDateRange();
    const fetchKey = `${preset}-${range.start}-${range.end}`;
    onLoad({
      start_date: range.start,
      end_date: range.end,
      key: fetchKey,
    });
  }, [getDateRange, preset, onLoad]);

  const filteredReports = reports.filter(
    (r) =>
      (r.first_name + " " + r.last_name)
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      r.progress_status.toLowerCase().includes(search.toLowerCase()),
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ON_TRACK":
        return (
          <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 w-fit">
            <CheckCircle2 className="w-3 h-3" /> <span>On Track</span>
          </span>
        );
      case "SLIGHTLY_BEHIND":
        return (
          <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 w-fit">
            <Clock className="w-3 h-3" /> <span>Slightly Behind</span>
          </span>
        );
      case "AHEAD":
        return (
          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 w-fit">
            <Clock className="w-3 h-3" /> <span>Ahead</span>
          </span>
        );
      default:
        return (
          <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full text-xs font-bold w-fit">
            {status}
          </span>
        );
    }
  };

  const presets: { id: FilterPreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "all", label: "All Time" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Date Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">
            Period:
          </span>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === p.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range pickers */}
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">From</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-white rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">To</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-white rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            {(customStart || customEnd) && (
              <button
                onClick={() => {
                  setCustomStart("");
                  setCustomEnd("");
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-start">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search reports by status or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <span className="text-xs text-gray-400 font-medium pt-2.5">
          {filteredReports.length} report
          {filteredReports.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto pr-1">
          {filteredReports.map((report) => (
            <div
              key={report.report_id}
              className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-900 transition-all group cursor-pointer text-sm"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-all">
                    <FileText className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-all" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white flex flex-wrap items-center gap-2">
                      <span>
                        Report -{" "}
                        {format(
                          parseLocalNoShift(report.start_date),
                          "dd/MM/yyyy",
                        )}
                      </span>
                      {getStatusBadge(report.progress_status)}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />
                        {format(
                          parseLocalNoShift(report.start_date),
                          "dd/MM/yyyy",
                        )}{" "}
                        →{" "}
                        {format(
                          parseLocalNoShift(report.end_date),
                          "dd/MM/yyyy",
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {report.first_name} {report.last_name}
                      </span>
                      <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        {format(
                          new Date(report.submission_date),
                          "dd/MM/yyyy HH:mm",
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="text-[10px] font-bold text-gray-400">
                        Lessons
                      </div>
                      <div className="text-base font-black text-gray-700 dark:text-gray-200">
                        {report.lessons_delivered_count}
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="text-[10px] font-bold text-gray-400">
                        Mentorship
                      </div>
                      <div className="text-base font-black text-gray-700 dark:text-gray-200">
                        {report.mentorship_sessions_count}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-all translate-x-0 group-hover:translate-x-1" />
                </div>
              </div>
            </div>
          ))}

          {filteredReports.length === 0 && (
            <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
              <div className="p-5 bg-white dark:bg-gray-800 rounded-full w-fit mx-auto shadow-sm mb-3">
                <Search className="w-7 h-7 text-gray-300" />
              </div>
              <h3 className="text-base font-bold text-gray-800 dark:text-white">
                No reports found
              </h3>
              <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">
                Try adjusting the date filter or search.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubmittedReports;
