import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  GraduationCap,
  LayoutGrid,
  Loader2,
  Plus,
} from "lucide-react";
import {
  builderRoutes,
  elearningApi,
  learnerRoutes,
} from "../../api/elearning";
import usePermissions from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

// ─── Jump from a subject to its e-learning course ───────────────────────────
//
// The subject page and the course are the same material seen from two angles,
// and there was no way across: a teacher looking at a subject had to go to
// E-Learning and find it again by name, and a student the same through My
// Learning.
//
// There is no "course for this subject" endpoint, and adding one would be a
// third way of answering a question two existing endpoints already answer for
// the caller's own role — so this filters the caller's own course list rather
// than asking the server a new question. A teacher sees the courses they
// build; a student sees the courses they are enrolled in. Neither can learn
// anything about the other from it.
// ─────────────────────────────────────────────────────────────────────────────

interface Target {
  course_id: number;
  class_group_name: string;
  to: string;
}

const SubjectElearningLink: React.FC<{ subjectId: number }> = ({
  subjectId,
}) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canBuild = hasPermission(Permissions.MANAGE_COURSE_CONTENT);
  const canLearn = hasPermission(Permissions.VIEW_MY_COURSES);

  const [targets, setTargets] = useState<Target[] | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canBuild && !canLearn) {
      setTargets([]);
      return;
    }
    let cancelled = false;

    const load = canBuild
      ? elearningApi.myBuiltCourses().then((r) =>
          (r.data.data || [])
            .filter((c: any) => c.subject_id === subjectId)
            .map((c: any) => ({
              course_id: c.course_id,
              class_group_name: c.class_group_name,
              to: builderRoutes.build(c.course_id),
            })),
        )
      : elearningApi.myCourses().then((r) =>
          (r.data.data || [])
            .filter((c: any) => c.subject_id === subjectId)
            .map((c: any) => ({
              course_id: c.course_id,
              class_group_name: c.class_group_name,
              to: learnerRoutes.course(c.course_id),
            })),
        );

    load
      .then((rows) => {
        if (!cancelled) setTargets(rows);
      })
      .catch(() => {
        // A missing course list must not break the subject page it sits on.
        if (!cancelled) setTargets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId, canBuild, canLearn]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = useMemo(
    () => (canBuild ? "Open e-learning" : "Go to my learning"),
    [canBuild],
  );

  if (!canBuild && !canLearn) return null;

  if (targets === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </span>
    );
  }

  // A teacher with no course yet gets the way to make one; a student with no
  // course simply has nothing to go to, so nothing is offered.
  if (targets.length === 0) {
    if (!canBuild) return null;
    return (
      <button
        onClick={() => navigate(builderRoutes.list)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-800/60 dark:hover:text-blue-400"
      >
        <Plus className="h-4 w-4" />
        Build a course
      </button>
    );
  }

  if (targets.length === 1) {
    return (
      <button
        onClick={() => navigate(targets[0].to)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        {canBuild ? (
          <LayoutGrid className="h-4 w-4" />
        ) : (
          <GraduationCap className="h-4 w-4" />
        )}
        {label}
      </button>
    );
  }

  // The same subject taught to two class groups is two separate courses, so
  // one button would have to guess which. It asks instead.
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        {canBuild ? (
          <LayoutGrid className="h-4 w-4" />
        ) : (
          <GraduationCap className="h-4 w-4" />
        )}
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {targets.map((t) => (
            <button
              key={t.course_id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(t.to);
              }}
              className="block w-full truncate px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              {t.class_group_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectElearningLink;
