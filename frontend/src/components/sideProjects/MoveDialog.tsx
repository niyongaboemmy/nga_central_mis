import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Github, Image as ImageIcon, Undo2, Wrench } from "lucide-react";
import type { Status } from "../../api/sideProjects";
import { Field, FormModal, TextArea } from "./form";
import { STATUS_META, STATUS_SOLID, Spinner, primaryBtn, secondaryBtn, statusColor, useIsDark } from "./ui";

/**
 * Asked when a move needs words: completing (outcome, with nudges for a link and a
 * screenshot), pausing (reason), reopening a completed project (reason) or a staff
 * correction (reason).
 */
export const MoveDialog: React.FC<{
  open: { to: Status; from: Status; title: string; hasLink: boolean; hasImage: boolean; correction?: boolean } | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (payload: { outcomeSummary?: string; reason?: string }) => void;
}> = ({ open, busy, error, onCancel, onConfirm }) => {
  const dark = useIsDark();
  const [text, setText] = useState("");
  useEffect(() => setText(""), [open?.to, open?.title]);
  const completing = !!open && open.to === "COMPLETED" && !open.correction;
  const pausing = !!open && open.to === "ON_HOLD" && !open.correction;
  const min = completing ? 20 : 5;
  const max = completing ? 3000 : 500;
  const ok = text.trim().length >= min;
  const to = open?.to ?? "IN_PROGRESS";
  const from = open?.from ?? "IDEA";
  const T = STATUS_META[to];
  const F = STATUS_META[from];

  return (
    <FormModal
      open={!!open}
      onClose={onCancel}
      busy={busy}
      size="md"
      icon={open?.correction ? Wrench : T.icon}
      tone={[STATUS_SOLID[to], statusColor(to, dark)]}
      title={completing ? "Complete the project" : pausing ? "Put the project on hold" : open?.correction ? "Correct the status" : "Reopen the project"}
      subtitle={open?.title}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} disabled={!ok || busy} onClick={() => onConfirm(completing ? { outcomeSummary: text.trim() } : { reason: text.trim() })} style={ok ? { backgroundColor: STATUS_SOLID[to] } : undefined}>
            {busy ? <Spinner className="h-4 w-4" /> : <T.icon className="h-4 w-4" />}
            {pausing ? "Pause" : T.label}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* From → to, as a small flow graphic */}
        <div className="flex items-center justify-center gap-3" aria-label={`${F.label} to ${T.label}`}>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${F.soft} ${F.text} ${F.ring}`}>
            <F.icon className="h-3.5 w-3.5" aria-hidden /> {F.label}
          </span>
          <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} className="text-slate-400">
            <ArrowRight className="h-4 w-4" aria-hidden />
          </motion.span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white " style={{ backgroundColor: STATUS_SOLID[to] }}>
            <T.icon className="h-3.5 w-3.5" aria-hidden /> {T.label}
          </span>
        </div>

        {completing && open && (
          <div className="grid grid-cols-2 gap-2">
            {([
              [open.hasLink, Github, "Link added", "Add a GitHub or live link"],
              [open.hasImage, ImageIcon, "Screenshot added", "Add a screenshot"],
            ] as const).map(([done, Icon, yes, no]) => (
              <div key={yes} className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${done ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? "bg-emerald-500 text-white" : "bg-amber-400 text-white"}`}>{done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}</span>
                {done ? yes : no}
              </div>
            ))}
          </div>
        )}

        <Field label={completing ? "What did it achieve?" : "Why?"} htmlFor="move-text" counter={{ value: text, min, max }} error={error} hint={completing ? "Who used it, what works, what you learned." : pausing ? "The clock of this stage stops while it is paused." : undefined}>
          <TextArea id="move-text" data-autofocus rows={completing ? 4 : 3} value={text} onChange={(e) => setText(e.target.value)} invalid={!!error} placeholder={completing ? "It now waters the garden on its own and logs moisture every hour…" : pausing ? "Waiting for the sensors to arrive / exams week…" : "Explain the change in one or two sentences"} />
        </Field>
      </div>
    </FormModal>
  );
};

export default MoveDialog;
