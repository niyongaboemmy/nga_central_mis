import React, { useEffect, useState } from "react";
import type { Avatar } from "../../api/users";

/** Same gradients for the same person everywhere, so initials still read as "them". */
const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-sky-600",
  "from-fuchsia-500 to-violet-600",
];

export function initialsOf(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export interface UserAvatarProps {
  name: string;
  /** All renditions; the browser picks the right one for `size` and the screen density. */
  avatar?: Avatar | null;
  /** A single URL (e.g. `user.avatar_url`) when the full set is not at hand. */
  src?: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
  /** Adds a white ring, for avatars sitting on coloured or image backgrounds. */
  ring?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatar, src, size = 32, className = "", ring = false }) => {
  const url = avatar ? (size <= 64 ? avatar.sm : size <= 256 ? avatar.md : avatar.lg) : src || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const box = `relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${
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
          alt={name}
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

  return (
    <span
      role="img"
      aria-label={name}
      className={`${box} bg-gradient-to-br ${gradientFor(name || "?")} font-semibold text-white`}
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.4)) }}
    >
      {initialsOf(name)}
    </span>
  );
};

export default UserAvatar;
