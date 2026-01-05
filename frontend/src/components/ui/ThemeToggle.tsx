import React from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { Sun, Moon, Star } from "lucide-react";

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 overflow-hidden"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {/* Background gradient that animates */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-500 ${
          theme === "light"
            ? "bg-gradient-to-tr from-amber-100 to-orange-100 dark:from-transparent dark:to-transparent"
            : "bg-gradient-to-tr from-indigo-900 to-blue-900"
        }`}
      />

      {/* Sun icon */}
      <div
        className={`relative z-10 transition-all duration-500 ${
          theme === "light"
            ? "scale-100 rotate-0 opacity-100 translate-y-0"
            : "scale-0 rotate-90 opacity-0 translate-y-4"
        }`}
      >
        <Sun className="h-5 w-5 text-amber-600" />
      </div>

      {/* Moon icon */}
      <div
        className={`absolute z-10 transition-all duration-500 ${
          theme === "dark"
            ? "scale-100 rotate-0 opacity-100 translate-y-0"
            : "scale-0 -rotate-90 opacity-0 -translate-y-4"
        }`}
      >
        <Moon className="h-5 w-5 text-blue-300" />
      </div>

      {/* Stars for dark mode */}
      <div
        className={`absolute inset-0 transition-all duration-500 ${
          theme === "dark" ? "opacity-100" : "opacity-0"
        }`}
      >
        <Star className="absolute top-2 right-2 h-2 w-2 text-white/60 animate-pulse" />
        <Star className="absolute bottom-2 left-2 h-1.5 w-1.5 text-white/40 animate-pulse delay-75" />
        <Star className="absolute top-3 left-3 h-1 w-1 text-white/50 animate-pulse delay-150" />
      </div>

      {/* Sun rays for light mode */}
      <div
        className={`absolute inset-0 transition-all duration-500 ${
          theme === "light" ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-0.5 bg-amber-200/30">
          <div className="absolute top-1 left-1/2 -translate-x-1/2 h-1 w-1 bg-amber-300 rounded-full" />
        </div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-amber-200/30">
          <div className="absolute right-1 top-1/2 -translate-y-1/2 h-1 w-1 bg-amber-300 rounded-full" />
        </div>
      </div>
    </button>
  );
};

export default ThemeToggle;
