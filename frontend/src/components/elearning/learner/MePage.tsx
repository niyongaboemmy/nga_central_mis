import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flame } from "lucide-react";
import { apiService } from "../../../services/api";
import { learnerRoutes } from "../../../api/elearning";
import { useUser } from "../../../contexts/UserContext";
import { copy } from "../copy";
import Mascot from "../ui/Mascot";
import { EmptyState, ProgressBar, Skeleton } from "../ui/primitives";
import { useLearningPrefs } from "./useLearningPrefs";

interface MasteryCriterion {
  criteria_id: number;
  criteria_number: string;
  description: string;
  state: "NOT_COVERED" | "COVERED" | "DEMONSTRATED";
}
interface MasteryElement {
  competency_id: number;
  element_number: number;
  title: string;
  criteria: MasteryCriterion[];
  covered: number;
  demonstrated: number;
  total: number;
}
interface MasterySubject {
  subject_id: number;
  subject_name: string;
  color: string | null;
  elements: MasteryElement[];
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-center justify-between gap-4 min-h-[48px] py-2 cursor-pointer">
    <span>
      <span className="block text-sm text-gray-800 dark:text-gray-100">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 dark:text-gray-400">{hint}</span>}
    </span>
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-pill transition-colors flex-shrink-0 ${checked ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  </label>
);

/** `/my-learning/me` — mastery per subject (Phase 4 API), prefs, streak (opt-in). */
const MePage: React.FC = () => {
  const { user } = useUser();
  const { prefs, update } = useLearningPrefs();
  const [mastery, setMastery] = useState<MasterySubject[] | null | undefined>(undefined);
  const [streak, setStreak] = useState<{ weeks: number; this_week: boolean } | null>(null);

  useEffect(() => {
    apiService
      .get("/elearning/my/mastery")
      .then((r) => setMastery(r.data.data))
      .catch(() => setMastery(null));
    apiService
      .get("/elearning/my/streak")
      .then((r) => setStreak(r.data.data))
      .catch(() => setStreak(null));
  }, []);

  const firstName = (user as any)?.profile?.first_name as string | undefined;

  return (
    <div className="pt-6 pb-16 max-w-3xl">
      <Link to={learnerRoutes.home} className="inline-flex items-center gap-1 min-h-[40px] text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" /> {copy.home.title}
      </Link>
      <div className="mt-2 flex items-center gap-4">
        <Mascot pose="book" size={56} />
        <div>
          <h1 className="text-display text-gray-900 dark:text-white">{firstName || copy.me.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{copy.me.masteryBody}</p>
        </div>
      </div>

      {prefs.streak_enabled && streak && (
        <div className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-pill bg-accent-100 text-accent-600 text-sm font-semibold">
          <Flame className="w-4 h-4" /> {streak.weeks} week{streak.weeks === 1 ? "" : "s"} in a row{streak.this_week ? "" : " · keep it going this week"}
        </div>
      )}

      {/* Mastery */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{copy.me.mastery}</h2>
        {mastery === undefined ? (
          <div className="mt-3 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : !mastery || mastery.length === 0 ? (
          <div className="mt-3"><EmptyState pose="sleepy" title="Nothing to show yet" body="Finish a few items and your mastery will appear here." /></div>
        ) : (
          <div className="mt-3 space-y-4">
            {mastery.map((s) => (
              <div key={s.subject_id} className="el-card p-4">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.subject_name}</p>
                <ul className="mt-3 space-y-3">
                  {s.elements.map((e) => (
                    <li key={e.competency_id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] text-gray-700 dark:text-gray-200 truncate">
                          <span className="font-semibold">Element {e.element_number}</span> · {e.title}
                        </p>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">{e.demonstrated}/{e.total} shown</span>
                      </div>
                      <ProgressBar value={e.total ? ((e.covered + e.demonstrated) / e.total) * 100 : 0} color={s.color || undefined} className="mt-1.5" ariaLabel={copy.me.shown(e.demonstrated, e.total, `Element ${e.element_number}`)} />
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Criteria">
                        {e.criteria.map((c) => (
                          <li
                            key={c.criteria_id}
                            title={`${c.criteria_number} ${c.description} — ${c.state === "DEMONSTRATED" ? copy.me.demonstrated : c.state === "COVERED" ? copy.me.covered : copy.me.notCovered}`}
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              c.state === "DEMONSTRATED"
                                ? "el-chip-success"
                                : c.state === "COVERED"
                                  ? "el-chip-brand"
                                  : "el-chip text-gray-400"
                            }`}
                          >
                            {c.criteria_number}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="mt-8 el-card p-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{copy.me.prefs}</h2>
        <div className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.06]">
          <Toggle checked={prefs.celebrations_enabled} onChange={(v) => update({ celebrations_enabled: v })} label={copy.me.celebrations} />
          <Toggle checked={prefs.streak_enabled} onChange={(v) => update({ streak_enabled: v })} label={copy.me.streak} hint="Personal only — nobody else sees it. One rest day a week is fine." />
          <Toggle checked={!!prefs.reduced_motion} onChange={(v) => update({ reduced_motion: v })} label={copy.me.reducedMotion} hint="Fades instead of movement; no confetti." />
        </div>
      </section>
    </div>
  );
};

export default MePage;
