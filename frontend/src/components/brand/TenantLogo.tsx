import { useEffect, useState } from "react";
import NGA_LOGO from "../../assets/logo.png";

/**
 * A school's logo with a fallback that never shows a broken image: when there is no
 * URL, or the image fails to load (file missing, offline), NGA shows its built-in
 * shield and any other school its initial.
 */
export default function TenantLogo({
  src,
  name,
  isPrimary,
  className = "w-9 h-9",
  rounded = "rounded-full",
  fit = "object-contain",
}: {
  src: string | null | undefined;
  name: string;
  isPrimary: boolean;
  className?: string;
  rounded?: string;
  fit?: "object-contain" | "object-cover";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = src && !failed ? src : isPrimary ? NGA_LOGO : null;
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => (url === src ? setFailed(true) : undefined)}
        className={`${className} ${rounded} ${fit} shrink-0`}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      role="img"
      aria-label={name}
      className={`${className} ${rounded} shrink-0 bg-blue-600 text-white font-bold flex items-center justify-center text-[0.8em] select-none`}
    >
      {initials}
    </span>
  );
}
