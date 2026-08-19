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
  Search,
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

// Blue is the product's primary, so the header is always blue. Only the depth
// of the second stop varies per user — enough that the same person is
// recognisable at a glance across visits, without turning the panel into a
// different-coloured surface each time you open it.
const GRADIENTS = [
  "from-blue-600 to-indigo-700",
  "from-blue-500 to-blue-700",
  "from-sky-600 to-blue-700",
  "from-blue-600 to-blue-800",
  "from-indigo-600 to-blue-700",
  "from-sky-500 to-indigo-600",
];
const gradientFor = (id: number) => GRADIENTS[id % GRADIENTS.length];

const CopyableRow = ({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
  /** Makes the value actionable (mailto:/tel:) as well as copyable. */
  href?: string;
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
    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100/70 dark:border-blue-900/30">
      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-blue-500/80">
          {label}
        </p>
        {href ? (
          <a
            href={href}
            className="text-sm text-blue-700 dark:text-blue-300 hover:underline truncate block"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-gray-900 dark:text-white truncate">
            {value}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="p-2 rounded-lg text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 hover:bg-white dark:hover:bg-slate-800 transition-colors"
      >
        {copied ? (
          <Check className="w-4 h-4 text-blue-600" />
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
  <div className="flex-1 min-w-[6rem] rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 px-3 py-2.5 backdrop-blur">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      <span className="text-lg font-semibold text-blue-900 dark:text-blue-50 leading-none">
        {value}
      </span>
    </div>
    <p className="text-[11px] text-blue-700/70 dark:text-blue-300/70 mt-1">{label}</p>
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
    <section className="rounded-2xl border border-blue-100 dark:border-blue-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100/70 dark:hover:bg-blue-950/50 transition-colors"
      >
        <Icon className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-blue-900 dark:text-blue-50">
          {title}
        </span>
        {typeof count === "number" && (
          <span className="text-xs text-blue-500/70">({count})</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-blue-400 ml-auto transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50">
    {children}
  </span>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-blue-900/45 dark:text-blue-100/35 italic">{children}</p>
);

const Skeleton = () => (
  <div className="space-y-3 p-4">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="h-14 rounded-xl bg-blue-50 dark:bg-blue-950/40 animate-pulse"
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
  const [subjectFilter, setSubjectFilter] = React.useState("");

  const userId = summary?.user_id ?? null;

  React.useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setSubjectFilter("");

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
  // Teaching and enrolment are different relationships to a subject, so they
  // stay labelled rather than being concatenated into one anonymous list.
  const subjects = [
    ...(detail?.subjectsTaught ?? []).map((s) => ({
      ...s,
      class_groups: s.class_groups ?? [],
      relation: "Teaching" as const,
    })),
    ...(detail?.subjectsEnrolled ?? []).map((s) => ({
      ...s,
      class_groups: s.class_groups ?? [],
      relation: "Enrolled" as const,
    })),
  ];
  const placementCount = classGroups.length + assignedGrades.length;

  const needle = subjectFilter.trim().toLowerCase();
  const visibleSubjects = needle
    ? subjects.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.code ?? "").toLowerCase().includes(needle) ||
          s.class_groups.some((cg) => cg.name.toLowerCase().includes(needle)),
      )
    : subjects;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-blue-950/50 backdrop-blur-sm flex justify-end"
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
          className="w-full sm:max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
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
          <div className="flex flex-wrap gap-2 px-5 -mt-3 relative z-10">
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
                <UserIcon className="w-8 h-8 text-blue-200 dark:text-blue-900 mx-auto mb-2" />
                <p className="text-sm text-blue-900/60 dark:text-blue-100/50">
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
                    href={
                      (detail?.user?.email ?? summary.email)
                        ? `mailto:${detail?.user?.email ?? summary.email}`
                        : undefined
                    }
                  />
                  <CopyableRow
                    icon={Phone}
                    label="Phone"
                    value={detail?.user?.phone_number ?? summary.phone_number}
                    href={
                      (detail?.user?.phone_number ?? summary.phone_number)
                        ? `tel:${detail?.user?.phone_number ?? summary.phone_number}`
                        : undefined
                    }
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
                          className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100/70 dark:border-blue-900/30"
                        >
                          <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">
                              {cg.name}
                            </p>
                            <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate">
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
                          className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100/70 dark:border-blue-900/30"
                        >
                          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">
                              Class teacher · {g.class_group_name ?? g.name}
                            </p>
                            <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate">
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
                        className="rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100/70 dark:border-blue-900/30 p-3"
                      >
                        <summary className="cursor-pointer text-sm text-gray-900 dark:text-white flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-600" />
                          {role.name}
                          {role.permissions?.length ? (
                            <span className="text-xs text-blue-500/70 ml-auto">
                              {role.permissions.length} permissions
                            </span>
                          ) : null}
                        </summary>
                        {role.description && (
                          <p className="text-xs text-blue-900/50 dark:text-blue-100/40 mt-2">
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
                    <div className="space-y-2">
                      {/* A teacher can hold 20+ subjects; a filter beats
                          scrolling a wall of chips. */}
                      {subjects.length > 6 && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
                          <input
                            type="text"
                            value={subjectFilter}
                            onChange={(e) => setSubjectFilter(e.target.value)}
                            placeholder="Filter subjects..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-slate-800 text-xs dark:text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                      {visibleSubjects.length === 0 ? (
                        <Empty>No subject matches that filter.</Empty>
                      ) : (
                        visibleSubjects.map((s, i) => (
                          <div
                            key={`${s.relation}-${s.subject_id}-${i}`}
                            className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100/70 dark:border-blue-900/30"
                          >
                            <div className="flex items-start gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-900 dark:text-white break-words">
                                  {s.name}
                                </p>
                                {s.code && (
                                  <p className="text-[11px] text-blue-900/50 dark:text-blue-100/40">
                                    {s.code}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-600 text-white flex-shrink-0">
                                {s.relation}
                              </span>
                            </div>
                            {/* Which section they take it with — a subject name
                                alone does not say that. */}
                            {s.class_groups.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                                {s.class_groups.map((cg) => (
                                  <span
                                    key={cg.class_group_id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50"
                                  >
                                    <Layers className="w-2.5 h-2.5" />
                                    {cg.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-blue-100 dark:border-blue-950/60">
            <p className="text-[11px] text-blue-900/40 dark:text-blue-100/30 text-center">
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
