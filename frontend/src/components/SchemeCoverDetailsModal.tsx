import React, { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { schemeOfWorkApi, SchemeHeader } from "../api/schemeOfWork";
import { useToast } from "../contexts/ToastContext";
import { Loader2 } from "lucide-react";

interface SchemeCoverDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemeId: number;
  scheme: SchemeHeader | null;
  onSaved: () => void;
}

interface CoverForm {
  sector: string;
  trade: string;
  qualification_title: string;
  rqf_level: string;
  module_code: string;
  learning_hours_per_week: string;
  number_of_classes: string;
  scheme_date: string;
  approver_name: string;
  approver_title: string;
  trainer_signed: boolean;
  approver_signed: boolean;
}

const toForm = (scheme: SchemeHeader | null): CoverForm => ({
  sector: scheme?.sector || "",
  trade: scheme?.trade || "",
  qualification_title: scheme?.qualification_title || "",
  rqf_level: scheme?.rqf_level || "",
  module_code: scheme?.module_code || "",
  learning_hours_per_week: scheme?.learning_hours_per_week?.toString() || "",
  number_of_classes: scheme?.number_of_classes?.toString() || "",
  scheme_date: scheme?.scheme_date ? scheme.scheme_date.split("T")[0] : "",
  approver_name: scheme?.approver_name || "",
  approver_title: scheme?.approver_title || "",
  trainer_signed: !!scheme?.trainer_signed,
  approver_signed: !!scheme?.approver_signed,
});

/** Editable cover-page metadata (Sector, Trade, Qualification, RQF Level, etc.) that appears on
 * the printed/PDF Scheme of Work's first page. Kept as its own compact panel — separate from the
 * weekly-entry editing flow — so filling it in is a quick, one-time task rather than something
 * buried in every entry form. */
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
        sector: form.sector || null,
        trade: form.trade || null,
        qualification_title: form.qualification_title || null,
        rqf_level: form.rqf_level || null,
        module_code: form.module_code || null,
        learning_hours_per_week: form.learning_hours_per_week
          ? parseInt(form.learning_hours_per_week, 10)
          : null,
        number_of_classes: form.number_of_classes
          ? parseInt(form.number_of_classes, 10)
          : null,
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cover Page Details" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These fields appear on the Scheme of Work's printed cover page. Leave any field blank to
          show "N/A" on the report.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Sector</label>
            <input
              value={form.sector}
              onChange={(e) => set("sector", e.target.value)}
              placeholder="e.g. ICT and Multimedia"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Trade</label>
            <input
              value={form.trade}
              onChange={(e) => set("trade", e.target.value)}
              placeholder="e.g. Software Programming and Embedded Systems"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={labelClass}>Qualification Title</label>
            <input
              value={form.qualification_title}
              onChange={(e) => set("qualification_title", e.target.value)}
              placeholder="e.g. TVET Certificate 3 in Software Programming"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>RQF Level</label>
            <input
              value={form.rqf_level}
              onChange={(e) => set("rqf_level", e.target.value)}
              placeholder="e.g. Level 3"
              className={inputClass}
            />
          </div>
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
            <label className={labelClass}>Learning Hours / Week</label>
            <input
              type="number"
              min={0}
              value={form.learning_hours_per_week}
              onChange={(e) => set("learning_hours_per_week", e.target.value)}
              placeholder="e.g. 5"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Number of Classes</label>
            <input
              type="number"
              min={0}
              value={form.number_of_classes}
              onChange={(e) => set("number_of_classes", e.target.value)}
              placeholder="e.g. 1"
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
    </Modal>
  );
};

export default SchemeCoverDetailsModal;
