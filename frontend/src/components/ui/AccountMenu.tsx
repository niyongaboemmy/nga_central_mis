import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, KeyRound, LockKeyhole, LogOut, Moon, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import UserAvatar from "./UserAvatar";
import SchoolSwitcher, { roleLabel } from "../school/SchoolSwitcher";

/**
 * The avatar menu in the top bar: who you are, your school (and the switch between
 * schools), your account pages, sign out. Flat and blue like the rest of the MIS: one
 * hairline border, tinted icon tiles, no shadow. Esc closes it.
 */
interface Props {
  name: string;
  email?: string | null;
  avatar?: unknown;
  avatarUrl?: string | null;
  roles?: string[];
  canMyAi?: boolean;
  onClose: () => void;
  onChangePassword?: () => void;
  onSignOut: () => void;
  /** show a dark-mode switch (the phone top bar has no room for the theme button) */
  showTheme?: boolean;
}

const itemCls =
  "group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-gray-800/70";

const Tile: React.FC<{ icon: LucideIcon; danger?: boolean }> = ({ icon: Icon, danger }) => (
  <span
    className={
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors " +
      (danger
        ? "bg-red-50 text-red-600 group-hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:group-hover:bg-red-500/20"
        : "bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-gray-800/70 dark:text-gray-300 dark:group-hover:bg-blue-500/15 dark:group-hover:text-blue-400")
    }
    aria-hidden="true"
  >
    <Icon className="h-4 w-4" />
  </span>
);

const Item: React.FC<{ icon: LucideIcon; label: string; to?: string; onClick: () => void }> = ({ icon, label, to, onClick }) => {
  const body = (
    <>
      <Tile icon={icon} />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" aria-hidden="true" />
    </>
  );
  return to ? (
    <Link to={to} onClick={onClick} className={itemCls} role="menuitem">
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={itemCls} role="menuitem">
      {body}
    </button>
  );
};

/** Dark mode as a switch row. */
const ThemeRow: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={dark} onClick={toggleTheme} className={itemCls}>
      <Tile icon={Moon} />
      <span className="flex-1">Dark mode</span>
      <span className={"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors " + (dark ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700")} aria-hidden="true">
        <span className={"h-4 w-4 rounded-full bg-white transition-transform " + (dark ? "translate-x-4" : "")} />
      </span>
    </button>
  );
};

const AccountMenu: React.FC<Props> = ({ name, email, avatar, avatarUrl, roles = [], canMyAi, onClose, onChangePassword, onSignOut, showTheme }) => {
  const reduced = useReducedMotion();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const role = roles.length ? roleLabel(roles[0]) : null;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      style={{ transformOrigin: "top right" }}
      className={
        // phones: a full-width sheet under the top bar that scrolls; from sm: a dropdown under the avatar
        "fixed inset-x-2 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-3xl border border-gray-200 bg-white dark:border-gray-700/30 dark:bg-gray-900 " +
        "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[calc(100dvh-6rem)] sm:w-80"
      }
      aria-label="Account"
    >
      {/* who */}
      <div className="flex items-center gap-3 p-4">
        <span className="rounded-full ring-2 ring-blue-100 ring-offset-2 ring-offset-white dark:ring-blue-500/30 dark:ring-offset-gray-900">
          <UserAvatar name={name} avatar={avatar as any} src={avatarUrl ?? undefined} size={44} fallback="person" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={name}>
            {name}
          </p>
          {email && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={email}>
              {email}
            </p>
          )}
          {role && (
            <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {role}
              {roles.length > 1 && <span className="ml-1 font-normal opacity-80">+{roles.length - 1}</span>}
            </span>
          )}
        </div>
      </div>

      {/* school (only for people with two or more schools) */}
      <div className="border-t border-gray-100 py-1 empty:hidden dark:border-gray-700/30">
        <SchoolSwitcher variant="menu" onPicked={onClose} />
      </div>

      {/* account pages */}
      <nav role="menu" aria-label="Account" className="border-t border-gray-100 p-2 dark:border-gray-700/30">
        <Item icon={UserRound} label="Profile" to="/profile" onClick={onClose} />
        {onChangePassword && (
          <Item
            icon={LockKeyhole}
            label="Change password"
            onClick={() => {
              onChangePassword();
              onClose();
            }}
          />
        )}
        {canMyAi && <Item icon={KeyRound} label="My AI" to="/my-ai" onClick={onClose} />}
        <Item icon={Settings} label="Settings" to="/settings" onClick={onClose} />
        {showTheme && <ThemeRow />}
      </nav>

      <div className="border-t border-gray-100 p-2 dark:border-gray-700/30">
        <button type="button" onClick={onSignOut} className={itemCls + " text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"}>
          <Tile icon={LogOut} danger />
          <span className="flex-1">Sign out</span>
        </button>
      </div>
    </motion.div>
  );
};

/**
 * The avatar button with its menu, self-contained (own open state, outside click, Esc).
 * Used in the phone top bar, where the hamburger opens the sidebar and the account menu
 * was otherwise out of reach.
 */
export const AccountMenuButton: React.FC<Omit<Props, "onClose">> = (props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={props.name}
        className={
          "flex h-9 w-9 items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
          (open ? "bg-blue-50 ring-2 ring-blue-500/60 dark:bg-blue-500/15" : "hover:bg-gray-100 dark:hover:bg-gray-700/40")
        }
      >
        <UserAvatar name={props.name} avatar={props.avatar as any} src={props.avatarUrl ?? undefined} size={30} fallback="person" />
      </button>
      {open && <AccountMenu {...props} onClose={() => setOpen(false)} />}
    </div>
  );
};

export default AccountMenu;
