import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Sparkles, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { useToast } from "../../contexts/ToastContext";
import { ACTIVITY_NOTICE_ACK_EVENT, activityNoticeAcknowledged } from "../analytics/ActivityNotice";
import ProfilePictureEditor, { AVATAR_ACCEPT, checkAvatarFile } from "./ProfilePictureEditor";
import UserAvatar from "../ui/UserAvatar";
import type { Avatar } from "../../api/users";

/** "Not now" hides the prompt for a week, per account and device. */
export const PHOTO_PROMPT_SNOOZE_DAYS = 7;
const snoozeKey = (userId: number) => `nga.photoPrompt.snoozedUntil.${userId}`;
/** A short pause after sign-in, so the prompt never competes with the page loading. */
const APPEAR_AFTER_MS = 2500;

export const snoozedUntil = (userId: number): number => {
  try {
    return Number(localStorage.getItem(snoozeKey(userId)) || 0);
  } catch {
    return 0;
  }
};
export const snoozePhotoPrompt = (userId: number, now = Date.now()) => {
  try {
    localStorage.setItem(snoozeKey(userId), String(now + PHOTO_PROMPT_SNOOZE_DAYS * 86_400_000));
  } catch {
    /* storage blocked: it simply comes back next visit */
  }
};

/** Pure rule (unit-tested): ask only people without a photo, one prompt at a time. */
export const shouldPromptForPhoto = (input: {
  hasAvatar: boolean;
  noticeAcknowledged: boolean;
  snoozedUntil: number;
  now: number;
  path: string;
}): boolean =>
  !input.hasAvatar &&
  // The activity notice owns the bottom of the screen until it is dismissed.
  input.noticeAcknowledged &&
  input.snoozedUntil <= input.now &&
  // The profile page has its own, bigger photo control.
  !/^\/profile(\/|$)/.test(input.path);

const fullNameOf = (user: ReturnType<typeof useUser>["user"]) =>
  [user?.profile?.first_name, user?.profile?.last_name].filter(Boolean).join(" ") || user?.user.username || "You";

/**
 * A small card at the bottom of the screen inviting people without a profile photo to
 * add one. "Not now" snoozes it for a week; choosing a photo (click or drop) opens the
 * usual crop step, and a saved photo gets a short celebration before the card leaves.
 */
const ProfilePhotoPrompt: React.FC = () => {
  const { user, refreshUser } = useUser();
  const { showToast } = useToast();
  const location = useLocation();
  const input = useRef<HTMLInputElement>(null);
  const userId = user?.user.user_id ?? null;
  const hasAvatar = !!user?.avatar;

  const [ready, setReady] = useState(false);
  const [noticeAck, setNoticeAck] = useState(() => (userId ? activityNoticeAcknowledged(userId) : false));
  const [dismissed, setDismissed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saved, setSaved] = useState<Avatar | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), APPEAR_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setNoticeAck(activityNoticeAcknowledged(userId));
    const onAck = () => setNoticeAck(true);
    window.addEventListener(ACTIVITY_NOTICE_ACK_EVENT, onAck);
    return () => window.removeEventListener(ACTIVITY_NOTICE_ACK_EVENT, onAck);
  }, [userId]);

  // The celebration shows the new photo for a moment, then the card leaves.
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setDismissed(true), 3500);
    return () => window.clearTimeout(t);
  }, [saved]);

  if (!userId) return null;
  const visible =
    ready &&
    !dismissed &&
    (!!saved ||
      shouldPromptForPhoto({
        hasAvatar,
        noticeAcknowledged: noticeAck,
        snoozedUntil: snoozedUntil(userId),
        now: Date.now(),
        path: location.pathname,
      }));

  const notNow = () => {
    snoozePhotoPrompt(userId);
    setDismissed(true);
  };

  const pick = (chosen: File | null | undefined) => {
    if (!chosen) return;
    const problem = checkAvatarFile(chosen);
    if (problem) showToast(problem, "error");
    else setFile(chosen);
  };

  const name = fullNameOf(user);
  const firstName = user?.profile?.first_name || name.split(" ")[0];

  return (
    <>
      <AnimatePresence>
        {visible && (
          <div className="fixed inset-x-3 bottom-3 z-[55] flex justify-center pointer-events-none sm:bottom-6" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <motion.div
            role="dialog"
            aria-label="Add a profile photo"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className={`pointer-events-auto relative w-full sm:w-[30rem] rounded-3xl border bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-2xl shadow-blue-900/10 transition-colors ${
              dragging ? "border-blue-500 ring-4 ring-blue-500/20" : "border-gray-200 dark:border-gray-800"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!saved) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!saved) pick(e.dataTransfer.files?.[0]);
            }}
          >
            {!saved && (
              <button
                type="button"
                onClick={notNow}
                aria-label="Close"
                className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-4 p-4 pr-10">
              <button
                type="button"
                onClick={() => !saved && input.current?.click()}
                className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40"
                aria-label={saved ? "Your new profile photo" : "Choose a photo"}
                tabIndex={saved ? -1 : 0}
              >
                {/* A slow halo invites the click; it stops once the photo is in. */}
                {!saved && (
                  <motion.span
                    aria-hidden
                    className="absolute -inset-1.5 rounded-full border-2 border-dashed border-blue-400/70"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 14, ease: "linear" }}
                  />
                )}
                <UserAvatar name={name} avatar={saved} size={56} />
                <motion.span
                  className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow ring-2 ring-white dark:ring-gray-900 ${
                    saved ? "bg-green-500" : "bg-blue-600"
                  }`}
                  animate={saved ? { scale: [0.6, 1.2, 1] } : { scale: [1, 1.12, 1] }}
                  transition={saved ? { duration: 0.5 } : { repeat: Infinity, duration: 2.2 }}
                >
                  {saved ? <Check className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                </motion.span>
              </button>

              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  {saved ? (
                    <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                        Looking great, {firstName}! <Sparkles className="w-4 h-4 text-amber-500" />
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                        Your photo now appears across every NGA app.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Put a face to your name, {firstName}</p>
                      <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                        Add a profile photo so teachers, classmates and colleagues recognise you in MIS, Task Mentor, Tendo and Tupo.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => input.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30"
                        >
                          <Camera className="w-4 h-4" />
                          Add photo
                        </button>
                        <button
                          type="button"
                          onClick={notNow}
                          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition"
                        >
                          Not now
                        </button>
                        <span className="hidden sm:inline text-xs text-gray-400">or drop a photo here</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        data-testid="photo-prompt-file-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <ProfilePictureEditor
        file={file}
        onClose={() => setFile(null)}
        onSaved={(avatar) => {
          setFile(null);
          setSaved(avatar);
          void refreshUser();
        }}
      />
    </>
  );
};

export default ProfilePhotoPrompt;
