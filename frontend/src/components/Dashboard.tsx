import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { FiCalendar, FiClock, FiUser } from "react-icons/fi";
import { getBasicDashboardStats, BasicDashboardStats } from "../api/dashboard";
import DashboardCalendarWidget from "./calendar/DashboardCalendarWidget";

interface DashboardProps {
  onLogout?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({}) => {
  const [stats, setStats] = useState<BasicDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchStats = async () => {
      try {
        const data = await getBasicDashboardStats();
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
    hover: { scale: 1.02, transition: { duration: 0.2 } },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-3 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Loading your dashboard...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-800 max-w-sm"
        >
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <FiUser className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Error
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-600 text-white text-sm font-medium rounded-xl hover:shadow-lg transition-all duration-200"
          >
            Try Again
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Subtle animated background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-10 left-5 w-24 h-24 bg-blue-200 rounded-full opacity-8 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -60, 0], y: [0, 40, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 right-10 w-32 h-32 bg-blue-200 rounded-full opacity-8 blur-3xl"
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        {/* Header Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-8 pb-6">
          <motion.div variants={itemVariants}>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome back to{" "}
              <span className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 bg-clip-text text-transparent">
                NGA MIS
              </span>
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Your comprehensive management information system for academic
              excellence
            </p>
          </motion.div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <motion.div
            variants={itemVariants}
            className="px-4 sm:px-6 lg:px-8 mb-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Academic Year Card */}
              <motion.div
                variants={cardVariants}
                whileHover="hover"
                className="group bg-white dark:bg-gray-900/70 backdrop-blur-md rounded-3xl p-3 lg:p-5 2xl:p-8 lg:py-4 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/60 rounded-xl group-hover:scale-110 transition-transform duration-300">
                    <FiCalendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">
                    Academic Year
                  </span>
                </div>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {stats.currentAcademicYear}
                </p>
              </motion.div>

              {/* Current Term Card */}
              <motion.div
                variants={cardVariants}
                whileHover="hover"
                className="group bg-white dark:bg-gray-900/70 backdrop-blur-md rounded-3xl p-3 lg:p-5 2xl:p-8 lg:py-4 bordewhiteay-200/60 dark:border-gray-800/60 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/60 rounded-xl group-hover:scale-110 transition-transform duration-300">
                    <FiClock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">
                    Current Term
                  </span>
                </div>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {stats.currentAcademicTerm}
                </p>
              </motion.div>

              {/* User Role Card */}
              {stats.currentUserRole && (
                <motion.div
                  variants={cardVariants}
                  whileHover="hover"
                  className="group bg-white dark:bg-gray-900/70 backdrop-blur-md rounded-3xl p-3 lg:p-5 2xl:p-8 lg:py-4 bordewhiteay-200/60 dark:border-gray-800/60 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/60 rounded-xl group-hover:scale-110 transition-transform duration-300">
                      <FiUser className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">
                      Your Role
                    </span>
                  </div>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {stats.currentUserRole}
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Dashboard Calendar Widget */}
        <motion.div
          variants={itemVariants}
          className="px-4 sm:px-6 lg:px-8 mb-12"
        >
          <DashboardCalendarWidget />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
