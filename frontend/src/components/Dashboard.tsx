import React from "react";

interface DashboardProps {
  onLogout?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({}) => {
  return (
    <div className="min-h-screen">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-2">
            Welcome to NGA MIS
          </h2>
          <p className="text-text-secondary-light dark:text-text-secondary-dark/50">
            Your central management information system dashboard
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">
                  Total Students
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  1,247
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">
                  Total Teachers
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  89
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">
                  Active Classes
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  24
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-2xl">
                <svg
                  className="w-6 h-6 text-orange-600 dark:text-orange-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">
                  Reports Today
                </p>
                <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  12
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card-light dark:bg-card-dark/30 rounded-3xl shadow-sm border border-white dark:border-border-dark/30 p-6">
          <h3 className="text-lg font-semibold text-text-primary-light dark:text-text-primary-dark mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-2xl mr-3">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
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
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  Manage Students
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  Add, edit, or view student records
                </p>
              </div>
            </button>

            <button className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-2xl mr-3">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10a2 2 0 002 2h4a2 2 0 002-2V11M9 11h6"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  Grade Management
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  Manage grades and assessments
                </p>
              </div>
            </button>

            <button className="flex items-center p-4 border border-white dark:border-border-dark/30 rounded-2xl bg-gray-100 dark:bg-gray-800/50 hover:bg-surface-light dark:hover:bg-surface-dark/40 transition-colors duration-200">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-2xl mr-3">
                <svg
                  className="w-5 h-5 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-text-primary-light dark:text-text-primary-dark">
                  Reports
                </p>
                <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  Generate and view reports
                </p>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
