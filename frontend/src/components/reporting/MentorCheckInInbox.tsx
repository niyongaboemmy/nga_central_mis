import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, MessageCircle, RefreshCw } from "lucide-react";
import UserAvatar from "../ui/UserAvatar";
import { mentorshipApi, MenteeCheckInRecord, CheckInStatus } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import CheckInDetailModal from "./CheckInDetailModal";
import { categoryMeta, CHECKIN_STATUS_LABEL, formatDay, VALIDATION_LABEL } from "./checkInMeta";

// Notifications now tell the mentor when a check-in arrives; the poll only
// keeps an open inbox current while they are looking at it.
const POLL_INTERVAL_MS = 45_000;

type Filter = "ALL" | CheckInStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "Unread" },
  { value: "ACKNOWLEDGED", label: "Seen" },
  { value: "ADDRESSED", label: "Dealt with" },
];

interface MentorCheckInInboxProps {
  onUnreadCountChange?: (count: number) => void;
}

/**
 * Every check-in the signed-in mentor's mentees sent them. `?checkin=<id>`
 * (the link in a notification or on Home) opens that one straight away.
 */
const MentorCheckInInbox: React.FC<MentorCheckInInboxProps> = ({ onUnreadCountChange }) => {
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [checkIns, setCheckIns] = useState<MenteeCheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<MenteeCheckInRecord | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await mentorshipApi.getCheckInInbox();
        const data = (res as any).data?.data ?? (res as any).data ?? [];
        setCheckIns(Array.isArray(data) ? data : []);
      } catch {
        if (!silent) showToast("Failed to load check-ins", "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const unread = checkIns.filter((c) => c.status === "NEW").length;
  useEffect(() => {
    onUnreadCountChange?.(unread);
  }, [unread, onUnreadCountChange]);

  // Deep link: open the check-in named in the URL once the list is in.
  const linked = Number(params.get("checkin")) || null;
  useEffect(() => {
    if (!linked || loading) return;
    const hit = checkIns.find((c) => c.checkin_id === linked);
    if (hit) {
      setSelected(hit);
    } else {
      mentorshipApi
        .getCheckInDetail(linked)
        .then((res) => setSelected(((res as any).data?.data ?? null) as MenteeCheckInRecord | null))
        .catch(() => showToast("That check-in is not in your inbox", "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, loading]);

  const close = () => {
    setSelected(null);
    if (params.has("checkin")) {
      params.delete("checkin");
      setParams(params, { replace: true });
    }
  };

  const patch = (id: number, p: Partial<MenteeCheckInRecord>) => {
    setCheckIns((list) => list.map((c) => (c.checkin_id === id ? { ...c, ...p } : c)));
    setSelected((s) => (s && s.checkin_id === id ? { ...s, ...p } : s));
  };

  const visible = useMemo(
    () => (filter === "ALL" ? checkIns : checkIns.filter((c) => c.status === filter)),
    [checkIns, filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-500" />
          Mentee check-ins
          {unread > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">{unread} unread</span>
          )}
        </h3>
        <div role="tablist" aria-label="Filter check-ins" className="flex items-center gap-1 p-1 rounded-2xl bg-gray-100 dark:bg-gray-800/60">
          {FILTERS.map((f) => {
            const count = f.value === "ALL" ? checkIns.length : checkIns.filter((c) => c.status === f.value).length;
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${
                  active
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {f.label}
                <span className="ml-1 text-gray-400">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-gray-400 py-10">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading check-ins…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
          <Inbox className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            {checkIns.length === 0 ? "No check-ins yet" : `Nothing ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
          </p>
          <p className="text-xs text-gray-400 max-w-xs">
            {checkIns.length === 0
              ? "When a mentee sends you a message, concern or meeting request, it appears here and in your notifications."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => {
            const cat = categoryMeta(c.category);
            const isNew = c.status === "NEW";
            return (
              <li key={c.checkin_id}>
                <button
                  onClick={() => setSelected(c)}
                  className={`w-full text-left p-3 rounded-2xl border transition-colors flex gap-3 ${
                    isNew
                      ? "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      : "border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <UserAvatar decorative userId={c.student_id} name={c.student_name ?? "Student"} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm ${isNew ? "font-bold" : "font-semibold"} text-gray-900 dark:text-white truncate`}>
                        {c.student_name ?? "Student"}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cat.className}`}>{cat.label}</span>
                      {c.validation_status !== "PENDING" && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${VALIDATION_LABEL[c.validation_status].className}`}>
                          {VALIDATION_LABEL[c.validation_status].label}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{formatDay(c.submitted_at)}</span>
                    </div>
                    {c.title && <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate">{c.title}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{c.message}</p>
                    <p className="text-[11px] mt-1 flex items-center gap-1.5 text-gray-400">
                      {isNew && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden />}
                      {CHECKIN_STATUS_LABEL[c.status]}
                      {c.mentor_response ? " · You replied" : ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CheckInDetailModal checkin={selected} onClose={close} onChanged={patch} />
    </div>
  );
};

export default MentorCheckInInbox;
