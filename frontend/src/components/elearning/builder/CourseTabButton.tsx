import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Loader2 } from "lucide-react";
import { builderRoutes, CourseProbe, elearningApi } from "../../../api/elearning";
import { usePermissions } from "../../../hooks/usePermissions";
import { useToast } from "../../../contexts/ToastContext";
import { copy } from "../copy";

/**
 * "Course" entry point on the scheme page (UX plan §3.2 fast path 1): one click sets the
 * course up from the scheme (or opens the existing one). Renders nothing without permission.
 */
const CourseTabButton: React.FC<{ schemeId: number | null | undefined; className?: string }> = ({ schemeId, className = "" }) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();
  const [probe, setProbe] = useState<CourseProbe | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const allowed = hasPermission("MANAGE_COURSE_CONTENT");

  useEffect(() => {
    if (!schemeId || !allowed) return;
    elearningApi
      .probeScheme(schemeId)
      .then((r) => setProbe(r.data.data))
      .catch(() => setProbe(null));
  }, [schemeId, allowed]);

  if (!schemeId || !allowed) return null;

  const open = async () => {
    if (probe) return navigate(builderRoutes.build(probe.course_id));
    setBusy(true);
    try {
      const r = await elearningApi.createFromScheme(schemeId);
      navigate(builderRoutes.build(r.data.data.course.course_id));
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.generic, "error");
    } finally {
      setBusy(false);
    }
  };

  const live = probe?.status === "PUBLISHED";
  return (
    <button
      onClick={open}
      disabled={busy || probe === undefined}
      title={probe ? `${probe.published_sections}/${probe.section_count} weeks live · ${probe.item_count} items` : copy.builder.setUpBody}
      className={`inline-flex items-center gap-2 min-h-[40px] px-3 py-2 text-sm font-medium rounded-full border shadow-sm transition-all disabled:opacity-60 ${
        live
          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100"
          : probe
            ? "text-gray-600 dark:text-gray-300 el-subtle/60 border-gray-200 dark:border-white/10 hover:bg-gray-100"
            : "text-white bg-gradient-to-r from-blue-600 to-indigo-600 border-transparent hover:from-blue-700 hover:to-indigo-700"
      } ${className}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
      <span>{probe === undefined ? "Course" : probe ? `Course · ${live ? copy.builder.published : copy.builder.draft}` : copy.builder.setUp}</span>
    </button>
  );
};

export default CourseTabButton;
