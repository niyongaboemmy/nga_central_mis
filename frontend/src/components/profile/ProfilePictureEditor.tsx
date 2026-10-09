import React, { useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import Modal from "../ui/Modal";
import { Avatar, AvatarCrop, Cover, uploadAvatar, uploadCover } from "../../api/users";

export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** Client-side first pass; the server decodes and re-checks every file. */
export function checkAvatarFile(file: File): string | null {
  if (!/^image\//.test(file.type)) return "Choose an image file (JPG, PNG, WebP, GIF or AVIF).";
  if (/hei[cf]/i.test(file.type)) return "HEIC photos aren't supported yet. Export the photo as JPG and try again.";
  if (file.size > AVATAR_MAX_BYTES) return "That picture is larger than 10 MB. Choose a smaller one.";
  return null;
}

/** react-easy-crop reports percentages; the API takes fractions of the upright image. */
export function toAvatarCrop(area: Area): AvatarCrop {
  const f = (n: number) => Math.min(1, Math.max(0, n / 100));
  const x = f(area.x);
  const y = f(area.y);
  return { x, y, width: Math.min(f(area.width), 1 - x), height: Math.min(f(area.height), 1 - y) };
}

type Props = {
  file: File | null;
  onClose: () => void;
} & (
  | {
      /** Profile picture (round, 1:1) -- the default. */
      variant?: "avatar";
      onSaved: (avatar: Avatar) => void;
      /** Someone else's picture (MANAGE_USERS); omit for your own. */
      userId?: number;
    }
  | {
      /** Profile cover (3:1 banner), always your own. */
      variant: "cover";
      onSaved: (cover: Cover) => void;
      userId?: undefined;
    }
);

const ProfilePictureEditor: React.FC<Props> = (props) => {
  const { file, onClose, userId } = props;
  const isCover = props.variant === "cover";
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    setProgress(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const saving = progress !== null;

  const save = async () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const crop = area ? toAvatarCrop(area) : undefined;
      if (props.variant === "cover") {
        props.onSaved(await uploadCover(file, crop, { onProgress: setProgress }));
      } else {
        props.onSaved(await uploadAvatar(file, crop, { userId, onProgress: setProgress }));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || "The picture could not be saved. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal isOpen={!!file} onClose={saving ? () => undefined : onClose} title={isCover ? "Cover image" : "Profile picture"} size={isCover ? "xl" : "md"} contentClassName="p-0">
      <div className="relative h-72 sm:h-80 bg-gray-900">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={isCover ? 3 : 1}
            cropShape={isCover ? "rect" : "round"}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(pct) => setArea(pct)}
          />
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-blue-600"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setCrop({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Reset framing"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isCover
            ? "Drag to position and zoom to choose the strip shown across the top of your profile."
            : "Drag to position, zoom to frame your face. Your picture is shown in NGA MIS, Task Mentor, Tendo and Tupo."}
        </p>

        {error && (
          <p role="alert" className="text-sm rounded-xl px-3 py-2 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {saving && (
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" aria-label="Uploading">
            <div className="h-full bg-blue-600 transition-[width] duration-200" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !file}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? ((progress ?? 0) < 1 ? "Uploading…" : "Processing…") : "Save picture"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProfilePictureEditor;
