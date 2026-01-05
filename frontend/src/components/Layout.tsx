import React from "react";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <header className="bg-card-light dark:bg-card-dark shadow border-b border-border-light dark:border-border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
              {title || "NGA Central MIS"}
            </h1>
            <nav className="space-x-4">
              {/* Navigation items will be added here */}
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
