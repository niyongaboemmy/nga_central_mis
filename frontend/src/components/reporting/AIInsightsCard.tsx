import React, { useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { mentorshipApi, MenteeAIInsights } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  studentId: number;
}

const AIInsightsCard: React.FC<Props> = ({ studentId }) => {
  const { showToast } = useToast();
  const [insights, setInsights] = useState<MenteeAIInsights | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.generateMenteeAIInsights(studentId);
      const data = (res as any).data?.data ?? (res as any).data;
      setInsights(data ?? null);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? "Failed to generate AI insights", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 rounded-2xl p-5 border border-violet-100 dark:border-violet-900/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">AI Insights</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-full transition-colors"
        >
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {insights ? "Regenerate" : "Generate"}
        </button>
      </div>

      {!insights && !loading && (
        <p className="text-xs text-violet-600/70 dark:text-violet-400/70">
          Ask AI to summarize this mentee's recent sessions, grades, and check-ins into a quick briefing.
        </p>
      )}

      {loading && (
        <p className="text-xs text-violet-600/70 dark:text-violet-400/70">Analyzing mentorship history...</p>
      )}

      {insights && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">{insights.summary}</p>

          {insights.strengths.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3" />
                Strengths
              </p>
              <ul className="space-y-0.5">
                {insights.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400">• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {insights.concerns.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3" />
                Concerns
              </p>
              <ul className="space-y-0.5">
                {insights.concerns.map((c, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400">• {c}</li>
                ))}
              </ul>
            </div>
          )}

          {insights.recommended_focus && (
            <div className="bg-white/60 dark:bg-gray-900/30 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-1 mb-0.5">
                <Target className="w-3 h-3" />
                Recommended Focus
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300">{insights.recommended_focus}</p>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            Based on {insights.based_on_sessions} recent session{insights.based_on_sessions !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
};

export default AIInsightsCard;
