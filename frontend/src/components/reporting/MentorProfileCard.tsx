import React, { useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Mail,
  MessageSquareText,
  Phone,
  UserRound,
} from "lucide-react";
import UserAvatar from "../ui/UserAvatar";
import ProfileCover from "../profile/ProfileCover";
import { MyMentorInfo } from "../../api/mentorship";
import { NGA_APPS } from "../apps/ngaApps";
import { useToast } from "../../contexts/ToastContext";

const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teacher",
  STAFF: "Staff",
  ADMIN: "Administration",
  PARENT: "Parent",
};
export const mentorRoleLabel = (role: string) =>
  ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase();

const formatDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const tupoOrigin = NGA_APPS.find((a) => a.key === "tupo")?.origin ?? "https://tupo.amashuri.com";
/**
 * Tupo's Mentorship page. Tupo asks MIS who the signed-in student's mentor is,
 * so the link carries no id to tamper with. `message=1` opens the chat straight away.
 */
export const tupoMentorUrl = (openChat = false) => `${tupoOrigin}/app/mentorship${openChat ? "?message=1" : ""}`;

interface DetailProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  /** Text to put on the clipboard; shows a copy button. */
  copy?: string;
}

const Detail: React.FC<DetailProps> = ({ icon, label, value, copy }) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      showToast(`${label} copied`, "success");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Could not copy — select the text instead", "error");
    }
  };
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-700/40 bg-gray-50/60 dark:bg-gray-900/30 p-3 transition-colors hover:border-blue-200 dark:hover:border-blue-800/60">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white break-words">{value}</dd>
      </div>
      {copy && (
        <button
          type="button"
          onClick={doCopy}
          aria-label={`Copy ${label.toLowerCase()}`}
          title={`Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-blue-600 dark:hover:bg-gray-800 dark:hover:text-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
};

interface Props {
  mentor: MyMentorInfo;
  yearName?: string | null;
}

/**
 * The student's mentor, as a profile: cover, photo, who they are, every way to
 * reach them, and a one-click hand-off to a Tupo chat with them.
 */
const MentorProfileCard: React.FC<Props> = ({ mentor, yearName }) => {
  const name = mentor.mentor_name ?? "Your mentor";
  const year = mentor.academic_year_name ?? yearName ?? null;
  const subjects = mentor.teaches_you ?? [];

  return (
    <section
      aria-label="Your mentor"
      className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700/30 bg-white dark:bg-gray-800/30 shadow-sm"
    >
      <ProfileCover cover={mentor.cover ?? null} className="h-24 md:h-32" />
      <div className="px-4 pb-5 md:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <UserAvatar
            decorative
            avatar={mentor.avatar ?? null}
            userId={mentor.mentor_id}
            name={name}
            size={88}
            ring
            className="-mt-11 shrink-0 shadow-md"
          />
          <div className="min-w-0 flex-1 sm:pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Your mentor{year ? ` · ${year}` : ""}
            </p>
            <h3 className="truncate text-xl font-semibold text-gray-900 dark:text-white">{name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {mentor.mentor_role && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {mentorRoleLabel(mentor.mentor_role)}
                </span>
              )}
              {subjects.map((subject) => (
                <span
                  key={subject}
                  className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  title="This mentor also teaches you this subject"
                >
                  Teaches you {subject}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:pt-4">
            <a
              href={tupoMentorUrl(true)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <MessageSquareText className="h-4 w-4" />
              Message on Tupo
            </a>
            {mentor.mentor_email && (
              <a
                href={`mailto:${mentor.mentor_email}`}
                aria-label={`Email ${name}`}
                title="Send an email"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300 dark:hover:text-blue-400"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {mentor.mentor_phone && (
              <a
                href={`tel:${mentor.mentor_phone}`}
                aria-label={`Call ${name}`}
                title="Call"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300 dark:hover:text-blue-400"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail icon={<UserRound className="h-4 w-4" />} label="Full name" value={name} />
          {mentor.mentor_role && (
            <Detail icon={<BriefcaseBusiness className="h-4 w-4" />} label="Role" value={mentorRoleLabel(mentor.mentor_role)} />
          )}
          {mentor.mentor_email && (
            <Detail
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={<a href={`mailto:${mentor.mentor_email}`} className="hover:text-blue-600 dark:hover:text-blue-400">{mentor.mentor_email}</a>}
              copy={mentor.mentor_email}
            />
          )}
          <Detail
            icon={<Phone className="h-4 w-4" />}
            label="Phone"
            value={
              mentor.mentor_phone ? (
                <a href={`tel:${mentor.mentor_phone}`} className="hover:text-blue-600 dark:hover:text-blue-400">{mentor.mentor_phone}</a>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Not shared</span>
              )
            }
            copy={mentor.mentor_phone ?? undefined}
          />
          {mentor.assigned_at && (
            <Detail icon={<CalendarClock className="h-4 w-4" />} label="Your mentor since" value={formatDay(mentor.assigned_at)} />
          )}
          {year && <Detail icon={<CalendarDays className="h-4 w-4" />} label="Academic year" value={year} />}
          {subjects.length > 0 && (
            <Detail icon={<BookOpen className="h-4 w-4" />} label="Teaches you" value={subjects.join(", ")} />
          )}
        </dl>

        <a
          href={tupoMentorUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          See {mentor.mentor_first_name ?? "their"}{mentor.mentor_first_name ? "'s" : ""} full profile and status on Tupo
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
};

export default MentorProfileCard;
