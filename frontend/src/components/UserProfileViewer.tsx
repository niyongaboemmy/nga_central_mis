import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Phone,
  User as UserIcon,
  Copy,
  Check,
  Shield,
  GraduationCap,
  BookOpen,
  Layers,
  Cake,
  MapPin,
  ChevronDown,
  Hash,
  Building2,
} from "lucide-react";
import {
  getScopedUserDetail,
  ScopedUserDetail,
  ScopedUser,
} from "../api/users";
import { StatusBadge, UserTypeBadge } from "./UserProfileTabs/TabShared";
import { useToast } from "../contexts/ToastContext";

/**
 * Strictly read-only profile.
 *
 * Deliberately not `UserProfileModal`, which carries role assignment,
 * enable/disable, grade assignment and inline profile editing — a class teacher
 * browsing their own class list must be able to look someone up without any of
 * that being one mis-click away. Nothing here imports a mutating API.
 */

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const initialsOf = (first?: string | null, last?: string | null, fallback = "?") => {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  const letters = `${a.charAt(0)}${b.charAt(0)}`.trim();
  return (letters || fallback.charAt(0)).toUpperCase();
};

// A stable hue per user so the same person always gets the same avatar colour —
// recognisable at a glance when scanning a class list.
const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-fuchsia-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];
const gradientFor = (id: number) => GRADIENTS[id % GRADIENTS.length];

const CopyableRow = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) => {
  const [copied, setCopied] = React.useState(false);
  const { showToast } = useToast();

  if (!value) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Could not copy to clipboard", "error");
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60">
      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p className="text-sm text-gray-900 dark:text-white truncate">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-colors"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
};

const StatTile = ({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) => (
  <div className="flex-1 rounded-xl bg-white/70 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/50 px-3 py-2.5">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-blue-500" />
      <span className="text-lg font-semibold text-gray-900 dark:text-white leading-none">
        {value}
      </span>
    </div>
    <p className="text-[11px] text-gray-400 mt-1">{label}</p>
  </div>
);

const Section = ({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-gray-100 dark:border-slate-700/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50/80 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </span>
        {typeof count === "number" && (
          <span className="text-xs text-gray-400">({count})</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="p-4 space-y-2">{children}</div>}
    </section>
  );
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300">
    {children}
  </span>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-gray-400 italic">{children}</p>
);

const Skeleton = () => (
  <div className="space-y-3 p-4">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="h-14 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse"
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

interface UserProfileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The row that was clicked — renders the header instantly while detail loads. */
  summary: ScopedUser | null;
  academicYearId?: number | null;
}

const UserProfileViewer: React.FC<UserProfileViewerProps> = ({
  isOpen,
  onClose,
  summary,
  academicYearId,
}) => {
  const { showToast } = useToast();
  const [detail, setDetail] = React.useState<ScopedUserDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const userId = summary?.user_id ?? null;

  React.useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    getScopedUserDetail(userId, academicYearId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message =
          err?.response?.status === 403
            ? "This user is outside your assigned grades."
            : err?.message || "Failed to load profile";
        setError(message);
        showToast(message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, academicYearId]);

  // Escape closes, matching the rest of the app's modals.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !summary) return null;

  const profile = detail?.profile;
  const firstName = profile?.first_name ?? summary.first_name;
  const lastName = profile?.last_name ?? summary.last_name;
  const fullName =
    `${firstName ?? ""} ${lastName ?? ""}`.trim() || summary.username;
  const status = detail?.user?.status ?? summary.status;
  const userType = profile?.user_type ?? summary.user_type ?? undefined;
  const roles = detail?.roles ?? summary.roles ?? [];
  const classGroups = detail?.classGroups ?? [];
  const assignedGrades = detail?.assignedGrades ?? [];
  const subjects = [
    ...(detail?.subjectsTaught ?? []),
    ...(detail?.subjectsEnrolled ?? []),
  ];
  const placementCount = classGroups.length + assignedGrades.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={`Profile of ${fullName}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
        >
          {/* Identity header */}
          <header
            className={`relative bg-gradient-to-br ${gradientFor(
              summary.user_id,
            )} px-5 pt-5 pb-6 text-white`}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4 pr-10">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold flex-shrink-0">
                {initialsOf(firstName, lastName, summary.username)}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-tight truncate">
                  {fullName}
                </h2>
                <p className="text-sm text-white/80 truncate">
                  @{summary.username}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              <StatusBadge status={status} />
              {userType && <UserTypeBadge type={userType} />}
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/70">
                <Hash className="w-3 h-3" />
                {summary.user_id}
              </span>
            </div>
          </header>

          {/* Stat strip */}
          <div className="flex gap-2 px-5 -mt-3 relative z-10">
            <StatTile icon={Shield} value={roles.length} label="Roles" />
            <StatTile
              icon={GraduationCap}
              value={placementCount}
              label="Placements"
            />
            <StatTile icon={BookOpen} value={subjects.length} label="Subjects" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {error ? (
              <div className="text-center py-10">
                <UserIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {error}
                </p>
              </div>
            ) : loading && !detail ? (
              <Skeleton />
            ) : (
              <>
                <Section title="Contact" icon={Mail}>
                  <CopyableRow
                    icon={Mail}
                    label="Email"
                    value={detail?.user?.email ?? summary.email}
                  />
                  <CopyableRow
                    icon={Phone}
                    label="Phone"
                    value={detail?.user?.phone_number ?? summary.phone_number}
                  />
                  {!(detail?.user?.email ?? summary.email) &&
                    !(detail?.user?.phone_number ?? summary.phone_number) && (
                      <Empty>No contact details on file.</Empty>
                    )}
                </Section>

                <Section title="Personal" icon={UserIcon} defaultOpen={false}>
                  <CopyableRow
                    icon={UserIcon}
                    label="Gender"
                    value={profile?.gender ?? summary.gender}
                  />
                  <CopyableRow
                    icon={Cake}
                    label="Date of birth"
                    value={
                      profile?.date_of_birth
                        ? new Date(profile.date_of_birth).toLocaleDateString()
                        : null
                    }
                  />
                  <CopyableRow
                    icon={MapPin}
                    label="Address"
                    value={profile?.address}
                  />
                  {!profile?.gender &&
                    !profile?.date_of_birth &&
                    !profile?.address && (
                      <Empty>No personal details on file.</Empty>
                    )}
                </Section>

                <Section
                  title="Academic placement"
                  icon={Layers}
                  count={placementCount}
                >
                  {classGroups.length === 0 && assignedGrades.length === 0 ? (
                    <Empty>Not placed in any class group this year.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {classGroups.map((cg) => (
                        <div
                          key={`cg-${cg.class_group_id}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60"
                        >
                          <GraduationCap className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">
                              {cg.name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {[cg.grade_name, cg.program_name]
                                .filter(Boolean)
                                .join(" · ") || "Student"}
                            </p>
                          </div>
                        </div>
                      ))}
                      {assignedGrades.map((g) => (
                        <div
                          key={`ug-${g.grade_id}-${g.class_group_id}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60"
                        >
                          <Building2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">
                              Class teacher · {g.class_group_name ?? g.name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {[g.name, g.program_name]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Roles" icon={Shield} count={roles.length}>
                  {roles.length === 0 ? (
                    <Empty>No roles assigned.</Empty>
                  ) : (
                    roles.map((role: any) => (
                      <details
                        key={role.role_id}
                        className="rounded-xl bg-gray-50 dark:bg-slate-800/60 p-3"
                      >
                        <summary className="cursor-pointer text-sm text-gray-900 dark:text-white flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-500" />
                          {role.name}
                          {role.permissions?.length ? (
                            <span className="text-xs text-gray-400 ml-auto">
                              {role.permissions.length} permissions
                            </span>
                          ) : null}
                        </summary>
                        {role.description && (
                          <p className="text-xs text-gray-400 mt-2">
                            {role.description}
                          </p>
                        )}
                        {role.permissions?.length ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {role.permissions.map((p: any) => (
                              <Chip key={p.perm_id ?? p.name}>{p.name}</Chip>
                            ))}
                          </div>
                        ) : null}
                      </details>
                    ))
                  )}
                </Section>

                <Section
                  title="Subjects"
                  icon={BookOpen}
                  count={subjects.length}
                  defaultOpen={false}
                >
                  {subjects.length === 0 ? (
                    <Empty>No subjects this academic year.</Empty>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {subjects.map((s: any, i: number) => (
                        <Chip key={`${s.subject_id}-${i}`}>
                          {s.code ? `${s.code} · ` : ""}
                          {s.name}
                        </Chip>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-gray-100 dark:border-slate-700/50">
            <p className="text-[11px] text-gray-400 text-center">
              Read-only view — profile changes are made in User Management.
            </p>
          </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default UserProfileViewer;
