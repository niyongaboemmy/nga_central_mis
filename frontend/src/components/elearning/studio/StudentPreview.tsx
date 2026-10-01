import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Maximize2, Monitor, Smartphone } from "lucide-react";
import type { Blueprint } from "../../../api/studio";
import Modal from "../../ui/Modal";
import { useMotion } from "../../../design/motion";
import { PhonePreview } from "./RecipeBuilder";
import { previewBlocks } from "./studioModel";

/**
 * What a student gets from the recipe, on a phone or on a computer. Students use both (lab
 * desktops at school, phones at home), so the teacher can switch, and enlarge either to read
 * it at real size. The chosen device is remembered on this browser only.
 */

type Device = "phone" | "desktop";
const KEY = "elearning.studioPreviewDevice";
const readDevice = (): Device => {
  try {
    return localStorage.getItem(KEY) === "desktop" ? "desktop" : "phone";
  } catch {
    return "phone";
  }
};

interface PreviewProps {
  blueprint: Blueprint;
  title: string;
  week?: string | null;
  features?: { flashcards: boolean; exit_ticket: boolean };
  /** Course name for the desktop window's header. */
  course?: string;
  /** A few neighbouring week labels for the desktop sidebar. */
  weekLabels?: string[];
}

/** The course page on a computer: a browser window, the weeks on the left, this week's blocks in a grid. */
export const DesktopPreview: React.FC<PreviewProps & { large?: boolean }> = ({ blueprint, title, week, features, course, weekLabels = [], large }) => {
  const blocks = previewBlocks(blueprint, features);
  const m = useMotion();
  const t = large ? { label: "text-sm", detail: "text-xs", title: "text-xl", side: "text-xs", pad: "p-5", gap: "gap-3" } : { label: "text-[11px]", detail: "text-[10px]", title: "text-sm", side: "text-[10px]", pad: "p-2.5", gap: "gap-1.5" };
  const sideWeeks = weekLabels.length ? weekLabels : [week || "This week"];
  return (
    <div className={`mx-auto w-full ${large ? "max-w-[960px] min-w-[720px]" : "max-w-[300px]"} rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-[#0b0b0f] shadow-soft overflow-hidden`} aria-label="Preview of a week on a student's computer">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-white/[0.06] border-b border-gray-200 dark:border-white/10" aria-hidden>
        <span className="w-2 h-2 rounded-full bg-danger-500/70" />
        <span className="w-2 h-2 rounded-full bg-warning-500/70" />
        <span className="w-2 h-2 rounded-full bg-success-500/70" />
        <span className={`ml-2 flex-1 truncate rounded-md bg-white dark:bg-white/10 px-2 py-0.5 ${large ? "text-xs" : "text-[9px]"} text-slate-600 dark:text-slate-300`}>mis.amashuri.com/my-learning</span>
      </div>
      <div className={`grid ${large ? "grid-cols-[200px_1fr] min-h-[460px]" : "grid-cols-[72px_1fr] min-h-[260px]"}`}>
        {/* Weeks sidebar */}
        <aside className={`border-r border-gray-100 dark:border-white/[0.07] ${large ? "p-3" : "p-1.5"} space-y-1`} aria-hidden>
          {course && <p className={`${t.side} font-semibold text-gray-900 dark:text-white truncate mb-1`}>{course}</p>}
          {sideWeeks.map((w) => {
            const on = w === (week || "This week");
            return (
              <p key={w} className={`${t.side} truncate rounded-md px-1.5 py-1 flex items-center gap-1 ${on ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-200 font-semibold" : "text-slate-600 dark:text-slate-300"}`}>
                {on ? <Circle className="w-2.5 h-2.5 flex-shrink-0" /> : <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" />}
                {w}
              </p>
            );
          })}
        </aside>
        {/* This week */}
        <div className={t.pad}>
          <p className={`${large ? "text-xs" : "text-[9px]"} uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300`}>{week || "This week"}</p>
          <p className={`${t.title} font-bold text-gray-900 dark:text-white leading-snug`}>{title}</p>
          <ul className={`mt-2 grid ${large ? "grid-cols-2" : "grid-cols-1"} ${t.gap}`}>
            <AnimatePresence initial={false}>
              {blocks.map((blk) => (
                <motion.li key={blk.key} layout {...m("reveal")} className={`rounded-lg el-subtle ${large ? "p-3" : "p-1.5"} ${blk.key === "lesson" && large ? "col-span-2" : ""}`}>
                  <p className={`${t.label} font-semibold text-gray-900 dark:text-white`}>{blk.label}</p>
                  <p className={`${t.detail} text-slate-600 dark:text-slate-300`}>{blk.detail}</p>
                  {large && (
                    <div className="mt-2 space-y-1" aria-hidden>
                      <div className="h-1.5 rounded bg-gray-200 dark:bg-white/10 w-full" />
                      <div className="h-1.5 rounded bg-gray-200 dark:bg-white/10 w-3/4" />
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
            {blocks.length === 0 && <li className={`${t.detail} text-slate-600 dark:text-slate-300`}>Turn on at least one block.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

const DeviceSwitch: React.FC<{ device: Device; onChange: (d: Device) => void }> = ({ device, onChange }) => (
  <div className="el-segment inline-flex text-xs" role="radiogroup" aria-label="Preview device">
    {([
      ["phone", "Phone", Smartphone],
      ["desktop", "Desktop", Monitor],
    ] as [Device, string, React.ElementType][]).map(([d, label, Icon]) => (
      <button key={d} role="radio" aria-checked={device === d} onClick={() => onChange(d)} className={`inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg font-medium ${device === d ? "el-segment-on" : "text-slate-600 dark:text-slate-300"}`}>
        <Icon className="w-3.5 h-3.5" aria-hidden /> {label}
      </button>
    ))}
  </div>
);

/** The preview panel: device switch, the preview, and "Enlarge" to read it at real size. */
export const StudentPreview: React.FC<PreviewProps> = (props) => {
  const [device, setDeviceState] = useState<Device>(readDevice);
  const [big, setBig] = useState(false);
  const setDevice = (d: Device) => {
    setDeviceState(d);
    try {
      localStorage.setItem(KEY, d);
    } catch {
      /* remembered for this visit only */
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">What students get</p>
        <button onClick={() => setBig(true)} className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-xs font-medium text-brand-700 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-500/10" aria-label="Enlarge the student preview">
          <Maximize2 className="w-3.5 h-3.5" aria-hidden /> Enlarge
        </button>
      </div>
      <div className="flex justify-center mb-3">
        <DeviceSwitch device={device} onChange={setDevice} />
      </div>
      {device === "phone" ? <PhonePreview {...props} /> : <DesktopPreview {...props} />}
      <Modal isOpen={big} onClose={() => setBig(false)} title={`What students get${props.week ? ` — ${props.week}` : ""}`} size="2xl">
        <div className="flex justify-center mb-4">
          <DeviceSwitch device={device} onChange={setDevice} />
        </div>
        <div className="overflow-x-auto">{device === "phone" ? <PhonePreview {...props} large /> : <DesktopPreview {...props} large />}</div>
        <p className="mt-3 text-xs text-center text-slate-600 dark:text-slate-300">The layout students get from this recipe. Real content appears after “Try one week”.</p>
      </Modal>
    </div>
  );
};

export default StudentPreview;
