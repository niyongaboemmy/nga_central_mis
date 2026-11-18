import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type Announcements, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { GripHorizontal, Plus } from "lucide-react";
import type { ProjectCard as Card, Status } from "../../api/sideProjects";
import ProjectCardView, { type ProjectCardProps } from "./ProjectCard";
import { EmptyArt, STATUS_META, STATUS_ORDER, statusColor, useIsDark } from "./ui";

type AnyCard = ProjectCardProps["card"];
type Columns = Record<Status, number[]>;

export interface BoardProps {
  cards: AnyCard[];
  onOpen: (id: number) => void;
  /** Resolves true when the server accepted the move (the board keeps it), false to snap back. */
  onMove?: (id: number, to: Status, position: number) => Promise<boolean>;
  onReorder?: (status: Status, ids: number[]) => void;
  onAdd?: (status: Status) => void;
  draggable?: boolean;
  showStudent?: boolean;
}

/** Where the pointer is wins (empty columns included); the keyboard has no pointer, so corners. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const cards = hits.filter((h) => typeof h.id !== "string");
    return cards.length ? cards : hits;
  }
  return closestCorners(args);
};

const columnsOf = (cards: AnyCard[]): Columns => {
  const c: Columns = { IDEA: [], IN_PROGRESS: [], COMPLETED: [] };
  [...cards].sort((a, b) => a.boardPosition - b.boardPosition || b.id - a.id).forEach((x) => c[x.status].push(x.id));
  return c;
};

const SortableCard: React.FC<{ card: AnyCard; onOpen: (id: number) => void; onMove?: (id: number, to: Status) => void; disabled: boolean; showStudent?: boolean }> = ({ card, onOpen, onMove, disabled, showStudent }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  // Pointer and touch drag anywhere on the card; the keyboard drags through the handle, so
  // the card itself stays a plain container (no interactive element nested in another).
  const { onKeyDown, ...pointer } = (listeners ?? {}) as Record<string, any>;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/drag relative touch-manipulation ${isDragging ? "opacity-30" : ""} ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
      {...(disabled ? {} : pointer)}
    >
      <ProjectCardView card={card} onOpen={onOpen} onMove={onMove} showStudent={showStudent} />
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          onKeyDown={onKeyDown}
          aria-roledescription="draggable project"
          aria-label={`Drag ${card.title}`}
          className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-white/90 px-2 py-0.5 text-slate-500 opacity-0 transition focus:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 group-hover/drag:opacity-100 dark:bg-gray-900/90 dark:text-gray-300"
        >
          <GripHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
};

const Column: React.FC<{ status: Status; ids: number[]; byId: Map<number, AnyCard>; children: React.ReactNode; onAdd?: () => void; activeOver: boolean }> = ({ status, ids, children, onAdd, activeOver }) => {
  const dark = useIsDark();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const M = STATUS_META[status];
  const color = statusColor(status, dark);
  const hot = isOver || activeOver;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${M.label} column`}
      className={`flex min-h-[18rem] flex-col rounded-3xl border p-3 transition ${hot ? "border-transparent ring-2" : "border-slate-200/70 dark:border-gray-700/40"} ${M.soft}`}
      style={hot ? ({ ["--tw-ring-color" as any]: color } as React.CSSProperties) : undefined}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white " style={{ backgroundColor: color }}>
            <M.icon className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="text-sm font-bold text-slate-800 dark:text-gray-100">{M.label}</h2>
          <motion.span key={ids.length} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700 dark:bg-gray-800/40 dark:text-gray-200">
            {ids.length}
          </motion.span>
        </div>
        {onAdd && status !== "COMPLETED" && (
          <button type="button" onClick={onAdd} aria-label={`New project in ${M.label}`} className="rounded-full p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:hover:bg-gray-800/60 dark:hover:text-white">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-3">
        {children}
        {ids.length === 0 && (
          <div className={`flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 ${hot ? "border-current" : "border-slate-300/70 dark:border-gray-700/60"}`} style={hot ? { color } : undefined}>
            <EmptyArt icon={M.icon} className="scale-75 opacity-80" />
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * Kanban board (dnd-kit): pointer, touch (press and hold) and keyboard (Space to lift, arrows,
 * Space to drop). Cross-column drops ask the parent, which may open a dialog or be refused by
 * the server — the card snaps back with the reason. Same-column drops just save the order.
 */
const Board: React.FC<BoardProps> = ({ cards, onOpen, onMove, onReorder, onAdd, draggable = true, showStudent }) => {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [cols, setCols] = useState<Columns>(() => columnsOf(cards));
  const [active, setActive] = useState<number | null>(null);
  const origin = useRef<{ status: Status; cols: Columns } | null>(null);

  useEffect(() => {
    if (active === null) setCols(columnsOf(cards));
  }, [cards, active]);

  const colsRef = useRef(cols);
  colsRef.current = cols;
  /** Left/right jump exactly one column (empty columns included); up/down reorder within it. */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const id = Number(args.active);
    const current = STATUS_ORDER.find((s) => colsRef.current[s].includes(id));
    if (!current) return undefined;
    const idx = STATUS_ORDER.indexOf(current) + (event.code === "ArrowRight" ? 1 : -1);
    const target = STATUS_ORDER[idx];
    if (!target) return undefined;
    const rect = args.context.droppableRects.get(`col:${target}`);
    if (!rect) return undefined;
    return { x: rect.left + rect.width / 2 - (args.context.collisionRect?.width ?? 0) / 2, y: rect.top + 64 };
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const containerOf = (id: string | number): Status | null => {
    if (typeof id === "string" && id.startsWith("col:")) return id.slice(4) as Status;
    const n = Number(id);
    return (STATUS_ORDER.find((s) => cols[s].includes(n)) as Status) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = Number(e.active.id);
    setActive(id);
    origin.current = { status: containerOf(id)!, cols };
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active: a, over } = e;
    if (!over) return;
    const from = containerOf(a.id);
    const to = containerOf(over.id);
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const id = Number(a.id);
      const toIds = prev[to];
      const overIdx = typeof over.id === "string" ? toIds.length : toIds.indexOf(Number(over.id));
      return {
        ...prev,
        [from]: prev[from].filter((x) => x !== id),
        [to]: [...toIds.slice(0, overIdx < 0 ? toIds.length : overIdx), id, ...toIds.slice(overIdx < 0 ? toIds.length : overIdx)],
      };
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const start = origin.current;
    setActive(null);
    origin.current = null;
    if (!start) return;
    const to = containerOf(id);
    if (!e.over || !to) {
      setCols(start.cols);
      return;
    }
    let next = cols;
    const overId = e.over.id;
    if (typeof overId !== "string" && Number(overId) !== id && cols[to].includes(Number(overId))) {
      next = { ...cols, [to]: arrayMove(cols[to], cols[to].indexOf(id), cols[to].indexOf(Number(overId))) };
      setCols(next);
    }
    const position = next[to].indexOf(id);
    if (to !== start.status) {
      const ok = onMove ? await onMove(id, to, position) : false;
      if (!ok) {
        setCols(start.cols);
        return;
      }
    }
    onReorder?.(to, next[to]);
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${byId.get(Number(a.id))?.title ?? "project"}`,
    onDragOver: ({ over }) => (over ? `Over ${STATUS_META[containerOf(over.id) ?? "IDEA"].label}` : "Not over a column"),
    onDragEnd: ({ over }) => (over ? `Dropped in ${STATUS_META[containerOf(over.id) ?? "IDEA"].label}` : "Dropped back"),
    onDragCancel: () => "Move cancelled",
  };

  const activeCard = active !== null ? byId.get(active) : null;
  const overStatus = active !== null ? containerOf(active) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => origin.current && (setCols(origin.current.cols), setActive(null))} accessibility={{ announcements }}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <Column key={s} status={s} ids={cols[s]} byId={byId} onAdd={onAdd ? () => onAdd(s) : undefined} activeOver={active !== null && overStatus === s && origin.current?.status !== s}>
            <SortableContext items={cols[s]} strategy={verticalListSortingStrategy}>
              <AnimatePresence initial={false}>
                {cols[s].map((id) => {
                  const c = byId.get(id);
                  if (!c) return null;
                  return (
                    <motion.div key={id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
                      <SortableCard
                        card={c}
                        onOpen={onOpen}
                        disabled={!draggable || c.myRole === "INVITED"}
                        showStudent={showStudent}
                        onMove={
                          draggable && onMove
                            ? async (cid, to) => {
                                const ok = await onMove(cid, to, 0);
                                if (ok) setCols((prev) => ({ ...columnsOf(cards), [to]: [cid, ...prev[to].filter((x) => x !== cid)] } as Columns));
                              }
                            : undefined
                        }
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </SortableContext>
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>{activeCard ? <ProjectCardView card={activeCard as Card} onOpen={() => undefined} dragging showStudent={showStudent} /> : null}</DragOverlay>
    </DndContext>
  );
};

export default Board;
