import React, { useCallback, useEffect, useState } from "react";
import { Check, Hammer, Undo2 } from "lucide-react";
import { apiService, API_BASE_URL } from "../../../services/api";
import { getToken } from "../../../utils/auth";
import { useToast } from "../../../contexts/ToastContext";

/**
 * Practical work waiting for the teacher (LESSON_STUDIO plan §11): the student's photos, the
 * checklist to tick, then sign off (→ the criteria count as demonstrated) or return with a
 * comment. Shown at the top of the builder's "Who's learning" tab when anything is waiting.
 */
const PracticalReviewPanel: React.FC<{ courseId: number }> = ({ courseId }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [ticks, setTicks] = useState<Record<number, Record<string, boolean>>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const token = encodeURIComponent(getToken() || "");

  const load = useCallback(() => {
    apiService.get<any>(`/elearning/courses/${courseId}/practicals`, { params: { status: "SUBMITTED" } }).then((r) => setRows(r.data.data), () => setRows([]));
  }, [courseId]);
  useEffect(load, [load]);

  const decide = async (row: any, decision: "SIGN_OFF" | "RETURN") => {
    setBusy(row.submission_id);
    try {
      await apiService.post(`/elearning/practicals/${row.submission_id}/review`, { decision, checklist_result: ticks[row.submission_id] || {}, comment: comments[row.submission_id] || undefined });
      showToast(decision === "SIGN_OFF" ? `Signed off for ${row.student.name}` : `Returned to ${row.student.name}`, "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Couldn't save the review", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!rows || rows.length === 0) return null;
  return (
    <section aria-labelledby="practicals-h" className="mb-5">
      <h3 id="practicals-h" className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <Hammer className="w-4 h-4 text-brand-600 dark:text-brand-200" /> Practical work to review ({rows.length})
      </h3>
      <ul className="mt-3 grid lg:grid-cols-2 gap-3">
        {rows.map((r) => {
          const t = ticks[r.submission_id] || {};
          const all = r.checklist.every((c: any) => t[c.id]);
          return (
            <li key={r.submission_id} className="el-card p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.student.name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{r.item_title} · {r.section_title.split(" — ")[0]}</p>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {(r.photos as number[]).map((id) => (
                  <a key={id} href={`${API_BASE_URL}/elearning/practicals/${r.submission_id}/photos/${id}?token=${token}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img src={`${API_BASE_URL}/elearning/practicals/${r.submission_id}/photos/${id}?token=${token}`} alt={`Evidence photo from ${r.student.name}`} className="w-28 h-28 object-cover rounded-xl" loading="lazy" />
                  </a>
                ))}
              </div>
              {r.student_note && <p className="text-sm italic text-slate-600 dark:text-slate-300">“{r.student_note}”</p>}
              <ul className="space-y-1">
                {r.checklist.map((c: any) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 w-5 h-5 accent-brand-500" checked={!!t[c.id]} onChange={(e) => setTicks({ ...ticks, [r.submission_id]: { ...t, [c.id]: e.target.checked } })} />
                      {c.text}
                      {c.criteria_number && <span className="ml-auto px-1.5 rounded-pill el-chip text-[10px] font-semibold">{c.criteria_number}</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <textarea aria-label={`Comment for ${r.student.name}`} placeholder="Comment (needed when returning)" rows={2} value={comments[r.submission_id] || ""} onChange={(e) => setComments({ ...comments, [r.submission_id]: e.target.value })} className="el-input py-2" />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy === r.submission_id || !all} onClick={() => decide(r, "SIGN_OFF")} title={all ? undefined : "Tick every line to sign off"} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill bg-success-700 text-white text-sm font-semibold disabled:opacity-50">
                  <Check className="w-4 h-4" /> Sign off
                </button>
                <button disabled={busy === r.submission_id || !(comments[r.submission_id] || "").trim()} onClick={() => decide(r, "RETURN")} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium disabled:opacity-50">
                  <Undo2 className="w-4 h-4" /> Return with comment
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PracticalReviewPanel;
