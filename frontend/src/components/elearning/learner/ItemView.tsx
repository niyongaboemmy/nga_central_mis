import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, ExternalLink, FileText, Loader2, Lock } from "lucide-react";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { elearningApi, OpenedItem } from "../../../api/elearning";
import SharedLessonNoteViewPage from "../../lessonNotes/SharedLessonNoteViewPage";
import { copy } from "../copy";
import { useMotion } from "../../../design/motion";
import Mascot from "../ui/Mascot";
import { ItemTypeIcon } from "../ui/primitives";
import KnowledgeCheckCard from "./KnowledgeCheckCard";
import { hydrateInlineChecks } from "../interactive/hydrate";

interface Props {
  opened: OpenedItem;
  onBack: () => void;
  onChecked?: (result: { score_pct: number; passed: boolean; just_completed: boolean }) => void;
}

const formatBytes = (n?: number | null) => {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** Dispatches on item_type — every type renders in the same right pane (UX plan §3.1). */
const ItemView: React.FC<Props> = ({ opened, onBack, onChecked }) => {
  const m = useMotion();
  const { item, content } = opened;

  if (opened.locked) {
    return (
      <div className="flex flex-col items-center text-center py-16 px-6">
        <Lock className="w-8 h-8 text-gray-400" />
        <h2 className="mt-3 text-base font-semibold text-gray-800 dark:text-gray-100">{copy.course.locked}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{copy.course.lockedBody(null)}</p>
      </div>
    );
  }

  switch (item.item_type) {
    case "LESSON_NOTE":
      return <SharedLessonNoteViewPage noteId={content?.note_id} onBack={onBack} backLabel={opened.section.title.split(" — ")[0] || "Course"} />;
    case "SUBJECT_DOCUMENT":
      return <DocumentView opened={opened} />;
    case "PAGE":
      return <PageView opened={opened} />;
    case "VIDEO":
      return <VideoView opened={opened} />;
    case "KNOWLEDGE_CHECK":
      return (
        <ItemFrame opened={opened}>
          <KnowledgeCheckCard itemId={item.item_id} questions={content?.questions || []} onResult={onChecked} />
        </ItemFrame>
      );
    case "LINK":
    case "TASKMENTOR_QUIZ":
    case "TASKMENTOR_ASSIGNMENT":
    case "DISCUSSION":
      return (
        <ItemFrame opened={opened}>
          <motion.div {...m("reveal")} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-soft">
            {item.description && <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 whitespace-pre-line">{item.description}</p>}
            <a
              href={content?.external_url || item.external_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow"
            >
              <ExternalLink className="w-4 h-4" />
              {copy.course.openIn(
                item.item_type === "LINK" ? "a new tab" : item.item_type === "DISCUSSION" ? "Tupo" : "Task Mentor",
              )}
            </a>
            {["SUBMIT", "MIN_SCORE"].includes(item.completion_rule) && item.state !== "COMPLETED" && (
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {copy.course.awaitingResult}
                {item.completion_rule === "MIN_SCORE" && item.min_score_pct ? ` — you need ${item.min_score_pct}%` : ""}
              </p>
            )}
            {item.best_score_pct !== null && (
              <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Best score: {Math.round(item.best_score_pct)}%</p>
            )}
          </motion.div>
        </ItemFrame>
      );
    default:
      return (
        <ItemFrame opened={opened}>
          <p className="text-sm text-gray-500">{item.description}</p>
        </ItemFrame>
      );
  }
};

/** Shared chrome for non-note items: subject line, title, criteria chips. */
const ItemFrame: React.FC<{ opened: OpenedItem; children: React.ReactNode; wide?: boolean }> = ({ opened, children, wide }) => (
  <div className={`mx-auto ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 sm:px-6 py-6 pb-28`}>
    <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
      <ItemTypeIcon type={opened.item.item_type} className="w-3.5 h-3.5" /> {copy.builder.itemTypes[opened.item.item_type]} · {opened.section.title}
    </p>
    <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white leading-tight">{opened.item.title}</h1>
    {opened.item.criteria.length > 0 && (
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Performance criteria">
        {opened.item.criteria.map((c) => (
          <li key={c.criteria_id} title={c.description} className="text-[11px] px-2 py-0.5 rounded-pill bg-brand-50 dark:bg-brand-700/20 text-brand-700 dark:text-brand-200 font-medium">
            {c.criteria_number}
          </li>
        ))}
      </ul>
    )}
    <div className="mt-5">{children}</div>
  </div>
);

const DocumentView: React.FC<{ opened: OpenedItem }> = ({ opened }) => {
  const { content, item } = opened;
  const isPdf = (content?.mime_type || "").includes("pdf") || (content?.file_extension || "").toLowerCase() === "pdf";
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    elearningApi
      .itemFileBlob(item.item_id)
      .then((r) => {
        url = URL.createObjectURL(r.data);
        setBlobUrl(url);
      })
      .catch(() => setFailed(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.item_id]);

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = content?.original_name || item.title;
    a.click();
  };

  return (
    <ItemFrame opened={opened} wide={isPdf}>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-soft overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
          <FileText className="w-5 h-5 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{content?.original_name || item.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatBytes(content?.file_size)}{content?.description ? ` · ${content.description}` : ""}</p>
          </div>
          <button
            onClick={download}
            disabled={!blobUrl}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-pill bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {copy.course.download}
          </button>
        </div>
        {isPdf ? (
          failed ? (
            <p className="p-6 text-sm text-gray-500">This file couldn't be loaded. Try the download button.</p>
          ) : blobUrl ? (
            <iframe title={item.title} src={blobUrl} className="w-full h-[70vh] bg-gray-50 dark:bg-gray-950" />
          ) : (
            <div className="flex items-center justify-center h-[40vh] text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          )
        ) : (
          <div className="p-6 flex items-center gap-3">
            <Mascot pose="book" size={40} />
            <p className="text-sm text-gray-600 dark:text-gray-300">This file opens outside the browser — download it to read.</p>
          </div>
        )}
      </div>
    </ItemFrame>
  );
};

const PageView: React.FC<{ opened: OpenedItem }> = ({ opened }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      renderMathInElement(ref.current, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
      hydrateInlineChecks(ref.current);
    }
  }, [opened.content?.content_html]);
  return (
    <ItemFrame opened={opened}>
      <article
        ref={ref}
        className="prose prose-slate dark:prose-invert max-w-[68ch] prose-headings:font-semibold prose-img:rounded-xl"
        dangerouslySetInnerHTML={{ __html: opened.content?.content_html || "<p></p>" }}
      />
    </ItemFrame>
  );
};

const VideoView: React.FC<{ opened: OpenedItem }> = ({ opened }) => {
  const src = opened.content?.embed_url as string | undefined;
  return (
    <ItemFrame opened={opened} wide>
      <div className="rounded-2xl overflow-hidden bg-black shadow-soft" style={{ aspectRatio: "16 / 9", maxWidth: "100%" }}>
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
          <a href={opened.content?.external_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center h-full text-white text-sm">
            Open video
          </a>
        )}
      </div>
      {opened.item.description && <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{opened.item.description}</p>}
    </ItemFrame>
  );
};

export default ItemView;
