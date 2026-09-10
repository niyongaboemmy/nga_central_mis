import React, { useCallback, useState } from "react";
import type { CalendarSlot } from "../../api/calendar";
import { getSlotColor } from "./slotColor";

export const instructorOf = (slot: CalendarSlot): string =>
  [slot.instructor_name, slot.instructor_lastname].filter(Boolean).join(" ");

export interface SlotTooltipState {
  slot: CalendarSlot;
  x: number;
  y: number;
}

/**
 * Hover/focus detail for a lesson.
 *
 * Cells are narrow and truncate the subject, so the untruncated subject name
 * and the class group are the whole point of this: `title` can't be styled,
 * can't be opened from the keyboard, and takes a second to appear.
 */
export const useSlotTooltip = () => {
  const [tooltip, setTooltip] = useState<SlotTooltipState | null>(null);

  const show = useCallback((slot: CalendarSlot, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTooltip({ slot, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);

  return { tooltip, show, hide };
};

const SlotTooltip: React.FC<{ state: SlotTooltipState | null }> = ({
  state,
}) => {
  if (!state) return null;
  const { slot } = state;
  const instructor = instructorOf(slot);
  const color = getSlotColor(slot);

  return (
    <div
      role="tooltip"
      // Fixed to the viewport: the grid scrolls horizontally, and a tooltip
      // positioned inside that container would be clipped by its overflow.
      style={{ left: state.x, top: state.y - 8 }}
      className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-none max-w-xs rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-200"
    >
      <div className="flex items-center gap-1.5 font-semibold leading-snug text-gray-900 dark:text-white">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        {slot.subject_name}
      </div>
      {slot.subject_code && (
        <div className="text-gray-400 dark:text-gray-500">
          {slot.subject_code}
        </div>
      )}
      {slot.class_group_name && (
        <div className="mt-1 text-gray-600 dark:text-gray-300">
          {slot.class_group_name}
        </div>
      )}
      <div className="text-gray-500 dark:text-gray-400 tabular-nums">
        {slot.start_time} - {slot.end_time}
      </div>
      {instructor && (
        <div className="text-gray-500 dark:text-gray-400">{instructor}</div>
      )}
      {slot.location && (
        <div className="text-gray-400 dark:text-gray-500">📍 {slot.location}</div>
      )}
      {slot.notes && (
        <div className="mt-1 text-gray-400 dark:text-gray-500 italic">
          {slot.notes}
        </div>
      )}
    </div>
  );
};

export default SlotTooltip;
