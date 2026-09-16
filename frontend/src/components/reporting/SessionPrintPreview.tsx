import React from "react";
import { X, Printer } from "lucide-react";
import { AssignedStudent, SubmitSessionPayload } from "../../api/mentorship";

interface Props {
  student: AssignedStudent;
  session: SubmitSessionPayload & { wellbeing_status?: string };
  onClose: () => void;
}

const WELLBEING_LABEL: Record<string, string> = {
  STRUGGLING: "Struggling 😢",
  CONCERNED: "Concerned 😟",
  NEUTRAL: "Neutral 😐",
  GOOD: "Good 🙂",
  EXCELLENT: "Excellent 😄",
};

const SessionPrintPreview: React.FC<Props> = ({ student, session, onClose }) => {
  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
  const formattedDate = session.session_date
    ? new Date(session.session_date + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const challengesAndGuidance = [
    session.challenges_identified ? `Challenge: ${session.challenges_identified}` : "",
    session.guidance_notes ? `Guidance: ${session.guidance_notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const wellbeingCell = [
    session.wellbeing_status ? WELLBEING_LABEL[session.wellbeing_status] ?? session.wellbeing_status : "",
    session.wellbeing_notes ?? "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <>
      {/* Print-only styles injected into head */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #session-print-root, #session-print-root * { visibility: visible !important; }
          #session-print-root { position: fixed; inset: 0; padding: 24px; background: white; }
          .no-print { display: none !important; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #374151; padding: 6px 8px; vertical-align: top; text-align: left; }
          th { background: #1e3a5f; color: white; }
        }
      `}</style>

      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div
          id="session-print-root"
          className="bg-white dark:bg-gray-800/30 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="no-print flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Mentorship Session Log — Preview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {fullName}
                {student.registration_number && ` (${student.registration_number})`} ·{" "}
                {student.class_group_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Printable area */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Document title */}
            <div className="text-center mb-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wide">
                MENTORSHIP SESSION LOG — {fullName.toUpperCase()} | {student.class_group_name.toUpperCase()}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[100px]">
                      Mentee Name
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[80px]">
                      Date
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[60px]">
                      Duration (mins)
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[160px]">
                      Assignment Completion &amp; Deadlines
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[160px]">
                      Punctuality, Attendance &amp; Discipline
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[160px]">
                      Academic &amp; Personal
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[180px]">
                      Challenges Identified &amp; Guidance Provided
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold min-w-[140px]">
                      Productivity &amp; Well-being
                    </th>
                    <th className="border border-gray-600 px-3 py-2 text-center font-semibold min-w-[60px]">
                      Completed (Y/N)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="align-top">
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-800 dark:text-gray-200 font-medium">
                      {fullName}
                      {student.registration_number && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                          {student.registration_number}
                        </div>
                      )}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300 text-center">
                      {session.duration_minutes ?? "—"}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300">
                      {session.assignment_completion && (
                        <span className="font-medium">{session.assignment_completion}. </span>
                      )}
                      {session.assignment_notes ?? ""}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300">
                      {session.punctuality_attendance && (
                        <span className="font-medium">{session.punctuality_attendance}. </span>
                      )}
                      {session.discipline_notes ?? ""}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300">
                      {[session.academic_planning, session.academic_personal_notes]
                        .filter(Boolean)
                        .join(". ")}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-pre-line">
                      {challengesAndGuidance || "—"}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-gray-700 dark:text-gray-300">
                      {wellbeingCell || "—"}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-center font-bold">
                      <span
                        className={
                          session.is_completed
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-500 dark:text-gray-400"
                        }
                      >
                        {session.is_completed ? "Y" : "N"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Extra session fields below the table */}
            {(session.action_items || session.next_steps || session.notes) && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-700 dark:text-gray-300">
                {session.action_items && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Action Items</p>
                    <p className="whitespace-pre-line">{session.action_items}</p>
                  </div>
                )}
                {session.next_steps && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Next Steps</p>
                    <p className="whitespace-pre-line">{session.next_steps}</p>
                  </div>
                )}
                {session.notes && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Session Notes</p>
                    <p className="whitespace-pre-line">{session.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="no-print flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Log
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SessionPrintPreview;
