import React, { useRef, useState } from "react";
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
}

/**
 * A large avatar you can click (or drop a photo on) to change, with an optional
 * Change / Remove pair. Uploading goes through ProfilePictureEditor's crop step.
 */
const AvatarControl: React.FC<Props> = ({ name, avatar, onChange, userId, size = 112, showActions = true }) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { showToast } = useToast();

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

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
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
        title={avatar ? "Change profile picture" : "Add a profile picture"}
      >
        <UserAvatar name={name} avatar={avatar} size={size} ring className="shadow-xl shadow-blue-900/10" />
        <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium gap-1">
          <Camera className="w-5 h-5" />
          {avatar ? "Change" : "Add photo"}
        </span>
        <span className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
          <Camera className="w-4 h-4" />
        </span>
      </button>

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
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {avatar ? "Change photo" : "Upload photo"}
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
        message="Your initials will be shown instead, in every NGA app."
        confirmText="Remove"
        isLoading={removing}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

export default AvatarControl;
