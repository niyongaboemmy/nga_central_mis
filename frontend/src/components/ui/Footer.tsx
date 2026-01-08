import React from "react";

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = "" }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`bg-white/80 dark:bg-gray-800/50 backdrop-blur-md border-t border-border-light/50 dark:border-gray-800/50 py-4 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          {/* Copyright */}
          <div className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            © {currentYear} NGA Central MIS. All rights reserved.
          </div>

          {/* Quick Links */}
          <div className="flex items-center space-x-6">
            <a
              href="#"
              className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
            >
              Terms of Service
            </a>
            <a
              href="#"
              className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
            >
              Help
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
