import React, { useState, useEffect } from "react";
import Navbar from "./ui/Navbar";
import Sidebar from "./ui/Sidebar";
import WelcomePopup from "./WelcomePopup";
import ChangePasswordModal from "./ChangePasswordModal";
import { useUser } from "../contexts/UserContext";
import { ReminderNudge } from "./reminders/ReminderNudge";

interface SystemLayoutProps {
  children: React.ReactNode;
  title?: string;
  showSidebar?: boolean;
  fullWidth?: boolean;
}

const SystemLayout: React.FC<SystemLayoutProps> = ({
  children,
  title,
  showSidebar = false,
  fullWidth = false,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showChangePasswordModalUser, setShowChangePasswordModalUser] =
    useState(false);
  const { showWelcomePopup, setShowWelcomePopup, user, refreshUser } =
    useUser();

  useEffect(() => {
    // Check if password change is required
    if (user?.forcePasswordChange) {
      setShowChangePasswordModal(true);
    }
  }, [user]);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Hide on small screens, show on medium and large
    if (screenWidth < 640) {
      // Small screens: sidebar hidden
      setIsSidebarCollapsed(true); // Reset
    }
    if (screenWidth < 1040) {
      // Medium and large screens: expanded
      setIsSidebarCollapsed(true);
    } else {
      // Medium and large screens: expanded
      setIsSidebarCollapsed(false);
    }
  }, [screenWidth]);

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
          {screenWidth >= 640 ? (
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              onMenuClick={() => screenWidth < 640 && setIsSidebarOpen(false)}
            />
          ) : (
            isSidebarOpen && (
              <>
                <div
                  className="fixed inset-0 z-50 bg-black/50"
                  onClick={() => setIsSidebarOpen(false)}
                />
                <div className="fixed top-16 left-0 z-50 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-gray-800 shadow-lg">
                  <Sidebar
                    isCollapsed={false}
                    onToggle={() => setIsSidebarOpen(false)}
                    onMenuClick={() => setIsSidebarOpen(false)}
                  />
                </div>
              </>
            )
          )}
          <Navbar
            showNavigation={false}
            showAuthButtons={false}
            showUserCard={true}
            onChangePassword={() => setShowChangePasswordModalUser(true)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        </>
      )}

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          showSidebar && screenWidth >= 640
            ? `pt-16 ${isSidebarCollapsed ? "ml-20" : "ml-64"}`
            : "pt-16"
        }`}
      >
        <div className={fullWidth ? "w-full px-4 md:px-6" : "max-w-7xl mx-auto"}>
          {title && (
            <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark mb-6">
              {title}
            </h1>
          )}
          {children}
        </div>
      </main>

      {/* Install / notification nudges + the permission health check that
          runs on every app open (REMINDERS_SOLUTION_PROPOSAL.md §7.5). */}
      {showSidebar && user && <ReminderNudge />}

      {/* Welcome Popup */}
      {showWelcomePopup && (
        <WelcomePopup onClose={() => setShowWelcomePopup(false)} />
      )}

      {/* Change Password Modal - Forced */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onSuccess={async () => {
          setShowChangePasswordModal(false);
          await refreshUser(); // Refresh user data to update forcePasswordChange status
        }}
        isForced={true}
      />

      {/* Change Password Modal - User initiated */}
      <ChangePasswordModal
        isOpen={showChangePasswordModalUser}
        onClose={() => setShowChangePasswordModalUser(false)}
        onSuccess={() => {
          setShowChangePasswordModalUser(false);
        }}
        isForced={false}
      />
    </div>
  );
};

export default SystemLayout;
