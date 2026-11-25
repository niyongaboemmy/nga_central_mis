import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AtSign,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Hash,
  KeyRound,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { updateProfile, UserProfile } from "../api/users";
import { Permissions } from "../constants/permissions";
import { surface, accent, sectionTitle } from "../design/surfaces";
import { useMotion } from "../design/motion";
import { requestAppsDialog } from "./apps/openAppsDialog";
import AvatarControl from "./profile/AvatarControl";
import ProfileCover from "./profile/ProfileCover";
import UserAvatar from "./ui/UserAvatar";
import ChangePasswordModal from "./ChangePasswordModal";

type FormState = {
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  address: string;
};

const fromProfile = (p: UserProfile | null | undefined): FormState => ({
  first_name: p?.first_name ?? "",
  last_name: p?.last_name ?? "",
  gender: p?.gender ?? "",
  // DATE columns arrive as an ISO timestamp; <input type="date"> wants YYYY-MM-DD.
  date_of_birth: (p?.date_of_birth ?? "").slice(0, 10),
  address: p?.address ?? "",
});

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  INACTIVE: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300",
  SUSPENDED: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "", label: "Prefer not to say" },
];

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
/** SUPER_ADMIN -> Super admin */
const humanize = (s: string) => titleCase(s.replace(/_/g, " "));

const ageFrom = (iso: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};

const labelCls = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
const inputWithIcon = `${surface.input} pl-10`;

const Card: React.FC<{
  title?: string;
  description?: string;
  action?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, description, action, id, className = "", children }) => (
  <section id={id} className={`${surface.card} ${className}`}>
    {title && (
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className={sectionTitle}>{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {action}
      </header>
    )}
    <div className="px-5 py-5 sm:px-6">{children}</div>
  </section>
);

/** An account fact the office manages: label above value so long emails never truncate. */
const Fact: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  mono?: boolean;
  onCopy?: (value: string, label: string) => void;
}> = ({ icon, label, value, mono, onCopy }) => (
  <div className={`group flex items-center gap-3 px-2 py-2.5 ${surface.insetHover}`}>
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300">
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`break-all text-sm text-gray-900 dark:text-gray-100 ${mono ? "font-mono" : "font-medium"}`}>
        {value || <span className="font-normal text-gray-400 dark:text-gray-500">Not set</span>}
      </dd>
    </div>
    {value && onCopy && (
      <button
        type="button"
        onClick={() => onCopy(value, label)}
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
        className={`shrink-0 rounded-lg p-1.5 text-gray-400 opacity-100 transition hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 ${accent.focus}`}
      >
        <Copy className="h-4 w-4" aria-hidden />
      </button>
    )}
  </div>
);

const ProfileSkeleton: React.FC = () => (
  <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-6 md:px-6" aria-busy="true" aria-label="Loading your profile">
    <div className={`${surface.card} overflow-hidden`}>
      <div className={`${surface.skeleton} h-36 rounded-none md:h-52`} />
      <div className="flex items-end gap-4 px-6 pb-6">
        <div className={`${surface.skeleton} -mt-12 h-28 w-28 rounded-full`} />
        <div className="flex-1 space-y-2 pb-2">
          <div className={`${surface.skeleton} h-6 w-56`} />
          <div className={`${surface.skeleton} h-4 w-40`} />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className={`${surface.skeleton} h-96 rounded-2xl`} />
      <div className="space-y-6">
        <div className={`${surface.skeleton} h-40 rounded-2xl`} />
        <div className={`${surface.skeleton} h-64 rounded-2xl`} />
      </div>
    </div>
  </div>
);

/**
 * Your profile: who you are across every NGA app (name, picture, cover) and the
 * account details the school office manages. A header card that reads like your
 * profile everywhere else, a profile-strength meter that jumps to whatever is
 * missing, the editable details with a sticky save bar, and the read-only account
 * facts, security and personal settings beside them.
 */
const Profile: React.FC = () => {
  const { user, refreshUser } = useUser();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const m = useMotion();
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useMemo(() => fromProfile(user?.profile), [user?.profile]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  // Leaving with unsaved edits asks first; Cmd/Ctrl+S saves.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const saveKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", saveKey);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("keydown", saveKey);
    };
  }, [dirty]);

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        showToast(`${label} copied`, "success");
      } catch {
        showToast(`Could not copy the ${label.toLowerCase()}`, "error");
      }
    },
    [showToast],
  );

  if (!user) return <ProfileSkeleton />;

  const { user: account, profile } = user;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || account.username;
  const userType = profile?.user_type;
  // Roles that only repeat the account type ("STUDENT" on a student) add nothing.
  const roles = (user.roles ?? []).map((r) => r.name).filter((n) => n.toUpperCase() !== String(userType ?? "").toUpperCase());
  const permNames = new Set((user.roles ?? []).flatMap((r) => r.permissions?.map((p) => p.name) ?? []));
  const canUseMyAI = [Permissions.AI_PERSONAL_PROVIDERS, Permissions.AI_PERSONAL_PROVIDERS_STUDENT].some(
    (p) => permNames.has(p) || user.permissions?.includes(p),
  );
  const memberSince = account.created_at
    ? new Date(account.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const age = ageFrom(form.date_of_birth);

  // Profile strength counts what you can fill in yourself, from what is saved.
  const focusField = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => (el as HTMLElement | null)?.focus({ preventScroll: true }), 250);
  };
  const steps = [
    { key: "name", label: "Your name", cta: "Add your name", done: !!(initial.first_name && initial.last_name), go: () => focusField("pf-first") },
    { key: "photo", label: "Profile photo", cta: "Add a profile photo", done: !!user.avatar, go: () => focusField("profile-photo-card") },
    { key: "cover", label: "Cover image", cta: "Add a cover image", done: !!user.cover, go: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { key: "gender", label: "Gender", cta: "Set your gender", done: !!initial.gender, go: () => focusField("pf-gender-MALE") },
    { key: "dob", label: "Date of birth", cta: "Add your date of birth", done: !!initial.date_of_birth, go: () => focusField("pf-dob") },
    { key: "address", label: "Address", cta: "Add your address", done: !!initial.address, go: () => focusField("pf-address") },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const strength = Math.round((doneCount / steps.length) * 100);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      showToast("First and last name are required", "error");
      return;
    }
    setSaving(true);
    try {
      const changes: Partial<UserProfile> = {};
      (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
        if (form[k] !== initial[k]) (changes as any)[k] = form[k].trim();
      });
      await updateProfile(changes);
      await refreshUser();
      showToast("Profile updated", "success");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2200);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const settings = [
    {
      key: "reminders",
      icon: <BellRing className="h-5 w-5" aria-hidden />,
      title: "Reminders",
      hint: "Push, Telegram, calendar and email",
      to: "/reminders",
    },
    canUseMyAI && {
      key: "my-ai",
      icon: <Sparkles className="h-5 w-5" aria-hidden />,
      title: "My AI",
      hint: "Your own AI keys and models",
      to: "/my-ai",
    },
    {
      key: "apps",
      icon: <LayoutGrid className="h-5 w-5" aria-hidden />,
      title: "Get the apps",
      hint: "Install every NGA app on this device",
      onClick: () => {
        if (!requestAppsDialog()) navigate("/apps");
      },
    },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; title: string; hint: string; to?: string; onClick?: () => void }[];

  const tileCls = `group flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${accent.focus}`;
  const tileIcon =
    "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-500/15 dark:text-blue-300";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-6 md:px-6">
      {/* Identity: how you appear in every NGA app */}
      <motion.section {...m("reveal")} className={`${surface.card} overflow-hidden`}>
        <ProfileCover cover={user.cover} editable onChange={() => refreshUser()} className="h-36 md:h-52" />
        <div className="flex flex-col gap-5 px-5 pb-6 sm:px-6 md:flex-row md:items-end">
          <div className="-mt-14 w-fit shrink-0 rounded-full bg-white p-1 dark:bg-gray-900 md:-mt-16">
            <UserAvatar name={fullName} avatar={user.avatar} size={120} decorative fallback="person" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">{fullName}</h1>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {[userType && titleCase(userType), `@${account.username}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {account.status && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_STYLES[account.status] ?? STATUS_STYLES.ACTIVE
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {titleCase(account.status)} account
                </span>
              )}
              {roles.map((r) => (
                <span key={r} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${accent.soft}`}>
                  {humanize(r)}
                </span>
              ))}
              {memberSince && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  Since {new Date(account.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => focusField("pf-first")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${accent.solid} ${accent.focus}`}
            >
              <UserRound className="h-4 w-4" aria-hidden />
              Edit details
            </button>
            <button
              type="button"
              onClick={() => setPasswordOpen(true)}
              className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700/40 dark:text-gray-200 dark:hover:bg-gray-800/50 ${accent.focus}`}
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Change password
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <form id="profile-form" ref={formRef} onSubmit={save} className={`${surface.card} relative`}>
            <header className="px-5 pt-5 sm:px-6">
              <h2 className={sectionTitle}>Personal details</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">How you appear to teachers, students and staff.</p>
            </header>
            <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
              <div>
                <label htmlFor="pf-first" className={labelCls}>
                  First name
                </label>
                <input id="pf-first" className={surface.input} value={form.first_name} onChange={set("first_name")} autoComplete="given-name" maxLength={100} />
              </div>
              <div>
                <label htmlFor="pf-last" className={labelCls}>
                  Last name
                </label>
                <input id="pf-last" className={surface.input} value={form.last_name} onChange={set("last_name")} autoComplete="family-name" maxLength={100} />
              </div>

              <fieldset className="sm:col-span-2">
                <legend className={labelCls}>Gender</legend>
                <div className="flex flex-wrap gap-2">
                  {GENDERS.map((g) => {
                    const on = form.gender === g.value;
                    return (
                      <label
                        key={g.value || "none"}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                          on
                            ? accent.selected + " font-semibold text-blue-700 dark:text-blue-300"
                            : "bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                        }`}
                      >
                        <input
                          id={`pf-gender-${g.value || "NONE"}`}
                          type="radio"
                          name="gender"
                          value={g.value}
                          checked={on}
                          onChange={set("gender")}
                          className="sr-only"
                        />
                        {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                        {g.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="pf-dob" className={labelCls}>
                  Date of birth
                </label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  <input
                    id="pf-dob"
                    type="date"
                    className={inputWithIcon}
                    value={form.date_of_birth}
                    onChange={set("date_of_birth")}
                    max={new Date().toISOString().slice(0, 10)}
                    aria-describedby="pf-dob-hint"
                  />
                </div>
                <p id="pf-dob-hint" className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {age != null ? `${age} years old` : "Only the school sees your birthday."}
                </p>
              </div>
              <div>
                <label htmlFor="pf-address" className={labelCls}>
                  Address
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  <input
                    id="pf-address"
                    className={inputWithIcon}
                    value={form.address}
                    onChange={set("address")}
                    autoComplete="street-address"
                    maxLength={255}
                    placeholder="District, sector, street"
                  />
                </div>
              </div>
            </div>

            {/* Sticky while you scroll the form, so Save is always in reach. */}
            <footer
              className={`sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t px-5 py-3 sm:px-6 ${
                dirty
                  ? "border-blue-200 bg-blue-50/95 backdrop-blur dark:border-blue-500/30 dark:bg-blue-950/80"
                  : `${surface.divider} bg-transparent`
              }`}
            >
              {dirty ? (
                <span role="status" className="mr-auto flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" aria-hidden />
                  You have unsaved changes
                  <kbd className="hidden rounded-md border border-blue-200 px-1.5 text-[11px] text-blue-700 dark:border-blue-500/30 dark:text-blue-300 sm:inline">
                    {navigator.platform?.toLowerCase().includes("mac") ? "⌘S" : "Ctrl S"}
                  </kbd>
                </span>
              ) : justSaved ? (
                <span role="status" className="mr-auto flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                  <Check className="h-4 w-4" aria-hidden />
                  All changes saved
                </span>
              ) : (
                <span className="mr-auto text-xs text-gray-500 dark:text-gray-400">Changes show in every NGA app after you save.</span>
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={() => setForm(initial)}
                  disabled={saving}
                  className={`rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-800/60 ${accent.focus}`}
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                disabled={!dirty || saving}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${accent.solid} ${accent.focus}`}
              >
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </form>

          <Card title="Your settings" description="Everything else that is about you, in one place.">
            <div className="-m-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {settings.map((s) => {
                const inner = (
                  <>
                    <span className={tileIcon}>{s.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{s.title}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{s.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </>
                );
                return s.to ? (
                  <Link key={s.key} to={s.to} className={tileCls}>
                    {inner}
                  </Link>
                ) : (
                  <button key={s.key} type="button" onClick={s.onClick} className={tileCls}>
                    {inner}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card
            title="Profile strength"
            action={
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white" aria-label={`${strength} percent complete`}>
                {strength}%
              </span>
            }
          >
            <div
              className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/40"
              role="progressbar"
              aria-valuenow={strength}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile strength"
            >
              <motion.div
                className="h-full rounded-full bg-blue-600"
                initial={{ width: 0 }}
                animate={{ width: `${strength}%` }}
                transition={m("fill").transition}
              />
            </div>
            <ul className="mt-4 space-y-1">
              {steps.map((s) => (
                <li key={s.key}>
                  {s.done ? (
                    <span className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                      <span className="line-through decoration-gray-300 dark:decoration-gray-600">{s.label}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={s.go}
                      className={`group flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm font-medium text-gray-900 dark:text-gray-100 ${surface.insetHover} ${accent.focus}`}
                    >
                      <span className="h-5 w-5 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600" aria-hidden />
                      <span className="flex-1">{s.cta}</span>
                      <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card id="profile-photo-card" title="Profile photo" description="Shown next to your name in NGA MIS, Task Mentor, Tendo and Tupo.">
            <div tabIndex={-1} className="outline-none">
              <AvatarControl name={fullName} avatar={user.avatar} onChange={() => refreshUser()} size={64} layout="inline" />
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Tip: drop a picture onto the banner above to change your cover.</p>
            </div>
          </Card>

          <Card title="Account" description="Managed by the school office. Ask them to change these.">
            <dl className="-mx-2 -my-1 space-y-0.5">
              {userType === "STUDENT" && (
                <Fact icon={<Hash className="h-4 w-4" aria-hidden />} label="Registration no." value={profile?.registration_number} mono onCopy={copy} />
              )}
              <Fact icon={<AtSign className="h-4 w-4" aria-hidden />} label="Username" value={account.username} onCopy={copy} />
              <Fact icon={<Mail className="h-4 w-4" aria-hidden />} label="Email" value={account.email} onCopy={copy} />
              <Fact icon={<Phone className="h-4 w-4" aria-hidden />} label="Phone" value={account.phone_number} onCopy={copy} />
              <Fact icon={<CalendarDays className="h-4 w-4" aria-hidden />} label="Member since" value={memberSince} />
            </dl>
          </Card>

          <Card title="Security">
            <div className="-mx-2 space-y-1">
              <Link to="/me/activity" className={`flex w-full items-center gap-3 px-2 py-2.5 ${surface.insetHover} ${accent.focus}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">My activity</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Where and when you signed in</span>
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
              </Link>
            </div>
            <p className={`mt-3 border-t pt-3 text-xs text-gray-500 dark:text-gray-400 ${surface.divider}`}>
              One password for every NGA app. Sign-in is protected with a one-time code, and signing out here signs you out of every NGA app.
            </p>
          </Card>
        </aside>
      </div>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
};

export default Profile;
