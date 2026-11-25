import React, { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import type { Avatar } from "../../api/users";
import { useUserAvatar } from "../../lib/avatarDirectory";

/**
 * Same shade for the same person everywhere, so initials still read as "them".
 * Blue only and flat (NGA palette): five steps of the one system blue.
 */
const SHADES = ["bg-blue-500", "bg-blue-600", "bg-blue-700", "bg-blue-800", "bg-blue-900"];

/**
 * First + last initials from letters only. "Niyongabo Emmanuel (Eric)" is "NE", not "N(":
 * bracketed asides are dropped and punctuation never becomes an initial.
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name || "")
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

export function shadeFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return SHADES[Math.abs(hash) % SHADES.length];
}

export interface UserAvatarProps {
  name: string;
  /** All renditions; the browser picks the right one for `size` and the screen density. */
  avatar?: Avatar | null;
  /** A single URL (e.g. `user.avatar_url`) when the full set is not at hand. */
  src?: string | null;
  /**
   * The person's MIS user id: their photo is looked up (batched, cached) when neither
   * `avatar` nor `src` is given -- how lists show faces without carrying photo links.
   */
  userId?: number | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
  /** Adds a white ring, for avatars sitting on coloured or image backgrounds. */
  ring?: boolean;
  /** People are round; "rounded" keeps the square-ish look some tables use. */
  shape?: "circle" | "rounded";
  /** Hidden from screen readers -- for avatars beside a visible name, so it isn't read twice. */
  decorative?: boolean;
  /**
   * Without a photo: "initials" (lists, where telling people apart matters) or
   * "person", a person icon (one person's own view: profile, account menu, top bar).
   */
  fallback?: "initials" | "person";
}

const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatar, src, userId, size = 32, className = "", ring = false, shape = "circle", decorative = false, fallback = "initials" }) => {
  const looked = useUserAvatar(avatar || src ? null : userId);
  avatar = avatar ?? looked ?? null;
  const url = avatar ? (size <= 64 ? avatar.sm : size <= 256 ? avatar.md : avatar.lg) : src || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  // align-middle: an inline box on the text baseline leaves a descender gap under it.
  const box = `relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden align-middle ${
    shape === "rounded" ? "rounded-xl" : "rounded-full"
  } ${
    ring ? "ring-2 ring-white dark:ring-gray-900" : ""
  } ${className}`;
  const style = { width: size, height: size };

  if (url && !failed) {
    return (
      <span className={`${box} bg-gray-100 dark:bg-gray-800`} style={style}>
        <img
          src={url}
          srcSet={avatar ? `${avatar.sm} 64w, ${avatar.md} 256w, ${avatar.lg} 512w` : undefined}
          sizes={avatar ? `${size}px` : undefined}
          alt={decorative ? "" : name}
          aria-hidden={decorative || undefined}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  if (fallback === "person") {
    return (
      <span
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
        data-fallback="person"
        className={`${box} bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300`}
        style={style}
      >
        <UserRound style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} strokeWidth={1.75} aria-hidden />
      </span>
    );
  }

  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={`${box} ${shadeFor(name || "?")} font-semibold text-white`}
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.4)) }}
    >
      {initialsOf(name)}
    </span>
  );
};

export default UserAvatar;
