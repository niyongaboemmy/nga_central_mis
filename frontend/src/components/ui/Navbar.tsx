import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import LOGO from "../../assets/logo.png";
import { useUser } from "../../contexts/UserContext";
import SystemsMenu from "./SystemsMenu";
import { LayoutGrid } from "lucide-react";

interface NavbarProps {
  onNavigateToLogin?: () => void;
  onNavigateToAbout?: () => void;
  onNavigateToContact?: () => void;
  onNavigateBack?: () => void;
  onNavigateToHome?: () => void;
  onChangePassword?: () => void;
  onToggleSidebar?: () => void;
  showNavigation?: boolean;
  showAuthButtons?: boolean;
  showUserCard?: boolean;
  websiteUrl?: string;
}

const Navbar: React.FC<NavbarProps> = ({
  onNavigateToLogin,
  onNavigateToAbout,
  onNavigateToContact,
  onNavigateBack,
  onNavigateToHome,
  onChangePassword,
  onToggleSidebar,
  showNavigation = true,
  showAuthButtons = true,
  showUserCard = false,
}) => {
  const location = useLocation();
  const { user, logout } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isSystemsMenuOpen, setIsSystemsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const systemsMenuRef = useRef<HTMLDivElement>(null);

  const currentPath = location.pathname;
  const isActive = (path: string) => currentPath === path;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsUserDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getUserDisplayName = () => {
    if (!user) return "User";
    const { profile, user: userData } = user;
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return userData.username;
  };

  const getUserInitials = () => {
    if (!user) return "U";
    const { profile, user: userData } = user;
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return userData.username[0].toUpperCase();
  };

  const handleLogout = () => {
    logout();
    setIsUserDropdownOpen(false);
    window.location.href = "/mis/login";
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
          : "text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400"
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
        <div className={`${user ? "px-1.5 sm:pl-3" : "max-w-7xl mx-auto"}`}>
          <div className="flex items-center justify-between h-16">
            {/* Logo and Systems Waffle */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              {user && (
                <div className="relative" ref={systemsMenuRef}>
                  <button
                    onClick={() => setIsSystemsMenuOpen(!isSystemsMenuOpen)}
                    className="p-2 mr-1 rounded-xl text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200"
                    title="Systems"
                  >
                    <LayoutGrid className="w-6 h-6" />
                  </button>
                  <SystemsMenu
                    isOpen={isSystemsMenuOpen}
                    onClose={() => setIsSystemsMenuOpen(false)}
                    systems={user.systems || []}
                  />
                </div>
              )}

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
                  <span className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                    NGA MIS
                  </span>
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <img
                    src={LOGO}
                    alt="NGA Central MIS"
                    className="w-10 h-10 rounded-full"
                  />
                  <span className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                    NGA MIS
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
                {/* {onNavigateToAbout && (
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
                )} */}
              </div>
            )}

            {/* Desktop Auth & Theme Toggle */}
            <div className="hidden md:flex items-center space-x-4">
              <ThemeToggle />
              <a
                href={"https://nga.ac.rw/"}
                className="px-4 py-2 text-sm rounded-full transition-all bg-blue-500 text-white duration-200 font-medium flex items-center space-x-2 hover:bg-blue-600 dark:hover:bg-blue-700"
              >
                <span>Website</span>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>

              {showUserCard && user ? (
                /* User Card Dropdown */
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-xl bg-surface-light dark:bg-surface-dark/50 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                      {getUserInitials()}
                    </div>
                    <div className="text-left hidden lg:block">
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {getUserDisplayName()}
                      </p>
                      <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70">
                        {user.user?.email}
                      </p>
                    </div>
                    <svg
                      className={`w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark/70 transition-transform ${
                        isUserDropdownOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isUserDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-3xl shadow-lg border border-border-light dark:border-gray-700/30 py-2 animate-fade-in">
                      <div className="px-4 py-3 border-b border-border-light dark:border-gray-700/40">
                        <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                          {getUserDisplayName()}
                        </p>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
                          {user.user?.email}
                        </p>
                      </div>
                      <Link to={"/profile"} title="Profile">
                        <button
                          onClick={() => {
                            setIsUserDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark flex items-center space-x-2"
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
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          <span>Profile</span>
                        </button>
                      </Link>
                      <button
                        onClick={() => {
                          onChangePassword?.();
                          setIsUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark flex items-center space-x-2"
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
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span>Change Password</span>
                      </button>
                      <Link to={"/settings"}>
                        <button
                          onClick={() => {
                            setIsUserDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark flex items-center space-x-2"
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
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>Settings</span>
                        </button>
                      </Link>
                      <div className="border-t border-border-light dark:border-gray-700/40 mt-2 pt-2">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
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
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Sign In Button */
                showAuthButtons &&
                onNavigateToLogin &&
                !isActive("/login") && (
                  <button
                    onClick={onNavigateToLogin}
                    className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-500 rounded-full transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                  >
                    Sign In
                  </button>
                )
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center space-x-3">
              <ThemeToggle />
              <button
                onClick={onToggleSidebar || toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-lg text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200 focus:outline-none"
                aria-label="Toggle menu"
              >
                {onToggleSidebar ? (
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
                ) : isMobileMenuOpen ? (
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
            isMobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 pt-2 pb-4 space-y-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-border-light dark:border-gray-700">
            {/* User Card for Mobile - When logged in */}
            {showUserCard && user && (
              <div className="px-4 py-3 mb-2 bg-surface-light dark:bg-surface-dark rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                    {getUserInitials()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
                      {user.user?.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                        : "text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400"
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
                        : "text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400"
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
                        : "text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400"
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

            {/* Sign In / Sign Out for Mobile */}
            {showAuthButtons && user ? (
              <button
                onClick={() => {
                  handleLogout();
                  closeMobileMenu();
                }}
                className="w-full text-left px-4 py-3 mt-4 font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.02] flex items-center space-x-2 text-red-600 dark:text-red-400"
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Sign Out</span>
              </button>
            ) : (
              showAuthButtons &&
              onNavigateToLogin && (
                <button
                  onClick={() => {
                    onNavigateToLogin();
                    closeMobileMenu();
                  }}
                  className={`w-full text-left px-4 py-3 mt-4 font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.02] flex items-center space-x-2 ${
                    isActive("/login")
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400"
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
              )
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {!onToggleSidebar && isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}
    </>
  );
};

export default Navbar;
