import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AtSign,
  Calendar,
  Hash,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { updateProfile, UserProfile } from "../api/users";
import AvatarControl from "./profile/AvatarControl";
import ProfileCover from "./profile/ProfileCover";
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

const TYPE_STYLES: Record<string, string> = {
  STUDENT: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  TEACHER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  ADMIN: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  PARENT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  STAFF: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  INACTIVE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const inputCls =
  "w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition";

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({
  title,
  subtitle,
  children,
  className = "",
}) => (
  <section
    className={`rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 shadow-sm p-5 md:p-6 ${className}`}
  >
    <header className="mb-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </header>
    {children}
  </section>
);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; className?: string }> = ({
  label,
  htmlFor,
  children,
  className = "",
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const InfoRow: React.FC<{ icon: React.ElementType; label: string; value?: string | null; mono?: boolean }> = ({
  icon: Icon,
  label,
  value,
  mono,
}) => (
  <div className="flex items-center gap-3 py-2.5">
    <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-sm text-gray-800 dark:text-gray-100 truncate ${mono ? "font-mono" : "font-medium"}`}>
        {value || "—"}
      </p>
    </div>
  </div>
);

const Profile: React.FC = () => {
  const { user, refreshUser } = useUser();
  const { showToast } = useToast();
  const initial = useMemo(() => fromProfile(user?.profile), [user?.profile]);
  // Seeded from the profile (not empty) so the "unsaved changes" bar never flashes on load.
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = (Object.keys(initial) as (keyof FormState)[]).some((k) => form[k] !== initial[k]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const { user: account, profile } = user;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || account.username;
  const userType = profile?.user_type;

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
    <div className="min-h-screen bg-gray-50/60 dark:bg-black pb-28">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 space-y-6">
        {/* Identity */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800 shadow-sm"
        >
          <ProfileCover cover={user.cover} editable onChange={() => refreshUser()} className="h-36 md:h-52" />
          <div className="relative px-5 md:px-8 pb-6 -mt-14 md:-mt-16 flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
            <AvatarControl name={fullName} avatar={user.avatar} onChange={() => refreshUser()} size={128} />
            <div className="flex-1 min-w-0 text-center md:text-left md:pt-16">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{fullName}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                @{account.username} · {account.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-2">
                {userType && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[userType] ?? TYPE_STYLES.STAFF}`}>
                    {titleCase(userType)}
                  </span>
                )}
                {account.status && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[account.status] ?? STATUS_STYLES.ACTIVE}`}>
                    {titleCase(account.status)}
                  </span>
                )}
                {(user.roles ?? []).slice(0, 3).map((r) => (
                  <span key={r.role_id} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 md:px-8 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/60 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            Your picture and name follow you into Task Mentor, Tendo and Tupo, so classmates and colleagues recognise you everywhere.
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Personal information */}
          <motion.form
            id="profile-form"
            onSubmit={save}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="lg:col-span-2"
          >
            <Card title="Personal information" subtitle="How you appear to teachers, students and staff.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </Card>
          </motion.form>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
            <Card title="Account" subtitle="Managed by the school office.">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {userType === "STUDENT" && <InfoRow icon={Hash} label="Registration number" value={profile?.registration_number} mono />}
                <InfoRow icon={AtSign} label="Username" value={account.username} />
                <InfoRow icon={Mail} label="Email" value={account.email} />
                <InfoRow icon={Phone} label="Phone" value={account.phone_number} />
                <InfoRow icon={Calendar} label="Member since" value={account.created_at ? new Date(account.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null} />
              </div>
            </Card>

            <Card title="Security">
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition text-left"
              >
                <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Change password</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">One password for every NGA app</span>
                </span>
                <Lock className="w-4 h-4 text-gray-400" />
              </button>
              <p className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                Sign-in is protected with a one-time code.
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <LogOut className="w-3.5 h-3.5" />
                Signing out here signs you out of every NGA app.
              </p>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Unsaved changes bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 md:w-[32rem] rounded-2xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-2xl px-4 py-3 flex items-center gap-3"
            role="status"
          >
            <span className="flex-1 text-sm">You have unsaved changes</span>
            <button type="button" onClick={() => setForm(initial)} disabled={saving} className="px-3 py-1.5 text-sm rounded-xl hover:bg-white/10 dark:hover:bg-gray-900/10">
              Discard
            </button>
            <button type="submit" form="profile-form" disabled={saving} className="px-4 py-1.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
};

export default Profile;
