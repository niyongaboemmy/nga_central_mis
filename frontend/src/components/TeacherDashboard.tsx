import React, { useEffect, useState, useRef } from "react";
import {
  getTeacherDashboardStats,
  TeacherDashboardStats,
} from "../api/dashboard";
import DashboardCalendarWidget from "./calendar/DashboardCalendarWidget";

interface TeacherDashboardProps {
  onLogout?: () => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({}) => {
  const [stats, setStats] = useState<TeacherDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchStats = async () => {
      try {
        const data = await getTeacherDashboardStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch teacher dashboard stats:", err);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2">
            Teacher Dashboard
          </h2>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-2xl">
                <svg
                  className="w-6 h-6 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Assigned Subjects
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {stats?.assignedSubjects.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-2xl">
                <svg
                  className="w-6 h-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Total Students
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {stats?.totalStudents.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-2xl">
                <svg
                  className="w-6 h-6 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70">
                  Class Groups
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {stats?.assignedClassGroups.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Calendar Widget */}
        <DashboardCalendarWidget />
      </main>
    </div>
  );
};

export default TeacherDashboard;
