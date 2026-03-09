import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  FiCalendar,
  FiFilter,
  FiActivity,
  FiTable,
  FiGrid,
  FiTrendingUp,
  FiTarget,
  FiClock,
  FiSearch,
  FiUser,
} from "react-icons/fi";
import { getLogsHistory, ActivityLog, LogsResponse } from "../api/systems";

// Modern Card Component (no shadows, border only)
const ModernCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-gray-900 rounded-3xl ${className}`}>
    {children}
  </div>
);

// Stats Card Component
const StatsCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}> = ({ icon, label, value, color }) => (
  <ModernCard className="p-4">
    <div className="flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  </ModernCard>
);

// Action Type Badge
const ActionTypeBadge: React.FC<{ actionType: string }> = ({ actionType }) => {
  const colors: Record<string, string> = {
    CREATE:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    LOGIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    LOGOUT: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    ROLE_PERMISSIONS_ASSIGN:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  };
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${colors[actionType] || ""} dark:text-white`}
    >
      {actionType}
    </span>
  );
};

// Table Tab Component
const LogsTableTab: React.FC<{
  logs: ActivityLog[];
  pagination:
    | {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      }
    | undefined;
  onPrevPage: () => void;
  onNextPage: () => void;
  loading: boolean;
}> = ({ logs, pagination, onPrevPage, onNextPage, loading }) => {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatMetadata = (metadata: string | null) => {
    if (!metadata) return null;
    try {
      return JSON.stringify(JSON.parse(metadata), null, 2);
    } catch {
      return metadata;
    }
  };

  return (
    <ModernCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/40">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
                User ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Metadata
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700/30 text-sm">
            {logs && logs.length > 0 ? (
              logs.map((log: ActivityLog, index: number) => (
                <motion.tr
                  key={log.activity_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.02 }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <FiClock className="w-4 h-4 text-gray-400" />
                      {formatDateTime(log.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ActionTypeBadge actionType={log.action_type} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-md">
                    {log.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    {log.user_first_name || log.user_username ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {log.user_first_name} {log.user_last_name}
                        </span>
                        <span className="text-xs text-gray-500">
                          @{log.user_username}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">User #{log.user_id}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    {log.entity_type ? (
                      <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">
                        {log.entity_type}
                        {log.entity_id && ` #${log.entity_id}`}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs">
                    {log.metadata ? (
                      <details className="cursor-pointer">
                        <summary className="text-blue-600 dark:text-blue-400 hover:underline">
                          View
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                          {formatMetadata(log.metadata)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                >
                  <FiActivity className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No logs found for the selected date range</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination Controls */}
      {pagination && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing <span className="font-medium">{pagination.offset + 1}</span>{" "}
            to{" "}
            <span className="font-medium">
              {pagination.offset + logs.length}
            </span>{" "}
            of <span className="font-medium">{pagination.total}</span> results
          </div>
          <div className="flex gap-2">
            <button
              onClick={onPrevPage}
              disabled={pagination.offset === 0 || loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600/40 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Previous
            </button>
            <button
              onClick={onNextPage}
              disabled={!pagination.hasMore || loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600/40 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Next
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </ModernCard>
  );
};

// Dashboard Tab Component
const LogsDashboardTab: React.FC<{
  logs: ActivityLog[];
  startDate: string;
  endDate: string;
}> = ({ logs, startDate, endDate }) => {
  // Calculate stats
  const actionTypeCounts = logs.reduce(
    (acc, log) => {
      acc[log.action_type] = (acc[log.action_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topActions = Object.entries(actionTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const entityTypeCounts = logs.reduce(
    (acc, log) => {
      if (log.entity_type) {
        acc[log.entity_type] = (acc[log.entity_type] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const topEntities = Object.entries(entityTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Activity by date in range
  const dateDistribution = logs.reduce(
    (acc, log) => {
      const date = new Date(log.created_at).toISOString().split("T")[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const maxDate = Math.max(...Object.values(dateDistribution), 1);

  // Generate all dates in range
  const generateDateRange = (start: string, end: string) => {
    const dates: string[] = [];
    const current = new Date(start);
    const endDate = new Date(end);
    while (current <= endDate) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const allDates = generateDateRange(startDate, endDate);

  // Calculate user activity
  const userActivityCounts = logs.reduce(
    (acc, log) => {
      const userName = log.user_username
        ? `${log.user_first_name || ""} ${log.user_last_name || ""}`.trim() ||
          log.user_username
        : `User #${log.user_id}`;
      acc[userName] = (acc[userName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topUsers = Object.entries(userActivityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6 overflow-x-auto">
      {/* Activity by Date */}
      <ModernCard className="p-6 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FiCalendar className="w-5 h-5" />
          Activity by Date ({startDate} - {endDate})
        </h3>
        <div className="flex items-end gap-1 h-40 min-w-[400px] overflow-x-auto pb-2">
          {allDates.map((date) => (
            <div key={date} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md"
                style={{
                  height: `${((dateDistribution[date] || 0) / maxDate) * 100}%`,
                  minHeight: dateDistribution[date] ? "8px" : "0",
                }}
                title={`${date}: ${dateDistribution[date] || 0} activities`}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate w-full text-center">
                {new Date(date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      </ModernCard>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Action Types Stats */}
        <ModernCard className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FiTarget className="w-5 h-5" />
            Action Types
          </h3>
          <div className="space-y-3">
            {topActions.map(([action, count]) => (
              <div key={action} className="flex items-center gap-4">
                <div className="w-36 flex-shrink-0 overflow-x-hidden">
                  <ActionTypeBadge actionType={action} />
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                      style={{ width: `${(count / logs.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right text-sm font-medium text-gray-900 dark:text-white">
                  {count}{" "}
                  <span className="text-gray-400 text-xs">
                    ({Math.round((count / logs.length) * 100)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ModernCard>

        {/* Entity Types */}
        <ModernCard className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FiTrendingUp className="w-5 h-5" />
            Entity Types
          </h3>
          <div className="space-y-3">
            {topEntities.length > 0 ? (
              topEntities.map(([entity, count], index) => (
                <div key={entity} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                      {index + 1}
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {entity}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No entity data</p>
            )}
          </div>
        </ModernCard>

        {/* Top Users */}
        <ModernCard className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FiUser className="w-5 h-5" />
            Top Users
          </h3>
          <div className="space-y-3">
            {topUsers.length > 0 ? (
              topUsers.map(([userName, count], index) => (
                <div
                  key={userName}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                      {index + 1}
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {userName}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0">
                    {count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No user data</p>
            )}
          </div>
        </ModernCard>
      </div>
    </div>
  );
};

// Main Component
const LogsHistory: React.FC = () => {
  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [userSearch, setUserSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"table" | "dashboard">(
    "dashboard",
  );
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(20);
  const hasFetchedRef = useRef(false);

  // Default date range: last 7 days (1 week)
  const getDefaultDateRange = () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start: weekAgo.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
    };
  };

  const fetchLogs = async (
    start?: string,
    end?: string,
    currentOffset?: number,
  ) => {
    try {
      setLoading(true);
      const defaultRange = getDefaultDateRange();
      const data = await getLogsHistory({
        start_date: start || defaultRange.start,
        end_date: end || defaultRange.end,
        limit: limit,
        offset: currentOffset ?? offset,
      });
      setLogsData(data || null);
      if (data) {
        setStartDate(data.dateRange.start_date);
        setEndDate(data.dateRange.end_date);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setError("Failed to load logs history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const defaultRange = getDefaultDateRange();
    fetchLogs(defaultRange.start, defaultRange.end);
  }, []);

  const handleFilter = () => {
    if (startDate && endDate) {
      setOffset(0);
      fetchLogs(startDate, endDate, 0);
    }
  };

  const handleReset = () => {
    const defaultRange = getDefaultDateRange();
    setStartDate(defaultRange.start);
    setEndDate(defaultRange.end);
    setUserSearch("");
    setOffset(0);
    fetchLogs(defaultRange.start, defaultRange.end, 0);
  };

  const handleNextPage = () => {
    if (logsData?.pagination.hasMore) {
      const newOffset = offset + limit;
      setOffset(newOffset);
      fetchLogs(undefined, undefined, newOffset);
    }
  };

  const handlePrevPage = () => {
    if (offset > 0) {
      const newOffset = Math.max(0, offset - limit);
      setOffset(newOffset);
      fetchLogs(undefined, undefined, newOffset);
    }
  };

  if (loading && !logsData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Loading logs history...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (error && !logsData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-sm"
        >
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <FiActivity className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Error
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <button
            onClick={() => fetchLogs()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="overflow-x-scroll py-4 md:py-6"
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
            <FiActivity className="w-6 h-6 text-white" />
          </div>
          Logs History
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
          View and analyze system activity logs
        </p>
      </div>

      {/* Date Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-6"
      >
        <ModernCard className="p-4 rounded-2xl">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <div className="relative">
                <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600/50 rounded-2xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Date
              </label>
              <div className="relative">
                <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600/50 rounded-2xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFilter}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2 font-medium"
              >
                <FiFilter className="w-4 h-4" />
                Filter
              </button>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Reset
              </button>
            </div>
          </div>
        </ModernCard>
      </motion.div>

      {/* Stats */}
      {logsData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
        >
          <StatsCard
            icon={<FiActivity className="w-5 h-5 text-blue-600" />}
            label="Total Logs"
            value={logsData.pagination.total.toLocaleString()}
            color="bg-blue-100 dark:bg-blue-900/30"
          />
          <StatsCard
            icon={<FiCalendar className="w-5 h-5 text-green-600" />}
            label="Date Range"
            value={`${logsData.dateRange.start_date} → ${logsData.dateRange.end_date}`}
            color="bg-green-100 dark:bg-green-900/30"
          />
          <StatsCard
            icon={<FiTable className="w-5 h-5 text-blue-600" />}
            label="Showing"
            value={`${logsData.logs.length.toLocaleString()} of ${logsData.pagination.total.toLocaleString()}`}
            color="bg-blue-100 dark:bg-blue-900/30"
          />
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-6"
      >
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-full w-fit">
          <button
            onClick={() => setActiveTab("table")}
            className={`px-5 py-2.5 font-medium text-sm rounded-full transition-all flex items-center gap-2 ${
              activeTab === "table"
                ? "bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <FiTable className="w-4 h-4" />
            Table
          </button>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-5 py-2.5 font-medium text-sm rounded-full transition-all flex items-center gap-2 ${
              activeTab === "dashboard"
                ? "bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <FiGrid className="w-4 h-4" />
            Dashboard
          </button>
          {activeTab === "table" && (
            <div className="relative max-w-md">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by user name..."
                value={userSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setUserSearch(e.target.value)
                }
                className="min-w-[300px] w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600/50 rounded-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === "table" ? (
          <>
            <LogsTableTab
              logs={
                userSearch
                  ? (logsData?.logs || []).filter(
                      (log) =>
                        log.user_name
                          ?.toLowerCase()
                          .includes(userSearch.toLowerCase()) ||
                        log.actor_name
                          ?.toLowerCase()
                          .includes(userSearch.toLowerCase()),
                    )
                  : logsData?.logs || []
              }
              pagination={logsData?.pagination}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              loading={loading}
            />
          </>
        ) : (
          <LogsDashboardTab
            logs={logsData?.logs || []}
            startDate={startDate || logsData?.dateRange.start_date || ""}
            endDate={endDate || logsData?.dateRange.end_date || ""}
          />
        )}
      </motion.div>
    </motion.div>
  );
};

export default LogsHistory;
