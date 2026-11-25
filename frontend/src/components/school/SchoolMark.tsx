import React, { useState } from "react";

/** A school's logo, or its initials on a blue tile when it has none (or it fails to load). */
const SIZES = { sm: "h-6 w-6 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" } as const;

/** Initials from letters only: "(Kigali)" or "&" never become an initial. */
const initialsOf = (name: string) =>
  name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const SchoolMark: React.FC<{ name: string; logoUrl?: string | null; size?: keyof typeof SIZES; className?: string }> = ({ name, logoUrl, size = "md", className = "" }) => {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return <img src={logoUrl} alt="" onError={() => setBroken(true)} className={`${SIZES[size]} shrink-0 rounded-lg object-contain bg-white ${className}`} />;
  }
  return (
    <span aria-hidden="true" className={`${SIZES[size]} shrink-0 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 font-bold flex items-center justify-center ${className}`}>
      {initialsOf(name)}
    </span>
  );
};

export default SchoolMark;
