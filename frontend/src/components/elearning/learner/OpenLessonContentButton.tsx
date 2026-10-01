import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { elearningApi, learnerRoutes } from "../../../api/elearning";
import { usePermissions } from "../../../hooks/usePermissions";

/**
 * Timetable slot → the course week that covers that date ("one click from today to content",
 * plan §3.7). Renders nothing unless the student can open a matching published week.
 */
const OpenLessonContentButton: React.FC<{ subjectId?: number | null; classGroupId?: number | null; date?: Date | null; className?: string }> = ({ subjectId, classGroupId, date, className = "" }) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [target, setTarget] = useState<{ course_id: number; section_id: number; title: string } | null>(null);
  const allowed = hasPermission("VIEW_MY_COURSES");

  useEffect(() => {
    setTarget(null);
    if (!allowed || !subjectId || !classGroupId) return;
    const d = date || new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    elearningApi
      .sectionForDate(subjectId, classGroupId, iso)
      .then((r) => setTarget(r.data.data))
      .catch(() => setTarget(null));
  }, [allowed, subjectId, classGroupId, date]);

  if (!target) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(learnerRoutes.course(target.course_id, target.section_id))}
      title={target.title}
      className={`px-5 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-sm transition-all flex items-center gap-2 ${className}`}
    >
      <GraduationCap className="w-4 h-4" /> Open lesson content
    </button>
  );
};

export default OpenLessonContentButton;
