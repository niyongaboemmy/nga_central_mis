/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Custom colors for better dark mode support
        background: {
          light: "#ffffff",
          dark: "#0f172a",
        },
        surface: {
          light: "#f8fafc",
          dark: "#1e293b",
        },
        card: {
          light: "#ffffff",
          dark: "#334155",
        },
        text: {
          primary: {
            light: "#1e293b",
            dark: "#f1f5f9",
          },
          secondary: {
            light: "#64748b",
            dark: "#94a3b8",
          },
        },
        border: {
          light: "#e2e8f0",
          dark: "#475569",
        },
        // E-learning design tokens (ELEARNING_MODULE_UX_IMPLEMENTATION_PLAN.md §2.1).
        // brand = the existing blue family; accent = the warm "joy" colour reserved for
        // celebrations, the streak flame and the mascot — never for everyday chrome.
        brand: { 50: "#eef4ff", 100: "#d9e6ff", 200: "#b6ccff", 500: "#3b6cff", 600: "#2f56d9", 700: "#2444ad" },
        accent: { 100: "#ffe9d6", 500: "#ff8a3d", 600: "#e5731f" },
        success: { 100: "#dcfce7", 500: "#22c55e", 700: "#15803d" },
        warning: { 100: "#fef3c7", 500: "#f59e0b", 700: "#b45309" },
        danger: { 100: "#fee2e2", 500: "#ef4444", 700: "#b91c1c" },
      },
      borderRadius: { pill: "9999px" },
      boxShadow: {
        soft: "0 1px 2px rgb(15 23 42 / .04), 0 8px 24px -12px rgb(15 23 42 / .12)",
        float: "0 12px 40px -12px rgb(15 23 42 / .25)",
        glow: "0 0 0 4px rgb(59 108 255 / .18)",
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
      transitionTimingFunction: { spring: "cubic-bezier(.2,.8,.2,1)" },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "grow-width": "growWidth 5s linear forwards",
        shimmer: "shimmer 1.6s infinite",
      },
      fontFamily: {
        sans: [
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        // Atkinson Hyperlegible — drawn for low-vision readers, so b/d, p/q,
        // I/l/1 and O/0 are all distinct. The reader's default body face.
        reading: [
          '"Atkinson Hyperlegible"',
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        growWidth: {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
        // Skeleton-loader highlight sweep (see CalendarGridSkeleton)
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },

    },
  },
  plugins: [require("@tailwindcss/typography")],
};
