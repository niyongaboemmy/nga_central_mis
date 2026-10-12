import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { updateProfile, UserProfile } from "../api/users";
import AvatarControl from "./profile/AvatarControl";
import ProfileCover from "./profile/ProfileCover";
import UserAvatar from "./ui/UserAvatar";
import ChangePasswordModal from "./ChangePasswordModal";
import SelectField from "./ui/SelectField";

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
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-400/20",
  INACTIVE: "bg-gray-50 text-gray-600 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-400/20",
  SUSPENDED: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-400/20",
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const inputCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition";

const Section: React.FC<{
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, footer, children }) => (
  <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
    <header className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    </header>
    <div className="px-5 py-5 sm:px-6">{children}</div>
    {footer && (
      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/60 sm:px-6">
        {footer}
      </footer>
    )}
  </section>
);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; className?: string }> = ({
  label,
  htmlFor,
  children,
  className = "",
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
    </label>
    {children}
  </div>
);

const Detail: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className={`min-w-0 truncate text-right text-sm text-gray-900 dark:text-gray-100 ${mono ? "font-mono" : "font-medium"}`}>
      {value || <span className="text-gray-400">Not set</span>}
    </dd>
  </div>
);

/**
 * Your profile: who you are across every NGA app (name, picture, cover) and the
 * account details the school office manages. Laid out as a settings page: a header
 * that reads like your profile card elsewhere, editable sections with their own Save,
 * and the read-only account facts beside them.
 */
const Profile: React.FC = () => {
  const { user, refreshUser } = useUser();
  const { showToast } = useToast();
  const initial = useMemo(() => fromProfile(user?.profile), [user?.profile]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  const { user: account, profile } = user;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || account.username;
  const userType = profile?.user_type;
  // Roles that only repeat the account type ("STUDENT" on a student) add nothing.
  const roles = (user.roles ?? []).map((r) => r.name).filter((n) => n.toUpperCase() !== String(userType ?? "").toUpperCase());

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
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 md:px-6">
      {/* Identity: how you appear in every NGA app */}
      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
        <ProfileCover
          cover={user.cover}
          editable
          onChange={() => refreshUser()}
          className="h-28 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 md:h-40"
        />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <div className="-mt-12 shrink-0 rounded-full ring-4 ring-white dark:ring-gray-900">
            <UserAvatar name={fullName} avatar={user.avatar} size={96} decorative />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-2xl">{fullName}</h1>
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {[userType && titleCase(userType), `@${account.username}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          {account.status && (
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                STATUS_STYLES[account.status] ?? STATUS_STYLES.ACTIVE
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              {titleCase(account.status)} account
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Section title="Profile photo" description="Shown next to your name in NGA MIS, Task Mentor, Tendo and Tupo.">
            <AvatarControl name={fullName} avatar={user.avatar} onChange={() => refreshUser()} size={64} layout="inline" />
          </Section>

          <form id="profile-form" onSubmit={save}>
            <Section
              title="Personal details"
              description="How you appear to teachers, students and staff."
              footer={
                <>
                  {dirty && (
                    <span role="status" className="mr-auto text-sm text-gray-500 dark:text-gray-400">
                      You have unsaved changes
                    </span>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => setForm(initial)}
                      disabled={saving}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!dirty || saving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="pf-first">
                  <input id="pf-first" className={inputCls} value={form.first_name} onChange={set("first_name")} autoComplete="given-name" maxLength={100} />
                </Field>
                <Field label="Last name" htmlFor="pf-last">
                  <input id="pf-last" className={inputCls} value={form.last_name} onChange={set("last_name")} autoComplete="family-name" maxLength={100} />
                </Field>
                <Field label="Gender" htmlFor="pf-gender">
                  <SelectField id="pf-gender" className={inputCls} value={form.gender} onChange={set("gender")}>
                    <option value="">Not specified</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </SelectField>
                </Field>
                <Field label="Date of birth" htmlFor="pf-dob">
                  <input id="pf-dob" type="date" className={inputCls} value={form.date_of_birth} onChange={set("date_of_birth")} max={new Date().toISOString().slice(0, 10)} />
                </Field>
                <Field label="Address" htmlFor="pf-address" className="sm:col-span-2">
                  <input id="pf-address" className={inputCls} value={form.address} onChange={set("address")} autoComplete="street-address" maxLength={255} placeholder="District, sector, street" />
                </Field>
              </div>
            </Section>
          </form>
        </div>

        <aside className="space-y-6">
          <Section title="Account" description="Managed by the school office. Ask them to change these.">
            <dl className="-my-2.5 divide-y divide-gray-100 dark:divide-gray-800">
              {userType === "STUDENT" && <Detail label="Registration no." value={profile?.registration_number} mono />}
              <Detail label="Username" value={account.username} />
              <Detail label="Email" value={<span title={account.email}>{account.email}</span>} />
              <Detail label="Phone" value={account.phone_number} />
              {roles.length > 0 && <Detail label={roles.length === 1 ? "Role" : "Roles"} value={roles.join(", ")} />}
              <Detail
                label="Member since"
                value={account.created_at ? new Date(account.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null}
              />
            </dl>
          </Section>

          <Section title="Security">
            <div className="-mx-2 space-y-1">
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <KeyRound className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Change password</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">One password for every NGA app</span>
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
              </button>
              <Link
                to="/me/activity"
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <ShieldCheck className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">My activity</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Where and when you signed in</span>
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
              </Link>
            </div>
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Sign-in is protected with a one-time code, and signing out here signs you out of every NGA app.
            </p>
          </Section>
        </aside>
      </div>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
};

export default Profile;
