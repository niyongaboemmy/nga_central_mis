import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ChevronRight, Clock, Inbox, MessageCircle, RefreshCw, Search, Users2 } from "lucide-react";
import UserAvatar from "./UserAvatar";
import { useUser } from "../../contexts/UserContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { refreshMentorshipRole, useMentorshipRole } from "../../hooks/useMentorshipRole";
import { mentorshipApi, AssignedStudent } from "../../api/mentorship";
import { sortByAttention } from "../reporting/menteeAttention";

// One shared poll for the unread badge however many copies of this button are
// mounted (the navbar renders a desktop and a mobile one). Paused while the
// tab is hidden; a notification brings the person back anyway.
const POLL_MS = 60_000;
let mounted = 0;
let timer: number | null = null;
const startPolling = () => {
  if (mounted++ > 0) return;
  timer = window.setInterval(() => {
    if (document.visibilityState === "visible") refreshMentorshipRole();
  }, POLL_MS);
};
const stopPolling = () => {
  if (--mounted > 0 || timer === null) return;
  window.clearInterval(timer);
  timer = null;
};

/**
 * Top-bar "My mentees" button for anyone who mentors — teacher, staff or admin.
 * One click shows every mentee, who needs attention first (unread messages,
 * open follow-ups, no recent session), and opens any of them or the inbox from
 * wherever the mentor is, instead of going through Reporting.
 */
const MenteesQuickAccess: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { user } = useUser();
  const { selectedYearId } = useAcademicPeriod();
  const role = useMentorshipRole(user?.user?.user_id, selectedYearId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [mentees, setMentees] = useState<AssignedStudent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelId = useId();

  const isMentor = !!role?.is_mentor;
  const unread = role?.new_checkins ?? 0;

  useEffect(() => {
    if (!isMentor) return;
    startPolling();
    return stopPolling;
  }, [isMentor]);

  // Fresh list every time it opens: it is small, and stale badges mislead.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFailed(false);
    mentorshipApi
      .getAssignedStudents(selectedYearId ?? undefined)
      .then((res) => {
        const data = (res as any).data?.data ?? [];
        if (alive) setMentees(Array.isArray(data) ? data : []);
      })
      .catch(() => alive && setFailed(true));
    refreshMentorshipRole();
    const t = window.setTimeout(() => (searchRef.current ?? listRef.current?.querySelector("a"))?.focus(), 30);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open, selectedYearId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sortByAttention(mentees ?? []);
    return q
      ? list.filter((m) =>
          `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.registration_number ?? ""} ${m.class_group_name ?? ""}`.toLowerCase().includes(q),
        )
      : list;
  }, [mentees, query]);

  if (!isMentor) return null;

  // Arrow keys move through the list; Enter follows the focused link.
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (!links.length) return;
    e.preventDefault();
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === "ArrowDown" ? (i + 1) % links.length : i <= 0 ? links.length - 1 : i - 1;
    links[next].focus();
  };

  const close = () => setOpen(false);
  const label = `My mentees${unread ? ` — ${unread} unread message${unread === 1 ? "" : "s"}` : ""}`;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative p-2 rounded-xl text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark transition-all duration-200"
      >
        <Users2 className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="My mentees"
          onKeyDown={onListKey}
          className={`absolute mt-2 ${compact ? "-right-24" : "right-0"} w-[22rem] max-w-[calc(100vw-1.5rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-border-light dark:border-gray-700/30 overflow-hidden z-[100]`}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
              My mentees
              {mentees && <span className="ml-1.5 text-xs font-normal text-gray-400">{mentees.length}</span>}
            </p>
            <Link to="/my-mentees" onClick={close} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Open hub
            </Link>
          </div>

          {(mentees?.length ?? 0) > 5 && (
            <div className="relative px-3 pb-2">
              <Search className="absolute left-6 top-1/2 -translate-y-[60%] w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visible[0]) {
                    navigate(`/my-mentees/${visible[0].user_id}`);
                    close();
                  }
                }}
                placeholder="Find a mentee"
                aria-label="Find a mentee"
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              />
            </div>
          )}

          <div className="max-h-80 overflow-y-auto border-t border-border-light dark:border-gray-700/40">
            {failed ? (
              <p className="px-4 py-6 text-center text-xs text-gray-500">Couldn't load your mentees. Try again in a moment.</p>
            ) : mentees === null ? (
              <p className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-gray-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">{query ? `No mentee matches "${query}"` : "No mentees this year"}</p>
            ) : (
              <ul ref={listRef} className="py-1">
                {visible.map((m) => {
                  const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Unnamed";
                  return (
                    <li key={m.user_id}>
                      <Link
                        to={`/my-mentees/${m.user_id}`}
                        onClick={close}
                        className="group flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60 focus:bg-gray-50 dark:focus:bg-gray-800/60 focus:outline-none"
                      >
                        <UserAvatar decorative userId={m.user_id} name={name} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{name}</span>
                          <span className="block text-[11px] text-gray-400 truncate">
                            {m.class_group_name ?? "Not placed in a class"}
                            {m.last_session_date ? ` · met ${m.days_since_last_session}d ago` : " · never met"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {!!m.new_checkins && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white" title={`${m.new_checkins} unread message${m.new_checkins === 1 ? "" : "s"}`}>
                              <MessageCircle className="w-3 h-3" />
                              {m.new_checkins}
                            </span>
                          )}
                          {m.follow_up_required && (
                            <span title="Open follow-up" className="p-0.5 rounded-full text-red-600 dark:text-red-400">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span className="sr-only">Open follow-up</span>
                            </span>
                          )}
                          {m.overdue && (
                            <span title="Due a session" className="p-0.5 rounded-full text-orange-600 dark:text-orange-400">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="sr-only">Due a session</span>
                            </span>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-focus:opacity-100" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            to="/my-mentees/inbox"
            onClick={close}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-t border-border-light dark:border-gray-700/40 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60"
          >
            <Inbox className="w-4 h-4 text-blue-500" />
            Check-in inbox
            {unread > 0 ? (
              <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">{unread} unread</span>
            ) : (
              <span className="ml-auto text-[11px] text-gray-400">All read</span>
            )}
          </Link>
        </div>
      )}
    </div>
  );
};

export default MenteesQuickAccess;
