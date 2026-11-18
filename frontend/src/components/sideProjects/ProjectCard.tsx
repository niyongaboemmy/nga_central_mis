import React, { useState } from "react";
import { Github, ExternalLink, Images, MessageCircle, Users, MoreHorizontal, Mail, Target, Timer, PauseCircle } from "lucide-react";
import { fileUrl, type ProjectCard as Card, type Status } from "../../api/sideProjects";
import UserAvatar from "../ui/UserAvatar";
import { CATEGORY_ICON, DocChips, HealthDot, ProgressBar, ReviewBadge, STATUS_META, STATUS_ORDER, dayWord, pathStage, statusColor, timeAgo, useIsDark } from "./ui";

export interface ProjectCardProps {
  card: Card & { student?: { id: number; name: string; regNumber: string | null; avatar: string | null }; class?: { name: string } | null };
  onOpen: (id: number) => void;
  onMove?: (id: number, to: Status) => void;
  dragging?: boolean;
  showStudent?: boolean;
}

/** Days in the current stage and what is left of its window, as one small chip. */
export const StageChip: React.FC<{ card: Pick<Card, "status" | "stage" | "pausedFrom"> }> = ({ card }) => {
  const t = card.stage;
  if (!t || card.status === "COMPLETED") return null;
  if (card.status === "ON_HOLD") {
    const from = STATUS_META[pathStage(card.status, card.pausedFrom)];
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-gray-700/50 dark:text-gray-200" title={`Paused during ${from.label}`}>
        <PauseCircle className="h-3 w-3" aria-hidden />
        {t.daysIn !== null ? `${dayWord(t.daysIn)} paused` : "Paused"} · {from.label}
      </span>
    );
  }
  const over = t.overrunDays > 0;
  const soon = !over && t.daysLeft !== null && t.daysLeft <= 2;
  const cls = over
    ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
    : soon
      ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
      : "bg-slate-100 text-slate-600 dark:bg-gray-700/50 dark:text-gray-300";
  const left = over ? `${dayWord(t.overrunDays)} over` : t.daysLeft !== null ? (t.daysLeft === 0 ? "due today" : `${dayWord(t.daysLeft)} left`) : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`} title={`${dayWord(t.daysIn ?? 0)} in ${STATUS_META[card.status].label}${t.plannedEnd ? `, planned to end ${t.plannedEnd}` : ""}`}>
      <Timer className="h-3 w-3" aria-hidden />
      {t.daysIn !== null ? `Day ${t.daysIn + 1}` : STATUS_META[card.status].label}
      {left && <span className="font-medium">· {left}</span>}
    </span>
  );
};

/** The stages a card's menu offers: not where it is, never Completed while paused, never pause a finished one. */
export const moveTargets = (status: Status) =>
  STATUS_ORDER.filter((s) => s !== status && !(status === "ON_HOLD" && s === "COMPLETED") && !(status === "COMPLETED" && s === "ON_HOLD"));

/** One project on a board: cover, identity, progress and what's attached, as glyphs. */
const ProjectCardView: React.FC<ProjectCardProps> = ({ card, onOpen, onMove, dragging, showStudent }) => {
  const dark = useIsDark();
  const [menu, setMenu] = useState(false);
  const CatIcon = CATEGORY_ICON[card.category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
  const stage = pathStage(card.status, card.pausedFrom);
  const accent = card.category?.color ?? statusColor(stage, dark);
  const invited = card.myRole === "INVITED";
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white text-left transition dark:bg-gray-800/40 ${
        dragging ? "rotate-[1.5deg] scale-[1.02] border-brand-400 " : "border-slate-200/80 hover:-translate-y-0.5 dark:border-gray-700/40"
      } ${invited ? "ring-2 ring-dashed ring-blue-300" : ""}`}
    >
      <button type="button" onClick={() => onOpen(card.id)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30" aria-label={`Open ${card.title}`}>
        <div className="relative h-24 w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}0d)` }}>
          {card.coverAssetId ? (
            <img src={fileUrl(card.coverAssetId, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <CatIcon className="h-10 w-10 opacity-70" style={{ color: accent }} aria-hidden />
            </div>
          )}
          <div className="absolute left-2 top-2 flex gap-1">
            {card.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 backdrop-blur dark:bg-gray-900/80 dark:text-gray-100">
                <CatIcon className="h-3 w-3" style={{ color: card.category.color }} aria-hidden />
                {card.category.name}
              </span>
            )}
          </div>
          <div className="absolute right-2 top-2 flex gap-1">
            <ReviewBadge state={card.reviewState} compact />
            {invited && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                <Mail className="h-3 w-3" aria-hidden /> Invite
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-800 dark:text-white">{card.title}</h3>
            <HealthDot health={card.health} />
          </div>
          {showStudent && card.student && (
            <div className="flex items-center gap-1.5">
              <UserAvatar name={card.student.name} src={card.student.avatar} userId={card.student.id} size={20} decorative />
              <span className="truncate text-xs text-slate-600 dark:text-gray-300">{card.student.name}</span>
              {card.class && <span className="truncate text-[10px] text-slate-500 dark:text-gray-400">· {card.class.name}</span>}
            </div>
          )}
          {card.techTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.techTags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-gray-700/50 dark:text-gray-300">
                  {t}
                </span>
              ))}
              {card.techTags.length > 3 && <span className="text-[10px] text-slate-500">+{card.techTags.length - 3}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <ProgressBar value={card.progress} color={statusColor(stage, dark)} />
            <span className="w-8 text-right text-[11px] font-bold tabular-nums text-slate-600 dark:text-gray-300">{card.progress}%</span>
          </div>
          <div className="flex items-center justify-between">
            <DocChips docs={card.docs} pending={card.conceptPending} />
            <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400">
              {card.milestones.total > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]" title="Milestones done">
                  <Target className="h-3.5 w-3.5" aria-hidden />
                  {card.milestones.done}/{card.milestones.total}
                </span>
              )}
              {card.githubUrl && <Github className="h-3.5 w-3.5 text-slate-600 dark:text-gray-300" aria-label="GitHub" />}
              {card.accessUrl && <ExternalLink className="h-3.5 w-3.5 text-slate-600 dark:text-gray-300" aria-label="Live link" />}
              {card.mediaCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]" title="Files">
                  <Images className="h-3.5 w-3.5" aria-hidden />
                  {card.mediaCount}
                </span>
              )}
              {card.commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]" title="Feedback">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  {card.commentCount}
                </span>
              )}
              {card.memberCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px]" title="Team">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {card.memberCount + 1}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pr-7">
            <StageChip card={card} />
            <span className="text-[10px] text-slate-500 dark:text-gray-400">{timeAgo(card.lastActivityAt)}</span>
          </div>
        </div>
      </button>
      {onMove && !invited && (
        <div className="absolute bottom-2 right-2">
          <button
            type="button"
            aria-label={`Move ${card.title}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={(e) => {
              e.stopPropagation();
              setMenu((m) => !m);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700/50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div role="menu" className="absolute bottom-8 right-0 z-20 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-gray-700/60 dark:bg-gray-800" onPointerDown={(e) => e.stopPropagation()}>
              {moveTargets(card.status).map((s) => {
                const M = STATUS_META[s];
                return (
                  <button
                    key={s}
                    role="menuitem"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(false);
                      onMove(card.id, s);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50"
                  >
                    <M.icon className="h-4 w-4" style={{ color: statusColor(s, dark) }} aria-hidden />
                    {s === "ON_HOLD" ? "Put on hold" : card.status === "ON_HOLD" ? `Resume in ${M.label}` : M.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectCardView;
