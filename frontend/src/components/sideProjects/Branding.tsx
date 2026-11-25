import React, { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { failure, fileUrl, sideProjectsApi, type Category } from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { CATEGORY_ICON, ProgressRing } from "./ui";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_MB = 10;

/** The project's logo, else its category glyph on a soft tint. Used in lists, cards and the drawer. */
export const ProjectLogo: React.FC<{ logoAssetId?: number | null; category?: Category | null; accent: string; size?: number; className?: string; rounded?: string }> = ({ logoAssetId, category, accent, size = 40, className = "", rounded = "rounded-xl" }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoAssetId]);
  const Icon = CATEGORY_ICON[category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${rounded} ${className}`} style={{ width: size, height: size, backgroundColor: `${accent}1f`, color: accent }} aria-hidden>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
      {logoAssetId && !broken && <img src={fileUrl(logoAssetId, "thumb")} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full bg-white object-cover dark:bg-gray-100" />}
    </span>
  );
};

/** Picks an image, checks it, uploads it with progress, and reports with a toast. */
function useImageUpload(projectId: number, which: "cover" | "logo", onDone: () => void) {
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const pick = () => input.current?.click();
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return showToast("Use a PNG, JPG or WebP image", "warning");
    if (f.size > MAX_MB * 1048576) return showToast(`The image is over ${MAX_MB} MB`, "warning");
    setPct(0);
    try {
      await sideProjectsApi.setBranding(projectId, which, f, setPct);
      showToast(which === "cover" ? "Cover updated" : "Logo updated", "success");
      onDone();
    } catch (e) {
      showToast(failure(e, which === "cover" ? "The cover wasn't uploaded" : "The logo wasn't uploaded").message, "error");
    } finally {
      setPct(null);
    }
  };
  const remove = async () => {
    try {
      await sideProjectsApi.clearBranding(projectId, which);
      showToast(which === "cover" ? "Cover removed" : "Logo removed", "success");
      onDone();
    } catch (e) {
      showToast(failure(e, "That didn't work").message, "error");
    }
  };
  const field = <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />;
  return { pick, remove, pct, field };
}

/**
 * The drawer's cover band: the cover image across the top with a soft fade, and, for the team,
 * Change / Remove on hover. Without a cover it renders nothing (the header stays compact).
 */
export const CoverBand: React.FC<{ projectId: number; coverAssetId: number | null; canEdit: boolean; onChanged: () => void }> = ({ projectId, coverAssetId, canEdit, onChanged }) => {
  const up = useImageUpload(projectId, "cover", onChanged);
  if (!coverAssetId) return up.field;
  return (
    <div className="group relative h-28 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-32 dark:bg-gray-800">
      <img src={fileUrl(coverAssetId, "thumb")} alt="" className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90 dark:to-gray-900/90" aria-hidden />
      {up.pct !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
          <ProgressRing value={up.pct} size={44} color="#ffffff" />
        </div>
      )}
      {canEdit && up.pct === null && (
        <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={up.pick} className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur transition hover:bg-white dark:bg-gray-900/80 dark:text-gray-100 dark:hover:bg-gray-900">
            <Camera className="h-3.5 w-3.5" aria-hidden /> Change cover
          </button>
          <button type="button" onClick={up.remove} aria-label="Remove cover" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 backdrop-blur transition hover:bg-white hover:text-red-600 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900 dark:hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {up.field}
    </div>
  );
};

/** "Add cover" for the team when the project has none. */
export const AddCoverButton: React.FC<{ projectId: number; onChanged: () => void }> = ({ projectId, onChanged }) => {
  const up = useImageUpload(projectId, "cover", onChanged);
  return (
    <>
      <button type="button" onClick={up.pick} disabled={up.pct !== null} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
        {up.pct !== null ? <ProgressRing value={up.pct} size={14} stroke={2}>{" "}</ProgressRing> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />} Add cover
      </button>
      {up.field}
    </>
  );
};

/** The logo tile in the drawer header; the team changes or removes it on hover. */
export const EditableLogo: React.FC<{ projectId: number; logoAssetId: number | null; category: Category | null; accent: string; canEdit: boolean; onChanged: () => void; size?: number; className?: string }> = ({ projectId, logoAssetId, category, accent, canEdit, onChanged, size = 52, className = "" }) => {
  const up = useImageUpload(projectId, "logo", onChanged);
  const [menu, setMenu] = useState(false);
  return (
    <div className={`group relative shrink-0 ${className}`} onMouseLeave={() => setMenu(false)}>
      <ProjectLogo logoAssetId={logoAssetId} category={category} accent={accent} size={size} rounded="rounded-2xl" className="ring-4 ring-white dark:ring-gray-900" />
      {up.pct !== null && (
        <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/50">
          <ProgressRing value={up.pct} size={28} stroke={3} color="#ffffff">{" "}</ProgressRing>
        </span>
      )}
      {canEdit && up.pct === null && (
        <>
          <button
            type="button"
            aria-label={logoAssetId ? "Change the logo" : "Add a logo"}
            title={logoAssetId ? "Change the logo" : "Add a logo"}
            onClick={() => (logoAssetId ? setMenu((m) => !m) : up.pick())}
            className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/0 text-white opacity-0 transition hover:bg-slate-900/45 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100"
          >
            <Camera className="h-4 w-4" aria-hidden />
          </button>
          {menu && (
            <div role="menu" className="absolute left-0 top-[calc(100%+4px)] z-30 w-40 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white p-1.5 dark:border-white/10 dark:bg-gray-900">
              <button role="menuitem" type="button" onClick={() => (setMenu(false), up.pick())} className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-800">
                <Camera className="h-4 w-4" /> New logo
              </button>
              <button role="menuitem" type="button" onClick={() => (setMenu(false), up.remove())} className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            </div>
          )}
        </>
      )}
      {up.field}
    </div>
  );
};
