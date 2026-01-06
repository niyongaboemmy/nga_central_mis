import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import LOGO from "../../assets/logo.png";

interface NavbarProps {
  onNavigateToLogin?: () => void;
  onNavigateToAbout?: () => void;
  onNavigateToContact?: () => void;
  onNavigateBack?: () => void;
  onNavigateToHome?: () => void;
  showNavigation?: boolean;
  showAuthButtons?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  onNavigateToLogin,
  onNavigateToAbout,
  onNavigateToContact,
  onNavigateBack,
  onNavigateToHome,
  showNavigation = true,
  showAuthButtons = true,
}) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentPath = location.pathname;
  const isActive = (path: string) => currentPath === path;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const NavLink: React.FC<{
    isActive: boolean;
    onClick?: () => void;
    children: React.ReactNode;
  }> = ({ isActive, onClick, children }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium flex items-center space-x-2 relative ${
        isActive
          ? "text-blue-600 dark:text-blue-400"
          : "text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400"
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full" />
      )}
    </button>
  );

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-800/50 backdrop-blur-md border-b border-border-light/50 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              {onNavigateBack ? (
                <button
                  onClick={onNavigateBack}
                  className="flex items-center space-x-3 group"
                >
                  <img
                    src={LOGO}
                    alt="NGA Central MIS"
                    className="w-10 h-10 rounded-full group-hover:shadow-lg transition-shadow"
                  />
                  <span className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark hidden sm:block">
                    NGA Central MIS
                  </span>
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <img
                    src={LOGO}
                    alt="NGA Central MIS"
                    className="w-10 h-10 rounded-full"
                  />
                  <span className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark hidden sm:block">
                    NGA Central MIS
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Navigation - Always visible */}
            {showNavigation && (
              <div className="hidden md:flex items-center space-x-2">
                {onNavigateToHome && (
                  <NavLink isActive={isActive("/")} onClick={onNavigateToHome}>
                    <span>Home</span>
                  </NavLink>
                )}
                {onNavigateToAbout && (
                  <NavLink
                    isActive={isActive("/about")}
                    onClick={onNavigateToAbout}
                  >
                    <span>About Us</span>
                  </NavLink>
                )}
                {onNavigateToContact && (
                  <NavLink
                    isActive={isActive("/contact")}
                    onClick={onNavigateToContact}
                  >
                    <span>Contact Us</span>
                  </NavLink>
                )}
              </div>
            )}

            {/* Desktop Auth & Theme Toggle */}
            <div className="hidden md:flex items-center space-x-4">
              <ThemeToggle />
              {showAuthButtons && onNavigateToLogin && !isActive("/login") && (
                <button
                  onClick={onNavigateToLogin}
                  className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-500 rounded-full transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center space-x-3">
              <ThemeToggle />
              <button
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-lg text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200 focus:outline-none"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            isMobileMenuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 pt-2 pb-4 space-y-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-border-light dark:border-gray-700">
            {showNavigation && (
              <>
                {onNavigateToHome && (
                  <button
                    onClick={() => {
                      onNavigateToHome();
                      closeMobileMenu();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 font-medium flex items-center space-x-3 ${
                      isActive("/")
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400"
                    }`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    <span>Home</span>
                    {isActive("/") && (
                      <span className="ml-auto w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full" />
                    )}
                  </button>
                )}
                {onNavigateToAbout && (
                  <button
                    onClick={() => {
                      onNavigateToAbout();
                      closeMobileMenu();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 font-medium flex items-center space-x-3 ${
                      isActive("/about")
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400"
                    }`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>About Us</span>
                    {isActive("/about") && (
                      <span className="ml-auto w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full" />
                    )}
                  </button>
                )}
                {onNavigateToContact && (
                  <button
                    onClick={() => {
                      onNavigateToContact();
                      closeMobileMenu();
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 font-medium flex items-center space-x-3 ${
                      isActive("/contact")
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400"
                    }`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Contact Us</span>
                    {isActive("/contact") && (
                      <span className="ml-auto w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full" />
                    )}
                  </button>
                )}
              </>
            )}
            {showAuthButtons && onNavigateToLogin && (
              <button
                onClick={() => {
                  onNavigateToLogin();
                  closeMobileMenu();
                }}
                className={`w-full px-4 py-3 mt-4 font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center space-x-2 ${
                  isActive("/login")
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-text-secondary-light dark:text-text-secondary-dark hover:text-blue-600 dark:hover:text-blue-400"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                  />
                </svg>
                <span>Sign In</span>
                {isActive("/login") && (
                  <span className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full" />
                )}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}
    </>
  );
};

export default Navbar;
