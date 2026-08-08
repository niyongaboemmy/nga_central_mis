import React, { useEffect, useState } from "react";
import { Clock, AlertCircle, MessageCircle, Download, RefreshCw } from "lucide-react";
import { mentorshipApi } from "../../api/mentorship";
import { MentorshipReportService } from "../../services/MentorshipReportService";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useUser } from "../../contexts/UserContext";
import { useToast } from "../../contexts/ToastContext";

const WELLBEING_ORDER = ["STRUGGLING", "CONCERNED", "NEUTRAL", "GOOD", "EXCELLENT"];
const WELLBEING_COLOR: Record<string, string> = {
  STRUGGLING: "bg-red-500",
  CONCERNED: "bg-orange-500",
  NEUTRAL: "bg-gray-400",
  GOOD: "bg-blue-500",
  EXCELLENT: "bg-green-500",
};

interface Props {
  schoolName?: string;
}

const MentorshipDashboardWidgets: React.FC<Props> = ({ schoolName = "NGA MIS" }) => {
  const { selectedYearId, selectedYear } = useAcademicPeriod();
  const { user } = useUser();
  const { showToast } = useToast();

  const [overdueCount, setOverdueCount] = useState(0);
  const [wellbeingCounts, setWellbeingCounts] = useState<Record<string, number>>({});
  const [checkInCounts, setCheckInCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const instructorName =
    user?.profile?.first_name && user?.profile?.last_name
      ? `${user.profile.first_name} ${user.profile.last_name}`
      : user?.user?.username ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      mentorshipApi.getAssignedStudents(selectedYearId ?? undefined),
      mentorshipApi.getCheckInInbox(),
    ])
      .then(([studentsRes, checkinsRes]) => {
        if (cancelled) return;
        const students = (studentsRes as any).data?.data ?? (studentsRes as any).data ?? [];
        const checkins = (checkinsRes as any).data?.data ?? (checkinsRes as any).data ?? [];

        setOverdueCount(Array.isArray(students) ? students.filter((s: any) => s.overdue).length : 0);

        const wb: Record<string, number> = {};
        (Array.isArray(students) ? students : []).forEach((s: any) => {
          if (s.wellbeing_status) wb[s.wellbeing_status] = (wb[s.wellbeing_status] ?? 0) + 1;
        });
        setWellbeingCounts(wb);

        const ci: Record<string, number> = {};
        (Array.isArray(checkins) ? checkins : []).forEach((c: any) => {
          ci[c.status] = (ci[c.status] ?? 0) + 1;
        });
        setCheckInCounts(ci);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedYearId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await mentorshipApi.getConsolidatedReport({
        academic_year_id: selectedYearId ?? undefined,
      });
      const report = (res as any).data?.data ?? (res as any).data;
      if (!report || report.mentees.length === 0) {
        showToast("No mentees assigned yet — nothing to generate", "error");
        return;
      }
      MentorshipReportService.download(report, {
        schoolName,
        academicYearName: selectedYear?.name ?? "",
        generatedBy: instructorName,
      });
      showToast("Consolidated report downloaded", "success");
    } catch {
      showToast("Failed to generate consolidated report", "error");
    } finally {
      setDownloading(false);
    }
  };

  const totalWellbeing = Object.values(wellbeingCounts).reduce((a, b) => a + b, 0);
  const newCheckIns = checkInCounts["NEW"] ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center text-gray-400 py-24">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading mentorship analytics...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Generating..." : "Download My Consolidated Report"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
          <div className="flex items-center gap-2 text-orange-500 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Overdue Mentees</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white">{overdueCount}</p>
          <p className="text-xs text-gray-400 mt-1">No session in 21+ days</p>
        </div>

        <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
          <div className="flex items-center gap-2 text-blue-500 mb-2">
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Open Check-ins</span>
          </div>
          <p className="text-3xl font-black text-gray-900 dark:text-white">{newCheckIns}</p>
          <p className="text-xs text-gray-400 mt-1">
            {checkInCounts["ACKNOWLEDGED"] ?? 0} acknowledged · {checkInCounts["ADDRESSED"] ?? 0} addressed
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
          <div className="flex items-center gap-2 text-purple-500 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Wellbeing Distribution</span>
          </div>
          {totalWellbeing === 0 ? (
            <p className="text-xs text-gray-400 mt-2">No wellbeing data logged yet</p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {WELLBEING_ORDER.filter((k) => wellbeingCounts[k]).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20">{k}</span>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${WELLBEING_COLOR[k]}`}
                      style={{ width: `${(wellbeingCounts[k] / totalWellbeing) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-4 text-right">{wellbeingCounts[k]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MentorshipDashboardWidgets;
