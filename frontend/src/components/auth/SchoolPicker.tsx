import React from "react";
import { Building2, ChevronRight } from "lucide-react";
import Modal from "../ui/Modal";
import type { SchoolChoice } from "../../lib/tenant";

/**
 * "This account belongs to more than one school" (POST /auth/login answered with a
 * `choose` list). An accessible dialog (ui/Modal: labelled, Escape closes, focus
 * moves in and back) listing each school as a button; picking one signs in again
 * with that school. Never window.prompt/confirm.
 */
interface SchoolPickerProps {
  schools: SchoolChoice[] | null;
  busy?: boolean;
  onChoose: (school: SchoolChoice) => void;
  onClose: () => void;
}

const SchoolPicker: React.FC<SchoolPickerProps> = ({ schools, busy = false, onChoose, onClose }) => (
  <Modal isOpen={!!schools && schools.length > 0} onClose={onClose} title="Choose your school" size="sm">
    <p id="school-picker-help" className="text-sm text-slate-600 dark:text-slate-300 mb-4">
      This account is used at more than one school. Which one do you want to sign in to?
    </p>
    <ul className="space-y-2" aria-describedby="school-picker-help">
      {(schools ?? []).map((s) => (
        <li key={s.tid}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose(s)}
            aria-label={`Sign in to ${s.name}`}
            className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
          >
            <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-slate-900 dark:text-slate-100 truncate">{s.name}</span>
              <span className="block text-xs text-slate-600 dark:text-slate-300 truncate">{s.slug}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  </Modal>
);

export default SchoolPicker;
