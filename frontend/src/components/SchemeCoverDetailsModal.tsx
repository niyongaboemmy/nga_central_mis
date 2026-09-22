import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./ui/Modal";
import { schemeOfWorkApi, SchemeHeader } from "../api/schemeOfWork";
import { useToast } from "../contexts/ToastContext";
import { Loader2, ExternalLink } from "lucide-react";

interface SchemeCoverDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemeId: number;
  scheme: SchemeHeader | null;
  onSaved: () => void;
}

interface CoverForm {
  module_code: string;
  scheme_date: string;
  approver_name: string;
  approver_title: string;
  trainer_signed: boolean;
  approver_signed: boolean;
}

const toForm = (scheme: SchemeHeader | null): CoverForm => ({
  module_code: scheme?.module_code || "",
  scheme_date: scheme?.scheme_date ? scheme.scheme_date.split("T")[0] : "",
  approver_name: scheme?.approver_name || "",
  approver_title: scheme?.approver_title || "",
  trainer_signed: !!scheme?.trainer_signed,
  approver_signed: !!scheme?.approver_signed,
});

/** Editable cover-page metadata that's genuinely specific to this one scheme (module code, date,
 * approver, signatures). Sector/Trade/Qualification (School-level) and RQF Level/Learning Hours
 * (Subject-level) are shown read-only here, pulled live from School/Subject settings -- editing
 * them there updates every scheme's PDF at once instead of needing to be re-typed per scheme. */
const SchemeCoverDetailsModal: React.FC<SchemeCoverDetailsModalProps> = ({
  isOpen,
  onClose,
  schemeId,
  scheme,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<CoverForm>(toForm(scheme));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(scheme));
  }, [scheme, isOpen]);

  const set = <K extends keyof CoverForm>(key: K, value: CoverForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await schemeOfWorkApi.updateCoverDetails(schemeId, {
        module_code: form.module_code || null,
        scheme_date: form.scheme_date || null,
        approver_name: form.approver_name || null,
        approver_title: form.approver_title || null,
        trainer_signed: form.trainer_signed,
        approver_signed: form.approver_signed,
      });
      showToast("Cover page details saved", "success");
      onSaved();
      onClose();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save cover page details",
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400";
  const labelClass =
    "text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1";
  const readOnlyValueClass = "text-sm text-gray-700 dark:text-gray-200";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cover Page Details" size="lg">
      <div className="space-y-6">
        {/* Read-only: sourced from School / Subject settings, shared across every scheme */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            These come from School and Subject settings, so they're the same on every scheme's
            report. Edit them there — changes apply everywhere automatically.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className={labelClass}>Sector</div>
              <div className={readOnlyValueClass}>{scheme?.sector || "N/A"}</div>
            </div>
            <div>
              <div className={labelClass}>Trade</div>
              <div className={readOnlyValueClass}>{scheme?.trade || "N/A"}</div>
            </div>
            <div className="md:col-span-2">
              <div className={labelClass}>Qualification Title</div>
              <div className={readOnlyValueClass}>{scheme?.qualification_title || "N/A"}</div>
            </div>
            <div>
              <div className={labelClass}>RQF Level</div>
              <div className={readOnlyValueClass}>{scheme?.rqf_level || "N/A"}</div>
            </div>
            <div>
              <div className={labelClass}>Learning Hours</div>
              <div className={readOnlyValueClass}>{scheme?.learning_hours || "N/A"}</div>
            </div>
            <div>
              <div className={labelClass}>Number of Classes</div>
              <div className={readOnlyValueClass}>
                {scheme?.number_of_classes ?? 0} class group
                {(scheme?.number_of_classes ?? 0) === 1 ? "" : "s"} assigned this year
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <Link
              to="/schools"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit School details <ExternalLink className="w-3 h-3" />
            </Link>
            <Link
              to="/academics"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit Subject details <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Module Code</label>
              <input
                value={form.module_code}
                onChange={(e) => set("module_code", e.target.value)}
                placeholder="e.g. SFEPE301"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={form.scheme_date}
                onChange={(e) => set("scheme_date", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Approver Name</label>
              <input
                value={form.approver_name}
                onChange={(e) => set("approver_name", e.target.value)}
                placeholder="e.g. Program Coordinator's name"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Approver Title</label>
              <input
                value={form.approver_title}
                onChange={(e) => set("approver_title", e.target.value)}
                placeholder="e.g. Program Coordinator"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-6 px-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.trainer_signed}
                onChange={(e) => set("trainer_signed", e.target.checked)}
                className="accent-blue-600"
              />
              Trainer has signed
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.approver_signed}
                onChange={(e) => set("approver_signed", e.target.checked)}
                className="accent-blue-600"
              />
              Approver has signed
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-50 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? "Saving..." : "Save Cover Page"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default SchemeCoverDetailsModal;
