import React, { useState } from "react";
import Navbar from "./ui/Navbar";
import Sidebar from "./ui/Sidebar";

interface SystemLayoutProps {
  children: React.ReactNode;
  title?: string;
  showSidebar?: boolean;
}

const SystemLayout: React.FC<SystemLayoutProps> = ({
  children,
  title,
  showSidebar = false,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-black">
      {/* Top Navbar - Only show when not using sidebar layout */}
      {!showSidebar && (
        <Navbar
          onNavigateToHome={() => (window.location.href = "/")}
          onNavigateToAbout={() => (window.location.href = "/about")}
          onNavigateToContact={() => (window.location.href = "/contact")}
          onNavigateToLogin={() => (window.location.href = "/login")}
          showNavigation={true}
          showAuthButtons={true}
        />
      )}

      {/* Sidebar Layout */}
      {showSidebar && (
        <>
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
          <Navbar
            showNavigation={false}
            showAuthButtons={false}
            showUserCard={true}
          />
        </>
      )}

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          showSidebar
            ? `pt-16 ${isSidebarCollapsed ? "ml-20" : "ml-64"}`
            : "pt-16"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          {title && (
            <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
              {title}
            </h1>
          )}
          {children}
        </div>
      </main>
    </div>
  );
};

export default SystemLayout;
