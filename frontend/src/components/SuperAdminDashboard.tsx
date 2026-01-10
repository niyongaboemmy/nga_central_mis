import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getDashboardStats, DashboardStats } from "../api/dashboard";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  Users,
  BookOpen,
  FileText,
  TrendingUp,
  Activity,
  Server,
  HardDrive,
} from "lucide-react";

interface SuperAdminDashboardProps {
  onLogout?: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-12 w-12 border-b-2 border-blue-600"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="text-red-600 mb-4">{error}</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // Prepare chart data
  const userDistributionData = [
    { name: "Students", value: stats!.totalStudents, color: "#3B82F6" },
    { name: "Teachers", value: stats!.totalTeachers, color: "#10B981" },
    { name: "Admins", value: stats!.totalAdmins, color: "#F59E0B" },
    { name: "Staff", value: stats!.totalStaff, color: "#8B5CF6" },
  ];

  const roleStatsData = stats!.roleStats.map((role, index) => ({
    ...role,
    color: `hsl(${(index * 137.5) % 360}, 70%, 50%)`, // Generate distinct colors
  }));

  const academicData = [
    { name: "Programs", value: stats!.totalPrograms },
    { name: "Grades", value: stats!.totalGrades },
    { name: "Subjects", value: stats!.totalSubjects },
    { name: "Active Terms", value: stats!.currentAcademicTerms },
  ];

  const documentData = [
    { name: "Today", uploads: stats!.documentsUploadedToday },
    { name: "This Week", uploads: stats!.documentsUploadedThisWeek },
  ];

  const systemHealthColor =
    stats!.systemHealth >= 90
      ? "#10B981"
      : stats!.systemHealth >= 70
      ? "#F59E0B"
      : "#EF4444";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen"
    >
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-1">
            Super Admin Dashboard
          </h2>
          <p className="text-text-secondary-light dark:text-text-secondary-dark/70 text-sm">
            Complete overview of the entire NGA Central MIS system
          </p>
        </motion.div>

        {/* System Stats Cards */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <div className="flex items-center">
              <motion.div
                className="p-2 rounded-2xl"
                style={{ backgroundColor: `${systemHealthColor}20` }}
              >
                <Activity
                  className="w-6 h-6"
                  style={{ color: systemHealthColor }}
                />
              </motion.div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  System Health
                </p>
                <p
                  className="text-2xl font-bold"
                  style={{ color: systemHealthColor }}
                >
                  {stats!.systemHealth}%
                </p>
                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
                  DB: {stats!.databaseStatus}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-2xl">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Total Users
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {(
                    stats!.totalStudents +
                    stats!.totalTeachers +
                    stats!.totalAdmins +
                    stats!.totalStaff
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-2xl">
                <BookOpen className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Academic Programs
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {stats!.totalPrograms.toLocaleString()}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-2xl">
                <HardDrive className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Storage Used
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {(stats!.totalStorageUsed / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                  GB
                </p>
                <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
                  {stats!.totalDocuments} files
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Charts Section */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* User Distribution Pie Chart */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
              User Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={userDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {userDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {userDistributionData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Academic Data Bar Chart */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
          >
            <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
              Academic Overview
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={academicData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </motion.div>

        {/* Document Upload Trends */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6 mb-8"
        >
          <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
            Document Upload Trends
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={documentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* User Roles Overview */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6 mb-8"
        >
          <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
            User Roles Distribution
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {roleStatsData.map((role, index) => (
              <motion.div
                key={role.roleName}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="bg-gradient-to-br from-white to-white dark:from-gray-800/60 dark:to-gray-800/60 rounded-2xl p-4 border border-gray-200 dark:border-gray-700/40 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  <span className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                    {role.count}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
                  {role.roleName.replace(/_/g, " ")}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* System Actions */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6"
        >
          <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
            System Administration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200"
            >
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-2xl mr-3">
                <Server className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  System Alerts
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                  Monitor system health and alerts
                </p>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200"
            >
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-2xl mr-3">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  Audit Logs
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                  Review system activity logs
                </p>
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200"
            >
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-2xl mr-3">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  System Settings
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                  Configure system-wide settings
                </p>
              </div>
            </motion.button>
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
};

export default SuperAdminDashboard;
