import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Expand,
  Minimize2,
  Sparkles,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Target,
} from "lucide-react";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { elearningApi, OpenedItem } from "../../../api/elearning";
import SharedLessonNoteViewPage from "../../lessonNotes/SharedLessonNoteViewPage";
import { copy } from "../copy";
import { useMotion } from "../../../design/motion";
import Mascot from "../ui/Mascot";
import { ItemTypeIcon } from "../ui/primitives";
import EndOfLesson from "./EndOfLesson";
import ReaderControls from "./ReaderControls";
import { useReaderPrefs } from "../../lessonNotes/reader/useReaderPrefs";
import KnowledgeCheckCard from "./KnowledgeCheckCard";
import { hydrateInlineChecks } from "../interactive/hydrate";
import FilePreview from "../../files/FilePreview";
import { ExitTicketCard, FlashcardDeck, PracticalTaskView } from "./InteractiveItems";
import type { FilePreviewManifest } from "../../../api/elearning";
import { API_BASE_URL } from "../../../services/api";
import { getToken } from "../../../utils/auth";

interface Props {
  opened: OpenedItem;
  onBack: () => void;
  onChecked?: (result: {
    score_pct: number;
    passed: boolean;
    just_completed: boolean;
  }) => void;
  /** Walk to the next step from the end-of-lesson card, rather than hunting for a chevron. */
  onNext?: () => void;
  /** Step position within the week, so the reader can say "Step 2 of 5". */
  step?: { index: number; total: number };
  /** The AI tutor lives above the reader in CoursePage; focus mode covers it, so the
   *  overlay needs its own way to open it. */
  onAskAI?: () => void;
}

/**
 * A scroll-linked reading progress bar. Long lesson pages gave no sense of how much was left —
 * the one pattern every modern reader (and Duolingo's completion data) says to keep visible.
 */
const ReadingProgress: React.FC<{
  container?: React.RefObject<HTMLElement>;
  absolute?: boolean;
}> = ({ container, absolute }) => {
  // In focus mode the page itself doesn't scroll — the overlay does, so the bar has to
  // track that container instead of the window.
  const { scrollYProgress } = useScroll(container ? { container } : undefined);
  const width = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.001,
  });
  return (
    <motion.div
      aria-hidden
      className={`${absolute ? "absolute" : "fixed"} top-0 left-0 right-0 z-40 h-[3px] origin-left bg-gradient-to-r from-brand-500 to-accent-500`}
      style={{ scaleX: width }}
    />
  );
};

/**
 * Immersive reading: a fixed overlay that covers the app chrome entirely, with its own
 * scroll container and progress bar. It also asks the browser for real fullscreen where
 * that is allowed, and falls back to the overlay when it isn't (iOS Safari, an iframe, or
 * a user gesture the browser rejects) — the overlay alone is already the focused view.
 *
 * Esc leaves, which is also what the browser does with native fullscreen, so the two
 * never disagree about the state.
 */
const useFocusMode = () => {
  const [on, setOn] = useState(false);

  const enter = () => {
    setOn(true);
    // documentElement, not the overlay: the overlay does not exist yet at this point in
    // the click handler, and requestFullscreen has to be called while the user gesture is
    // still active. The overlay supplies the focused view either way.
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };
  const leave = () => {
    setOn(false);
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    // Leaving native fullscreen by any other route (F11, the browser's own chrome) must
    // drop the overlay too, or the reader is stuck in a state the user tried to exit.
    const onFsChange = () => {
      if (!document.fullscreenElement) setOn(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [on]);

  return { on, enter, leave };
};


/** Dispatches on item_type — every type renders in the same right pane (UX plan §3.1). */
const ItemView: React.FC<Props> = ({
  opened,
  onBack,
  onChecked,
  onNext,
  step,
  onAskAI,
}) => {
  const m = useMotion();
  const { item, content } = opened;
  const frame = { opened, onBack, onNext, step, onAskAI };

  if (opened.locked) {
    return (
      <div className="flex flex-col items-center text-center py-16 px-6">
        <Lock className="w-8 h-8 text-gray-400" />
        <h2 className="mt-3 text-base font-semibold text-gray-800 dark:text-gray-100">
          {copy.course.locked}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          {copy.course.lockedBody(null)}
        </p>
      </div>
    );
  }

  switch (item.item_type) {
    case "LESSON_NOTE":
      return (
        <SharedLessonNoteViewPage
          noteId={content?.note_id}
          onBack={onBack}
          backLabel={opened.section.title.split(" — ")[0] || "Course"}
        />
      );
    case "SUBJECT_DOCUMENT":
    case "FILE":
      return <DocumentView {...frame} />;
    case "EXIT_TICKET":
      return (
        <ItemFrame {...frame}>
          <ExitTicketCard itemId={item.item_id} content={content} />
        </ItemFrame>
      );
    case "FLASHCARDS":
      return (
        <ItemFrame {...frame}>
          <FlashcardDeck itemId={item.item_id} content={content} />
        </ItemFrame>
      );
    case "PRACTICAL_TASK":
      return (
        <ItemFrame {...frame} wide>
          <PracticalTaskView itemId={item.item_id} content={content} />
        </ItemFrame>
      );
    case "PAGE":
      return <PageView {...frame} />;
    case "VIDEO":
      return <VideoView {...frame} />;
    case "KNOWLEDGE_CHECK":
      return (
        <ItemFrame {...frame}>
          <KnowledgeCheckCard
            itemId={item.item_id}
            questions={content?.questions || []}
            onResult={onChecked}
          />
        </ItemFrame>
      );
    case "LINK":
    case "TASKMENTOR_QUIZ":
    case "TASKMENTOR_ASSIGNMENT":
    case "DISCUSSION":
      return (
        <ItemFrame {...frame}>
          <motion.div {...m("reveal")} className="el-card p-5">
            {item.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 whitespace-pre-line">
                {item.description}
              </p>
            )}
            {/* Where you're actually going. A bare "Open in a new tab" button in an empty
                card told a student nothing about the destination or why it was set. */}
            <ExternalDestination
              url={content?.external_url || item.external_url || ""}
              itemType={item.item_type}
            />
            <a
              href={content?.external_url || item.external_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow"
            >
              <ExternalLink className="w-4 h-4" />
              {copy.course.openIn(
                item.item_type === "LINK"
                  ? "a new tab"
                  : item.item_type === "DISCUSSION"
                    ? "Tupo"
                    : "Task Mentor",
              )}
            </a>
            {item.completion_rule === "MARK_DONE" &&
              item.state !== "COMPLETED" && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {copy.course.linkAfterOpening}
                </p>
              )}
            {["SUBMIT", "MIN_SCORE"].includes(item.completion_rule) &&
              item.state !== "COMPLETED" && (
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                  {copy.course.awaitingResult}
                  {item.completion_rule === "MIN_SCORE" && item.min_score_pct
                    ? ` — you need ${item.min_score_pct}%`
                    : ""}
                </p>
              )}
            {item.best_score_pct !== null && (
              <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Best score: {Math.round(item.best_score_pct)}%
              </p>
            )}
          </motion.div>
        </ItemFrame>
      );
    default:
      return (
        <ItemFrame {...frame}>
          <p className="text-sm text-gray-500">{item.description}</p>
        </ItemFrame>
      );
  }
};

/** The host of an external destination, said plainly. */
const ExternalDestination: React.FC<{
  url: string;
  itemType: OpenedItem["item"]["item_type"];
}> = ({ url, itemType }) => {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  if (!host) return null;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl el-subtle">
      <span className="w-9 h-9 rounded-lg bg-white dark:bg-white/[0.08] flex items-center justify-center text-gray-500 dark:text-gray-300 flex-shrink-0">
        <Globe className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
          {host}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {itemType === "LINK"
            ? copy.course.linkOpensElsewhere(host)
            : copy.builder.itemTypes[itemType]}
        </p>
      </div>
    </div>
  );
};

/**
 * Shared chrome for every non-note step. Three things the old frame left out, and which every
 * modern reader keeps on screen: where you are in the week, how long this takes, and what to
 * do when you reach the bottom.
 */
const ItemFrame: React.FC<{
  opened: OpenedItem;
  children: React.ReactNode;
  wide?: boolean;
  onBack: () => void;
  onNext?: () => void;
  step?: { index: number; total: number };
  onAskAI?: () => void;
}> = ({ opened, children, wide, onBack, onNext, step, onAskAI }) => {
  const { item } = opened;
  const isDone = item.state === "COMPLETED";
  const focus = useFocusMode();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { prefs, update } = useReaderPrefs();

  // One measure for the whole step: the eyebrow, title, meta, body and end card all share
  // a left edge. The article used to centre itself inside the frame at a narrower width,
  // which is what made the page read as two mismatched columns.
  const body = (
    <div
      className={`el-step el-step--${prefs.paper} el-step--${prefs.font} mx-auto ${
        // Wider measure: the column left a third of a desktop screen empty,
        // and the 80% default body size fits more words per line than the old
        // 46rem was sized for.
        wide ? "max-w-[76rem]" : "max-w-[58rem]"
      } px-4 sm:px-6 py-6 pb-28`}
      style={
        {
          "--reader-font-scale": prefs.fontScale,
          "--reader-line-height": prefs.lineHeight,
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <ItemTypeIcon type={item.item_type} className="w-3.5 h-3.5" />
          {copy.builder.itemTypes[item.item_type]}
        </span>
        <span aria-hidden>·</span>
        <button
          onClick={onBack}
          className="hover:text-brand-600 dark:hover:text-brand-300 focus-visible:outline-none focus-visible:underline transition-colors uppercase"
        >
          {opened.section.title}
        </button>
        {step && step.total > 1 && (
          <>
            <span aria-hidden>·</span>
            <span className="normal-case tracking-normal font-medium text-gray-400">
              {copy.course.stepOf(step.index, step.total)}
            </span>
          </>
        )}
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <h1 className="text-2xl sm:text-[1.75rem] font-bold text-gray-900 dark:text-white leading-tight tracking-tight min-w-0">
          {item.title}
        </h1>
        {!focus.on && (
          <div className="hidden sm:block flex-shrink-0">
            <ReaderControls
              prefs={prefs}
              update={update}
              trailing={
                <button
                  onClick={focus.enter}
                  title={copy.course.focusEnter}
                  aria-label={copy.course.focusEnter}
                  className="w-9 h-9 flex items-center justify-center rounded-pill el-chip text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.10] focus:outline-none focus-visible:shadow-glow transition-colors"
                >
                  <Expand className="w-4 h-4" />
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* Meta row: the small facts a reader wants before committing to a page. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {isDone && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-pill el-chip-success">
            <CheckCircle2 className="w-3 h-3" /> {copy.course.done}
          </span>
        )}
        {item.estimated_minutes ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-pill el-chip text-gray-600 dark:text-gray-300">
            <Clock className="w-3 h-3" />{" "}
            {copy.course.readingTime(item.estimated_minutes)}
          </span>
        ) : null}
        {item.criteria.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400"
            title={copy.course.teachesLabel}
          >
            <Target className="w-3 h-3" />
            {item.criteria.map((c) => c.criteria_number).join(", ")}
          </span>
        )}
      </div>

      {item.criteria.length > 0 && (
        <ul
          className="mt-3 space-y-1 p-3 rounded-xl el-subtle"
          aria-label={copy.course.teachesLabel}
        >
          <li className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
            {copy.course.teachesLabel}
          </li>
          {item.criteria.map((c) => (
            <li
              key={c.criteria_id}
              className="flex items-start gap-2 text-[13px] text-gray-700 dark:text-gray-200 leading-snug"
            >
              <span className="mt-0.5 text-[11px] font-bold text-brand-600 dark:text-brand-300 flex-shrink-0">
                {c.criteria_number}
              </span>
              {c.description}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">{children}</div>

      <EndOfLesson opened={opened} onNext={onNext} onBack={onBack} />
    </div>
  );

  if (focus.on) {
    return (
      <div
        className={`el-focus el-focus--${prefs.paper} fixed inset-0 z-[60] flex flex-col`}
        role="region"
        aria-label={`${item.title} — ${copy.course.focusEnter}`}
      >
        <div className="relative flex-shrink-0">
          <ReadingProgress container={scrollRef} absolute />
        </div>
        {/* The only chrome focus mode keeps: where you are, and the way out. */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {item.title}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
              <span>{opened.section.title}</span>
              {step && step.total > 1 && (
                <>
                  <span aria-hidden> · </span>
                  <span>{copy.course.focusOf(step.index, step.total)}</span>
                </>
              )}
            </p>
          </div>
          <span className="hidden lg:inline text-[11px] text-gray-400">
            {copy.course.focusHint}
          </span>
          {/* Reading settings stay reachable: focus mode is exactly when a student
              adjusts size or background. */}
          <div className="hidden sm:block">
            <ReaderControls prefs={prefs} update={update} />
          </div>
          {onAskAI && (
            <button
              onClick={onAskAI}
              title={copy.course.askAI}
              aria-label={copy.course.askAI}
              className="w-10 h-10 flex items-center justify-center rounded-pill bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-soft focus:outline-none focus-visible:shadow-glow flex-shrink-0"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={focus.leave}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/[0.10] focus:outline-none focus-visible:shadow-glow flex-shrink-0"
          >
            <Minimize2 className="w-4 h-4" />
            <span className="hidden sm:inline">{copy.course.focusExit}</span>
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {body}
        </div>
      </div>
    );
  }

  return (
    <>
      <ReadingProgress />
      {body}
    </>
  );
};

type FrameProps = {
  opened: OpenedItem;
  onBack: () => void;
  onNext?: () => void;
  step?: { index: number; total: number };
};

/**
 * Files and subject materials: shown inside the page with the shared <FilePreview> (PDF,
 * the server's PDF of slides/documents, docx/sheets in the browser, images, audio, text) —
 * no more "this file opens outside the browser". Downloads stream straight from the API.
 */
const DocumentView: React.FC<FrameProps> = ({ opened, ...frame }) => {
  const { content, item } = opened;
  const manifest: FilePreviewManifest | null = content?.preview ?? null;
  const token = getToken() || "";
  const fileUrl = (extra: string) => `${API_BASE_URL}/elearning/my/items/${item.item_id}/file?${extra}&token=${encodeURIComponent(token)}`;
  const loadVariant = useCallback(async (variant: "original" | "pdf" | "text") => (await elearningApi.itemFileBlob(item.item_id, variant)).data, [item.item_id]);
  const refresh = useCallback(async () => (await elearningApi.myItemPreview(item.item_id)).data.data, [item.item_id]);
  const download = () => {
    window.location.href = fileUrl("download=1");
  };
  const wide = !!manifest && ["pdf", "word", "slides", "sheet", "csv"].includes(manifest.kind || "");
  return (
    <ItemFrame opened={opened} {...frame} wide={wide}>
      {manifest ? (
        <FilePreview manifest={manifest} loadVariant={loadVariant} refreshManifest={refresh} mediaUrl={fileUrl("variant=original")} onDownload={download} />
      ) : (
        <div className="el-card p-6 flex items-center gap-3">
          <Mascot pose="book" size={40} />
          <p className="text-sm text-gray-600 dark:text-gray-300">This file isn't available any more.</p>
        </div>
      )}
      {content?.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{content.description}</p>}
    </ItemFrame>
  );
};

const PageView: React.FC<FrameProps> = ({ opened, ...frame }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      renderMathInElement(ref.current, {
        delimiters: [{ left: "$", right: "$", display: false }],
        throwOnError: false,
      });
      hydrateInlineChecks(ref.current);
    }
  }, [opened.content?.content_html]);
  return (
    <ItemFrame opened={opened} {...frame}>
      <article
        ref={ref}
        className="el-reader prose prose-slate dark:prose-invert prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-img:rounded-xl prose-a:text-brand-600 dark:prose-a:text-brand-300"
        dangerouslySetInnerHTML={{
          __html: opened.content?.content_html || "<p></p>",
        }}
      />
    </ItemFrame>
  );
};

const VideoView: React.FC<FrameProps> = ({ opened, ...frame }) => {
  const src = opened.content?.embed_url as string | undefined;
  return (
    <ItemFrame opened={opened} {...frame} wide>
      <div
        className="rounded-2xl overflow-hidden bg-black shadow-soft"
        style={{ aspectRatio: "16 / 9", maxWidth: "100%" }}
      >
        {src ? (
          <iframe
            title={opened.item.title}
            src={src}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <a
            href={opened.content?.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-full text-white text-sm"
          >
            Open video
          </a>
        )}
      </div>
      {opened.item.description && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
          {opened.item.description}
        </p>
      )}
    </ItemFrame>
  );
};

export default ItemView;
