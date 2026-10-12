import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import ConfirmDialog from "../ui/ConfirmDialog";
import ProfilePictureEditor, { AVATAR_ACCEPT, checkAvatarFile } from "./ProfilePictureEditor";
import { Cover, removeCover } from "../../api/users";
import { useToast } from "../../contexts/ToastContext";

/** The system's primary blue -- what every profile shows until a cover is chosen. */
export const COVER_FALLBACK_CLASS = "bg-blue-600";

interface Props {
  cover: Cover | null | undefined;
  /** Called after a successful upload (new cover) or removal (null). */
  onChange?: (cover: Cover | null) => void;
  /** Show the change / remove controls (your own profile only). */
  editable?: boolean;
  className?: string;
}

/**
 * The banner across the top of a profile: the user's cover image, or plain system blue.
 * When editable, a picture can be chosen (or dropped onto the banner) and framed in a
 * 3:1 crop before upload.
 */
const ProfileCover: React.FC<Props> = ({ cover, onChange, editable = false, className = "h-32 md:h-44" }) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { showToast } = useToast();
  const url = cover?.lg ?? null;
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [url]);

  const pick = (chosen: File | null | undefined) => {
    if (!chosen) return;
    const problem = checkAvatarFile(chosen);
    if (problem) showToast(problem, "error");
    else setFile(chosen);
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await removeCover();
      onChange?.(null);
      showToast("Cover image removed", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not remove the cover", "error");
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  };

  const showImage = !!url && !failed;

  return (
    <div
      className={`group relative overflow-hidden ${COVER_FALLBACK_CLASS} ${className} ${
        dragging ? "ring-4 ring-inset ring-white/70" : ""
      }`}
      data-testid="profile-cover"
      onDragOver={editable ? (e) => { e.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={editable ? () => setDragging(false) : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }
          : undefined
      }
    >
      {showImage && (
        <img
          src={url!}
          srcSet={`${cover!.md} 960w, ${cover!.lg} 1920w`}
          sizes="(max-width: 960px) 100vw, 1200px"
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {/* Keeps the white controls legible on any photo. */}
      {showImage && <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />}

      {editable && (
        <div
          className={`absolute top-3 right-3 flex items-center gap-2 transition-opacity ${
            // With a cover the controls step aside until hovered; without one, "Add cover" stays in view.
            url ? "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100" : "opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {url ? "Change cover" : "Add cover"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Remove cover"
              title="Remove cover"
              className="inline-flex items-center rounded-full bg-black/40 hover:bg-red-600/80 backdrop-blur p-1.5 text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            data-testid="cover-file-input"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {editable && (
        <>
          <ProfilePictureEditor
            variant="cover"
            file={file}
            onClose={() => setFile(null)}
            onSaved={(saved) => {
              setFile(null);
              onChange?.(saved);
              showToast("Cover image updated", "success");
            }}
          />
          <ConfirmDialog
            isOpen={confirming}
            title="Remove cover image?"
            message="Your profile goes back to the plain blue banner."
            confirmText="Remove"
            isLoading={removing}
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </div>
  );
};

export default ProfileCover;
