import React, { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { AlertTriangle, Loader2 } from "lucide-react";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Vite bundles the worker as its own chunk; pdf.js needs its URL up front. Pinned to the
// pdfjs-dist react-pdf itself depends on so the API and worker versions can never drift.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface PdfPagesViewerProps {
  /** The PDF bytes. A Blob (from an authenticated fetch) — never a bare URL, since <img>-style
   *  URL loading couldn't carry the platform's Authorization header. */
  file: Blob | null;
  /** Rendered page width in CSS px; height follows the page's own aspect ratio. */
  pageWidth: number;
  /** Fires once the document is parsed — the parent shows "N pages" and enables navigation. */
  onLoaded?: (numPages: number) => void;
  /** The page currently taking up most of the viewport (1-based). */
  onVisiblePageChange?: (page: number) => void;
  /** Ref to the scroll container that hosts the pages, so the parent can scroll to a page. */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** Extra classes for each page sheet (e.g. the reader's paper theme). */
  sheetClassName?: string;
  /** When false, pages render as plain images with no selectable text (teacher preview). */
  textLayer?: boolean;
  onError?: (message: string) => void;
}

// How many pages either side of the viewport to keep rendered. Rendering every page of a
// 40-page handout up front would freeze low-end laptops and phones; rendering only the
// viewport would flash blank on every scroll. Two each side keeps scrolling smooth.
const RENDER_MARGIN = 2;

const PdfPagesViewer: React.FC<PdfPagesViewerProps> = ({
  file,
  pageWidth,
  onLoaded,
  onVisiblePageChange,
  containerRef,
  sheetClassName = "",
  textLayer = true,
  onError,
}) => {
  const [numPages, setNumPages] = useState(0);
  const [pageRatio, setPageRatio] = useState(1.414); // A4 portrait until page 1 reports its size
  const [visiblePage, setVisiblePage] = useState(1);
  const [failed, setFailed] = useState<string | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // pdf.js is handed an object URL rather than the bytes: passing a Uint8Array lets the
  // worker take ownership of (detach) the buffer, so any later re-render that re-supplies
  // the same array would blow up. A stable URL string sidesteps that entirely.
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailed(null);
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleLoaded = useCallback(
    async (pdf: { numPages: number; getPage: (n: number) => Promise<any> }) => {
      setNumPages(pdf.numPages);
      onLoaded?.(pdf.numPages);
      try {
        const first = await pdf.getPage(1);
        const [, , w, h] = first.view as number[];
        if (w > 0 && h > 0) setPageRatio(h / w);
      } catch {
        // keep the A4 placeholder ratio
      }
    },
    [onLoaded],
  );

  // Track which page fills the viewport most, using the scroll container as the root when
  // the parent gave us one (the app shell scrolls an inner element, not the window).
  useEffect(() => {
    if (numPages === 0) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio));
        let best = visiblePage;
        let bestRatio = -1;
        ratios.forEach((r, p) => {
          if (r > bestRatio) {
            bestRatio = r;
            best = p;
          }
        });
        setVisiblePage(best);
      },
      { root: containerRef?.current ?? null, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    pageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, containerRef]);

  useEffect(() => {
    onVisiblePageChange?.(visiblePage);
  }, [visiblePage, onVisiblePageChange]);

  const placeholderHeight = Math.round(pageWidth * pageRatio);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        {failed}
      </div>
    );
  }

  if (!fileUrl) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-xs">Opening PDF...</p>
      </div>
    );
  }

  return (
    <Document
      file={fileUrl}
      onLoadSuccess={handleLoaded}
      onLoadError={(err) => {
        const message = "This PDF could not be displayed.";
        setFailed(message);
        onError?.(err?.message || message);
      }}
      loading={
        <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-xs">Preparing pages...</p>
        </div>
      }
      className="flex flex-col items-center gap-5"
    >
      {Array.from({ length: numPages }, (_, i) => {
        const pageNumber = i + 1;
        const shouldRender = Math.abs(pageNumber - visiblePage) <= RENDER_MARGIN;
        return (
          <div
            key={pageNumber}
            ref={(el) => {
              pageRefs.current[i] = el;
            }}
            data-page={pageNumber}
            className={`lesson-pdf-sheet ${sheetClassName}`}
            style={{ width: pageWidth, minHeight: placeholderHeight }}
          >
            {shouldRender ? (
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer={textLayer}
                renderAnnotationLayer={false}
                loading={<div style={{ width: pageWidth, height: placeholderHeight }} />}
              />
            ) : (
              <div style={{ width: pageWidth, height: placeholderHeight }} />
            )}
            <span className="lesson-pdf-sheet__number">{pageNumber}</span>
          </div>
        );
      })}
    </Document>
  );
};

export default PdfPagesViewer;
