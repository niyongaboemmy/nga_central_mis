import React from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  GraduationCap,
  Layers,
  ArrowRight,
  Loader2,
} from "lucide-react";

export interface SubjectItemGrade {
  key: string;
  grade_name: string;
  class_group_name: string;
  academic_year_name?: string;
  badge?: { label: string; tone: "success" | "danger" } | null;
  belowContent?: React.ReactNode;
  onInfoClick?: () => void;
  /** When provided, this grade chip becomes its own clickable target (e.g. navigate to that class's calendar). */
  onClick?: () => void;
  isNavigating?: boolean;
}

export interface SubjectItemCardProps {
  subjectName: string;
  subjectCode?: string | null;
  grades: SubjectItemGrade[];
  /** Whole-row click. Ignored when any grade chip is individually clickable, to avoid nested buttons. */
  onCardClick?: () => void;
  isCardNavigating?: boolean;
  /** Right-aligned meta (e.g. class count, year). */
  rightMeta?: React.ReactNode;
  animationVariants?: Record<string, any>;
}

const badgeClasses = (tone: "success" | "danger") =>
  tone === "success"
    ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800"
    : "bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800";

const SubjectItemCard: React.FC<SubjectItemCardProps> = ({
  subjectName,
  subjectCode,
  grades,
  onCardClick,
  isCardNavigating,
  rightMeta,
  animationVariants,
}) => {
  const anyGradeClickable = grades.some((g) => !!g.onClick);
  const cardClickable = !!onCardClick && !anyGradeClickable;
  const Container: any = cardClickable ? motion.button : motion.div;
  const belowItems = grades.filter((g) => g.belowContent);

  return (
    <Container
      layout
      variants={animationVariants}
      exit={{ opacity: 0 }}
      onClick={cardClickable ? onCardClick : undefined}
      aria-disabled={cardClickable ? isCardNavigating : undefined}
      className={`group w-full text-left flex flex-col sm:flex-row sm:items-center gap-4 bg-white dark:bg-gray-800/30 dark:backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700/20 p-4 hover:border-blue-300 dark:hover:border-blue-600/60 hover:shadow-md transition-all duration-200 ${
        cardClickable ? `cursor-pointer ${isCardNavigating ? "opacity-60 cursor-wait" : ""}` : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
          {isCardNavigating ? (
            <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
          ) : (
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
              {subjectName}
            </h3>
            {subjectCode && (
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/40 px-1.5 py-0.5 rounded">
                {subjectCode}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-0">
          {grades.map((grade) => {
            const clickable = !!grade.onClick;
            const Tag: any = clickable ? "button" : "span";
            return (
              <Tag
                key={grade.key}
                {...(clickable
                  ? {
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        grade.onClick!();
                      },
                      disabled: grade.isNavigating,
                    }
                  : {})}
                className={`flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700/30 px-2 py-1 rounded-lg ${
                  clickable
                    ? "hover:border-blue-300 dark:hover:border-blue-600/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-60 disabled:cursor-wait"
                    : ""
                }`}
              >
                {grade.isNavigating ? (
                  <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" />
                ) : (
                  <GraduationCap className="w-3 h-3 flex-shrink-0" />
                )}
                {grade.grade_name}
                <span className="text-gray-400 dark:text-gray-500">•</span>
                {grade.class_group_name}
                {grade.badge && (
                  <span
                    className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-tighter border ${badgeClasses(
                      grade.badge.tone,
                    )}`}
                  >
                    {grade.badge.label}
                  </span>
                )}
                {grade.onInfoClick && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      grade.onInfoClick!();
                    }}
                    className="ml-0.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title="View Status Details"
                  >
                    <Layers className="w-3 h-3" />
                  </span>
                )}
              </Tag>
            );
          })}
        </div>

        {belowItems.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {belowItems.map((g) => (
              <div key={g.key}>{g.belowContent}</div>
            ))}
          </div>
        )}
      </div>

      {rightMeta && (
        <div className="flex items-center gap-3 flex-shrink-0 sm:pl-2">
          {rightMeta}
          {cardClickable && (
            <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
      )}
    </Container>
  );
};

export default SubjectItemCard;
