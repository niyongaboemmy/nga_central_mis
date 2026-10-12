import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, RefreshCw, UserX } from "lucide-react";
import { mentorshipApi, AssignedStudent } from "../../api/mentorship";
import MentorCheckInInbox from "./MentorCheckInInbox";
import StudentSupportProfile from "./StudentSupportProfile";

// Pages behind /my-mentees/inbox and /my-mentees/:studentId. They exist so a
// notification, a Home card or the top-bar mentees list can open the inbox or
// one mentee directly — before, both were only reachable by clicking through
// the hub, and a refresh or the back button lost your place.

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-3 md:p-6">
    <div className="bg-white dark:bg-gray-800/30 rounded-3xl p-4 sm:p-6 border border-gray-100 dark:border-gray-700/20">{children}</div>
  </div>
);

const BackToMentees: React.FC = () => (
  <Link
    to="/my-mentees"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-4"
  >
    <ChevronLeft className="w-4 h-4" />
    My mentees
  </Link>
);

export const MenteeInboxPage: React.FC = () => (
  <Shell>
    <BackToMentees />
    <MentorCheckInInbox />
  </Shell>
);

export const MenteeProfilePage: React.FC = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const id = Number(studentId);
  const [student, setStudent] = useState<AssignedStudent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setState("missing");
      return;
    }
    let alive = true;
    setState("loading");
    mentorshipApi
      .getMentee(id)
      .then((res) => {
        if (!alive) return;
        setStudent((res as any).data?.data ?? null);
        setState("ready");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Shell>
      {state === "loading" ? (
        <div className="flex items-center justify-center text-gray-400 py-16">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading mentee…
        </div>
      ) : state === "missing" || !student ? (
        <div className="flex flex-col items-center text-center py-16 gap-3">
          <UserX className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          <p className="text-base font-semibold text-gray-600 dark:text-gray-300">This student is not one of your mentees</p>
          <p className="text-sm text-gray-400 max-w-sm">
            They may have moved to another mentor, or the assignment ended. Your school administrator manages mentor
            assignments.
          </p>
          <Link to="/my-mentees" className="mt-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Back to my mentees
          </Link>
        </div>
      ) : (
        // Keyed by id: switching mentee from the top bar remounts and refetches.
        <StudentSupportProfile key={student.user_id} student={student} onBack={() => navigate("/my-mentees")} />
      )}
    </Shell>
  );
};
