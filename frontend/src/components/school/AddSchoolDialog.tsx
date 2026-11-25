import React, { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import Modal from "../ui/Modal";
import { SwitchError, linkSchool, type MySchool } from "../../lib/schoolSwitch";
import { useToast } from "../../contexts/ToastContext";

/**
 * "Add another school" (GAP-A). Accounts in other schools that only share this
 * person's e-mail are never named -- any school can type any e-mail on an account --
 * so the person confirms one with that school's password. The server tries it
 * against each unlinked match and links the first it opens.
 */
export const unlinkedText = (n: number) =>
  `Your e-mail is used in ${n} more school${n === 1 ? "" : "s"}. Confirm with that school's password to add it.`;

interface Props {
  open: boolean;
  unlinkedCount: number;
  onClose: () => void;
  onAdded?: (school: MySchool) => void;
}

const AddSchoolDialog: React.FC<Props> = ({ open, unlinkedCount, onClose, onAdded }) => {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setBusy(false);
      setTimeout(() => pwRef.current?.focus(), 0);
    }
  }, [open]);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const school = await linkSchool(password);
      showToast(`${school.name} was added to your schools`, "success");
      onAdded?.(school);
      onClose();
    } catch (err) {
      const e = err as SwitchError;
      setError(e.message);
      showToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={() => !busy && onClose()} title="Add another school" size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="-mt-1 text-sm text-gray-600 dark:text-gray-300">{unlinkedText(Math.max(1, unlinkedCount))}</p>
        <div className="space-y-1.5">
          <label htmlFor="add-school-password" className="block text-sm font-medium text-gray-800 dark:text-gray-100">
            Your password at the other school
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              id="add-school-password"
              ref={pwRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-full border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 rounded-full border border-gray-300 px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Adding…" : "Add school"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddSchoolDialog;
