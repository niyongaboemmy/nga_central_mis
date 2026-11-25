import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import UserAvatar from "../ui/UserAvatar";
import ConfirmDialog from "../ui/ConfirmDialog";
import ProfilePictureEditor, { AVATAR_ACCEPT, checkAvatarFile } from "./ProfilePictureEditor";
import { Avatar, removeAvatar } from "../../api/users";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  name: string;
  avatar: Avatar | null | undefined;
  /** Called after a successful upload (new avatar) or removal (null). */
  onChange: (avatar: Avatar | null) => void;
  /** Someone else's picture (MANAGE_USERS); omit for your own. */
  userId?: number;
  size?: number;
  /** Show the "Change / Remove" text buttons beside the avatar. */
  showActions?: boolean;
  /** "stacked": buttons under the avatar. "inline": beside it, for a settings row. */
  layout?: "stacked" | "inline";
  /**
   * With a photo, clicking the avatar opens a small menu (Change photo / Remove photo)
   * instead of the file picker straight away. For a header avatar with no buttons beside it.
   */
  menu?: boolean;
}

/** Lets a page open the file picker from elsewhere (e.g. an "Add a profile photo" step). */
export interface AvatarControlHandle {
  openPicker: () => void;
}

/**
 * A large avatar you can click (or drop a photo on) to change, with an optional
 * Change / Remove pair or a Change / Remove menu. Uploading goes through
 * ProfilePictureEditor's crop step.
 */
const AvatarControl = forwardRef<AvatarControlHandle, Props>(
  ({ name, avatar, onChange, userId, size = 112, showActions = true, layout = "stacked", menu = false }, ref) => {
    const input = useRef<HTMLInputElement>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const { showToast } = useToast();

    const openPicker = () => {
      setMenuOpen(false);
      input.current?.click();
    };
    useImperativeHandle(ref, () => ({ openPicker }));

    // The menu closes on Escape or a click outside it.
    useEffect(() => {
      if (!menuOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!wrap.current?.contains(e.target as Node)) setMenuOpen(false);
      };
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [menuOpen]);

    const pick = (chosen: File | null | undefined) => {
      if (!chosen) return;
      const problem = checkAvatarFile(chosen);
      if (problem) showToast(problem, "error");
      else setFile(chosen);
    };

    const remove = async () => {
      setRemoving(true);
      try {
        await removeAvatar({ userId });
        onChange(null);
        showToast("Profile picture removed", "success");
      } catch (err: any) {
        showToast(err?.response?.data?.message || "Could not remove the picture", "error");
      } finally {
        setRemoving(false);
        setConfirming(false);
      }
    };

    const withMenu = menu && !!avatar;

    return (
      <div ref={wrap} className={`relative ${layout === "inline" ? "flex items-center gap-4" : "flex flex-col items-center gap-3"}`}>
        <button
          type="button"
          onClick={() => (withMenu ? setMenuOpen((o) => !o) : openPicker())}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`group relative rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 ${
            dragging ? "ring-4 ring-blue-500/60" : ""
          }`}
          aria-label={avatar ? "Change profile picture" : "Add a profile picture"}
          aria-haspopup={withMenu ? "menu" : undefined}
          aria-expanded={withMenu ? menuOpen : undefined}
          title={avatar ? "Change profile picture" : "Add a profile picture (or drop one here)"}
        >
          <UserAvatar name={name} avatar={avatar} size={size} ring fallback="person" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="h-5 w-5" />
            {dragging ? "Drop to upload" : avatar ? "Change" : "Add photo"}
          </span>
          {/* Too small a picture for a badge to sit on without hiding the face. */}
          {size >= 96 && (
            <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white dark:ring-gray-900">
              <Camera className="h-4 w-4" />
            </span>
          )}
        </button>

        {withMenu && menuOpen && (
          <div
            role="menu"
            aria-label="Profile picture"
            className="absolute left-0 top-full z-30 mt-2 w-52 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-gray-700/40 dark:bg-gray-900"
          >
            <button
              type="button"
              role="menuitem"
              onClick={openPicker}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800/60"
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              Change photo
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setConfirming(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Remove photo
            </button>
          </div>
        )}

        <input
          ref={input}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          data-testid="avatar-file-input"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {showActions && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {avatar ? "Change photo" : "Upload photo"}
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
        )}

        <ProfilePictureEditor
          file={file}
          userId={userId}
          onClose={() => setFile(null)}
          onSaved={(saved) => {
            setFile(null);
            onChange(saved);
            showToast("Profile picture updated", "success");
          }}
        />

        <ConfirmDialog
          isOpen={confirming}
          title="Remove profile picture?"
          message="A person icon will be shown instead, in every NGA app."
          confirmText="Remove"
          isLoading={removing}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      </div>
    );
  },
);

AvatarControl.displayName = "AvatarControl";

export default AvatarControl;
