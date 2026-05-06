import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  Ban,
  FileText,
  Folder,
  BookOpen,
  ShieldCheck,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  AlertCircle,
  Calendar,
  LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { UserWithProfile, getUserActivities, Activity } from "../../api/users";
import { Permissions as PermConstants } from "../../constants/permissions";

interface ActivityTabProps {
  user: UserWithProfile;
  hasPermission: (perm: string) => boolean;
  handleToggleUserStatus: () => Promise<void>;
  changingStatus: boolean;
}

const ActivityTab: React.FC<ActivityTabProps> = ({
  user,
  hasPermission,
  handleToggleUserStatus,
  changingStatus,
}) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserActivities(user.user.user_id, {
        startDate,
        endDate,
        page,
        limit,
      });
      if (data) {
        setActivities(data.activities);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch activities");
    } finally {
      setLoading(false);
    }
  }, [user.user.user_id, startDate, endDate, page, limit]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const getActivityIcon = (type: string): LucideIcon => {
    switch (type) {
      case "DOCUMENT_UPLOAD":
        return FileText;
      case "FOLDER_CREATE":
        return Folder;
      case "SUBJECT_ENROLL":
        return BookOpen;
      case "SUBJECT_ASSIGN":
        return ShieldCheck;
      case "SECURITY_OTP":
        return ShieldCheck;
      case "ACCOUNT_CREATE":
        return CheckCircle;
      default:
        return Clock;
    }
  };

  const getActivityColor = (type: string): string => {
    switch (type) {
      case "DOCUMENT_UPLOAD":
        return "text-blue-500 bg-blue-50 dark:bg-blue-900/20";
      case "FOLDER_CREATE":
        return "text-amber-500 bg-amber-50 dark:bg-amber-900/20";
      case "SUBJECT_ENROLL":
        return "text-green-500 bg-green-50 dark:bg-green-900/20";
      case "SUBJECT_ASSIGN":
        return "text-blue-500 bg-blue-50 dark:bg-blue-900/20";
      case "SECURITY_OTP":
        return "text-red-500 bg-red-50 dark:bg-red-900/20";
      case "ACCOUNT_CREATE":
        return "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20";
      default:
        return "text-slate-500 bg-slate-50 dark:bg-slate-900/20";
    }
  };

  const groupedActivities = React.useMemo(() => {
    const groups: { label: string; date: Date; items: Activity[] }[] = [];
    const today = new Date().toLocaleDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString();

    activities.forEach((activity) => {
      const actDate = new Date(activity.created_at);
      const dateStr = actDate.toLocaleDateString();
      let label = dateStr;

      if (dateStr === today) label = "Today";
      else if (dateStr === yesterdayStr) label = "Yesterday";
      else {
        label = actDate.toLocaleDateString([], {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }

      const existingGroup = groups.find((g) => g.label === label);
      if (existingGroup) {
        existingGroup.items.push(activity);
      } else {
        groups.push({ label, date: actDate, items: [activity] });
      }
    });

    return groups;
  }, [activities]);

  const formatActivityDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      full: date.toLocaleString(),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  };

  return (
    <div className="space-y-6">
      {/* Filters Header */}
      {/* Filters Header - Compact & Premium */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 text-blue-500 rounded-lg">
            <Filter className="w-4 h-4" />
          </div>
          <p className="font-bold text-gray-900 dark:text-white text-[15px]">
            Activity Timeline
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-medium">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="bg-transparent border-none px-2 py-1 text-[13px] outline-none w-[125px] dark:text-white"
            />
            <span className="text-slate-300 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="bg-transparent border-none px-2 py-1 text-[13px] outline-none w-[125px] dark:text-white"
            />
          </div>

          <button
            onClick={fetchActivities}
            className="h-9 w-9 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center shrink-0"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Account Status Card - Sleek & Compact */}
      <div className="p-5 bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 dark:from-blue-950/20 dark:via-gray-900 dark:to-blue-950/20 rounded-3xl border border-blue-100/50 dark:border-blue-900/20 shadow-sm relative overflow-hidden group">
        <div className="absolute -top-6 -right-6 opacity-5 group-hover:scale-110 transition-transform duration-500">
          <ShieldCheck className="w-24 h-24" />
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                user.user.status === "ACTIVE"
                  ? "bg-emerald-500 text-white"
                  : "bg-rose-500 text-white"
              }`}
            >
              {user.user.status === "ACTIVE" ? (
                <CheckCircle className="w-6 h-6" />
              ) : (
                <Ban className="w-6 h-6" />
              )}
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white">
                Account Security
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    user.user.status === "ACTIVE"
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                  }`}
                />
                <p className="text-[13px] text-gray-500 dark:text-gray-400">
                  {user.user.status === "ACTIVE"
                    ? "Active and Secure"
                    : "Access Restricted"}
                </p>
              </div>
            </div>
          </div>
          {hasPermission(PermConstants.ENABLE_DISABLE_USERS) && (
            <button
              onClick={handleToggleUserStatus}
              disabled={changingStatus}
              className={`h-11 px-6 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center gap-2 ${
                user.user.status === "ACTIVE"
                  ? "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400"
                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
              } disabled:opacity-50`}
            >
              {changingStatus ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              ) : user.user.status === "ACTIVE" ? (
                <>
                  <Ban className="w-4 h-4" />
                  Disable
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Activate
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-blue-50/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-3xl border border-slate-100 dark:border-slate-800 px-1 py-1 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-gray-500 font-medium animate-pulse">
              Scanning timeline...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-3xl flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <p className="text-gray-900 dark:text-white font-semibold text-lg">
              {error}
            </p>
            <button
              onClick={fetchActivities}
              className="text-blue-500 font-medium hover:underline"
            >
              Try again
            </button>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-3xl flex items-center justify-center">
              <Clock className="w-8 h-8" />
            </div>
            <p className="text-gray-900 dark:text-white font-semibold text-lg">
              No activities found
            </p>
            <p className="text-gray-500 max-w-xs">
              There are no logs for the selected date range. Try adjusting your
              filters.
            </p>
          </div>
        ) : (
          <div className="relative p-2 sm:p-4">
            {/* Main Interactive Timeline Line */}
            <motion.div
              layout
              className="absolute left-[39px] sm:left-[63px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-blue-500 via-blue-500 to-blue-500 opacity-60"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.2, ease: "circOut" }}
            />

            <div className="space-y-12">
              {groupedActivities.map((group, groupIdx) => (
                <div key={groupIdx + 1} className="relative">
                  {/* Vertical Period Node - Sits on the line */}
                  <div className="absolute left-[24px] sm:left-[32px] top-0 z-40">
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      className="w-[32px] h-[32px] rounded-full bg-blue-600 dark:bg-blue-500 shadow-lg shadow-blue-500/20 flex items-center justify-center border-2 border-white dark:border-gray-900 group"
                    >
                      <Calendar className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-transform" />
                    </motion.div>
                    <div className="absolute left-[38px] top-1 sm:left-[44px] whitespace-nowrap">
                      <span className="text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-2 py-0.5 rounded-md border border-blue-100/50 dark:border-blue-800/30 shadow-sm">
                        {group.label}
                      </span>
                    </div>
                  </div>

                  <div className="pt-10 space-y-0">
                    {group.items.map((activity, itemIdx) => {
                      const Icon = getActivityIcon(activity.action_type);
                      const colorClass = getActivityColor(activity.action_type);
                      const { time } = formatActivityDate(activity.created_at);

                      return (
                        <motion.div
                          key={`${activity.action_type}-${activity.id}-${itemIdx}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: groupIdx * 0.05 + itemIdx * 0.02,
                            duration: 0.3,
                          }}
                          className="group relative pl-12 xs:pl-16 sm:pl-20 pr-2 py-1"
                        >
                          {/* Interactive Node (Dot) */}
                          <div className="absolute left-[34px] sm:left-[42px] top-1/2 -translate-y-1/2 z-30">
                            <motion.div
                              whileHover={{ scale: 1.4 }}
                              className="w-3 h-3 rounded-full bg-white dark:bg-gray-900 border-2 border-blue-500 shadow-sm relative"
                            >
                              <div className="absolute inset-0 rounded-full animate-ping bg-blue-500/30" />
                            </motion.div>
                          </div>

                          <div className="flex gap-4 p-3 rounded-2xl bg-white hover:bg-white dark:bg-gray-900 dark:hover:bg-gray-800/60 border border-transparent hover:border-slate-100 dark:hover:border-slate-800/50 hover:shadow-lg hover:shadow-slate-200/20 dark:hover:shadow-black/20 transition-all duration-300 relative">
                            {/* Icon Box */}
                            <div
                              className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center shadow-sm relative z-20 ${colorClass}`}
                            >
                              <Icon className="w-5 h-5" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <div className="flex items-baseline gap-2 min-w-0">
                                  <h4 className="font-bold text-gray-900 dark:text-white text-[14px] truncate group-hover:text-blue-500 transition-colors">
                                    {activity.action_type
                                      .split("_")
                                      .map(
                                        (w) =>
                                          w.charAt(0) +
                                          w.slice(1).toLowerCase(),
                                      )
                                      .join(" ")}
                                  </h4>
                                  {activity.actor_first_name && (
                                    <span className="text-[10px] font-medium text-blue-500/80 dark:text-blue-400/80 truncate">
                                      by {activity.actor_first_name}{" "}
                                      {activity.actor_last_name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 shrink-0 uppercase tracking-tight">
                                  <Clock className="w-3 h-3" />
                                  <span>{time}</span>
                                </div>
                              </div>

                              <p className="text-gray-600 dark:text-gray-400 text-[12.5px] leading-relaxed mb-2 line-clamp-2">
                                {activity.description}
                              </p>

                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {activity.entity_type && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 rounded-lg text-[9px] font-bold tracking-tight uppercase">
                                    <span className="opacity-60">
                                      {activity.entity_type}:
                                    </span>
                                    <span>#{activity.entity_id}</span>
                                  </div>
                                )}

                                {activity.metadata && (
                                  <details className="group/details relative z-40">
                                    <summary className="px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[9px] font-bold text-slate-400 hover:text-blue-500 cursor-pointer transition-all list-none flex items-center gap-1 uppercase">
                                      <Search className="w-3 h-3 text-current" />
                                      View System Payload
                                    </summary>
                                    <div className="fixed sm:absolute left-2 sm:left-0 right-2 sm:right-auto sm:min-w-[300px] mt-2 p-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl text-[10px] font-mono text-blue-600 dark:text-blue-400 overflow-x-auto whitespace-pre-wrap z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                      {(() => {
                                        try {
                                          const parsed = JSON.parse(
                                            activity.metadata,
                                          );
                                          return JSON.stringify(
                                            parsed,
                                            null,
                                            2,
                                          );
                                        } catch (e) {
                                          return activity.metadata;
                                        }
                                      })()}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-500">
            Showing{" "}
            <span className="font-bold text-gray-900 dark:text-white">
              {(page - 1) * limit + 1}
            </span>{" "}
            to{" "}
            <span className="font-bold text-gray-900 dark:text-white">
              {Math.min(page * limit, total)}
            </span>{" "}
            of{" "}
            <span className="font-bold text-gray-900 dark:text-white">
              {total}
            </span>
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-gray-100 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all font-medium text-sm flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                // Simplified pagination logic for 5 pages around current
                let pageNum = page;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                      page === pageNum
                        ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-gray-100 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all font-medium text-sm flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityTab;
