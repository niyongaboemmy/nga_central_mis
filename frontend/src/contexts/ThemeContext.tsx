import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "./UserContext";
import { updateUserTheme } from "../api/users";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const [theme, setTheme] = useState<Theme>(() => {
    // Initial check: localStorage -> System Preference -> Default light
    const savedTheme = localStorage.getItem("theme") as Theme;
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  // Sync with user preference when user data loads
  useEffect(() => {
    // If logged in and user has a preferred theme, it takes priority
    if (isAuthenticated && user?.user.preferred_theme) {
      if (user.user.preferred_theme !== theme) {
        setTheme(user.user.preferred_theme);
        localStorage.setItem("theme", user.user.preferred_theme);
      }
    }
  }, [user?.user.preferred_theme, isAuthenticated]);

  // Apply theme to document root whenever theme state changes
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    // Always keep localStorage in sync with our current theme state
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = async () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    // Local storage is updated via the useEffect above

    // Persist to backend if logged in
    if (isAuthenticated) {
      try {
        await updateUserTheme(newTheme);
        // Note: We don't necessarily need to refresh user context here
        // as our local state 'theme' is already correct.
      } catch (error) {
        console.error("Failed to persist theme preference to database:", error);
      }
    }
  };

  const value = {
    theme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
