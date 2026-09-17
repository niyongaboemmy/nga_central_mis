import React from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  Building,
  Calendar,
  MapPin,
  Shield,
  Clock,
  User as UserIcon,
  Activity,
  UserCircle,
  History,
  Hash,
  AtSign,
  Lock,
} from "lucide-react";
import { UserWithProfile } from "../../api/users";
import { InfoItem } from "./TabShared";

interface EditedInfo {
  username?: string;
  email?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  first_name?: string;
  last_name?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  date_of_birth?: string;
  address?: string;
  external_id?: string;
  phone_number?: string;
}

interface InfoTabProps {
  user: UserWithProfile;
  isEditingInfo: boolean;
  editedInfo: EditedInfo;
  setEditedInfo: (info: EditedInfo) => void;
  /** Field-level validation errors, keyed by field name. */
  errors?: Record<string, string>;
  /** Only someone who can manage users outright may change username / email
   * / account status here -- everyone else edits personal info only. */
  canManageUsers?: boolean;
}

const fieldAnim = (index: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: Math.min(index, 10) * 0.03, duration: 0.2 },
});

const Field: React.FC<{
  label: string;
  icon: React.ElementType;
  error?: string;
  hint?: string;
  className?: string;
  index?: number;
  children: React.ReactNode;
}> = ({ label, icon: Icon, error, hint, className, index = 0, children }) => (
  <motion.div className={className} {...fieldAnim(index)}>
    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </label>
    {children}
    {error ? (
      <p className="text-xs text-red-500 mt-1 ml-1">{error}</p>
    ) : hint ? (
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-1">
        {hint}
      </p>
    ) : null}
  </motion.div>
);

const inputBase =
  "w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-white transition-colors";
const inputOk =
  "border-gray-200 dark:border-slate-700 focus:border-blue-500";
const inputErr = "border-red-400 dark:border-red-500 focus:border-red-500";
const inputDisabled =
  "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-slate-900";

const SectionHeading: React.FC<{
  icon: React.ElementType;
  children: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ icon: Icon, children, aside }) => (
  <div className="flex items-center justify-between mb-4 ml-1">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
      <Icon className="w-3.5 h-3.5" />
      {children}
    </h3>
    {aside}
  </div>
);

const InfoTab: React.FC<InfoTabProps> = ({
  user,
  isEditingInfo,
  editedInfo,
  setEditedInfo,
  errors = {},
  canManageUsers = false,
}) => {
  const calculateAge = (dobString: string | undefined) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const age = calculateAge(user.profile?.date_of_birth);
  const isStudent = user.profile?.user_type === "STUDENT";
  const set = (patch: Partial<EditedInfo>) =>
    setEditedInfo({ ...editedInfo, ...patch });

  if (isEditingInfo) {
    return (
      <div className="space-y-6 pb-4">
        {/* Account section -- username/email/status only editable by someone
            who can manage users outright; everyone else sees them locked. */}
        <div className="bg-white dark:bg-slate-900/40 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800">
          <SectionHeading
            icon={UserCircle}
            aside={
              !canManageUsers && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Lock className="w-3 h-3" />
                  Requires user management access
                </span>
              )
            }
          >
            Account
          </SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Username" icon={AtSign} error={errors.username} index={0}>
              <input
                type="text"
                value={editedInfo.username || ""}
                disabled={!canManageUsers}
                onChange={(e) => set({ username: e.target.value })}
                className={`${inputBase} ${errors.username ? inputErr : inputOk} ${!canManageUsers ? inputDisabled : ""}`}
              />
            </Field>
            <Field label="Email Address" icon={Mail} error={errors.email} index={1}>
              <input
                type="email"
                value={editedInfo.email || ""}
                disabled={!canManageUsers}
                onChange={(e) => set({ email: e.target.value })}
                className={`${inputBase} ${errors.email ? inputErr : inputOk} ${!canManageUsers ? inputDisabled : ""}`}
              />
            </Field>
            <Field label="Account Status" icon={Activity} index={2}>
              <select
                value={editedInfo.status || "ACTIVE"}
                disabled={!canManageUsers}
                onChange={(e) => set({ status: e.target.value as EditedInfo["status"] })}
                className={`${inputBase} ${inputOk} ${!canManageUsers ? inputDisabled : ""}`}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </Field>
            <Field label="User Type" icon={Shield} index={3} hint="Set via Roles, not editable here">
              <input
                type="text"
                value={user.profile?.user_type || "USER"}
                disabled
                className={`${inputBase} ${inputOk} ${inputDisabled}`}
              />
            </Field>
            {isStudent && (
              <Field
                label="Registration Number"
                icon={Hash}
                index={4}
                className="md:col-span-2"
                hint="Assigned automatically on creation, or from the Generate Reg. Numbers action in Users Management -- not editable here"
              >
                <input
                  type="text"
                  value={user.profile?.registration_number || "Not yet assigned"}
                  disabled
                  className={`${inputBase} ${inputOk} ${inputDisabled} font-mono`}
                />
              </Field>
            )}
          </div>
        </div>

        {/* Personal section */}
        <div className="bg-white dark:bg-slate-900/40 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800">
          <SectionHeading icon={UserIcon}>Personal Information</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="First Name" icon={UserIcon} index={0}>
              <input
                type="text"
                value={editedInfo.first_name || ""}
                onChange={(e) => set({ first_name: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="Last Name" icon={UserIcon} index={1}>
              <input
                type="text"
                value={editedInfo.last_name || ""}
                onChange={(e) => set({ last_name: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="Gender" icon={Building} index={2}>
              <select
                value={editedInfo.gender || ""}
                onChange={(e) => set({ gender: e.target.value as EditedInfo["gender"] })}
                className={`${inputBase} ${inputOk}`}
              >
                <option value="" disabled>
                  Select gender...
                </option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Date of Birth" icon={Calendar} index={3}>
              <input
                type="date"
                value={editedInfo.date_of_birth || ""}
                onChange={(e) => set({ date_of_birth: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="Phone Number" icon={Phone} index={4}>
              <input
                type="text"
                value={editedInfo.phone_number || ""}
                onChange={(e) => set({ phone_number: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="External ID" icon={Shield} index={5}>
              <input
                type="text"
                value={editedInfo.external_id || ""}
                onChange={(e) => set({ external_id: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="Physical Address" icon={MapPin} index={6} className="md:col-span-2">
              <input
                type="text"
                value={editedInfo.address || ""}
                onChange={(e) => set({ address: e.target.value })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
          </div>
        </div>

        {/* System info stays read-only -- these are server-derived, not
            something an edit form should let anyone override. */}
        <div className="bg-white dark:bg-slate-900/40 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800">
          <SectionHeading icon={History}>System Information</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoItem
              icon={Clock}
              label="Member Since"
              value={new Date(user.user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
            <InfoItem
              icon={Clock}
              label="Last Updated"
              value={new Date(user.user.updated_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-4">
      {/* Account Information Section */}
      <section>
        <SectionHeading icon={UserCircle}>Account Details</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={UserIcon}
            label="Username"
            value={`@${user.user.username}`}
            highlight
          />
          <InfoItem
            icon={Mail}
            label="Email Address"
            value={user.user.email}
            highlight
          />
          <InfoItem
            icon={Shield}
            label="User Type"
            value={user.profile?.user_type || "USER"}
          />
          <InfoItem
            icon={Activity}
            label="Account Status"
            value={user.user.status}
          />
          {isStudent && (
            <InfoItem
              icon={Hash}
              label="Registration Number"
              value={user.profile?.registration_number || "Not yet assigned"}
              highlight={!!user.profile?.registration_number}
            />
          )}
        </div>
      </section>

      {/* Personal Information Section */}
      <section>
        <SectionHeading icon={UserIcon}>Personal Information</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={UserIcon}
            label="First Name"
            value={user.profile?.first_name || "Not provided"}
          />
          <InfoItem
            icon={UserIcon}
            label="Last Name"
            value={user.profile?.last_name || "Not provided"}
          />
          <InfoItem
            icon={Building}
            label="Gender"
            value={user.profile?.gender || "Not specified"}
          />
          <InfoItem
            icon={Calendar}
            label="Date of Birth"
            value={
              user.profile?.date_of_birth
                ? `${new Date(user.profile.date_of_birth).toLocaleDateString()} ${age ? `(${age} years old)` : ""}`
                : "Not specified"
            }
          />
          <InfoItem
            icon={Phone}
            label="Phone Number"
            value={user.user.phone_number || "Not provided"}
          />
          <InfoItem
            icon={MapPin}
            label="Physical Address"
            value={user.profile?.address || "Not provided"}
          />
          <InfoItem
            icon={Shield}
            label="External ID"
            value={user.profile?.external_id || "Not provided"}
          />
        </div>
      </section>

      {/* System Information Section */}
      <section>
        <SectionHeading icon={History}>System Information</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={Clock}
            label="Member Since"
            value={new Date(user.user.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <InfoItem
            icon={Clock}
            label="Last Updated"
            value={new Date(user.user.updated_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </div>
      </section>
    </div>
  );
};

export default InfoTab;
