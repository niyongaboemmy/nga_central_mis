import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";

/**
 * A .docx in the browser (docx-preview) — the fallback while the server's PDF is not ready.
 * The rendered DOM goes through DOMPurify: links may only be http(s)/mailto and open in a new
 * tab; scripts and event handlers never survive. Lazy-loaded (it brings JSZip with it).
 */
const DocxRenderer: React.FC<{ blob: Blob; onError: (m: string) => void }> = ({ blob, onError }) => {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        const scratch = document.createElement("div");
        await renderAsync(await blob.arrayBuffer(), scratch, undefined, {
          className: "docx",
          inWrapper: false,
          ignoreWidth: true,
          ignoreHeight: true,
          breakPages: false,
          renderHeaders: false,
          renderFooters: false,
          useBase64URL: true,
        });
        if (off || !host.current) return;
        const clean = DOMPurify.sanitize(scratch.innerHTML, {
          ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/)/i,
          FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
          ADD_ATTR: ["target"],
        });
        host.current.innerHTML = clean;
        host.current.querySelectorAll("a[href]").forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
        setReady(true);
      } catch {
        if (!off) onError("This document couldn't be shown here.");
      }
    })();
    return () => {
      off = true;
    };
  }, [blob, onError]);
  return (
    <div tabIndex={0} role="region" aria-label="Document preview" className="max-h-[75vh] overflow-auto focus:outline-none focus-visible:shadow-glow bg-white text-gray-900 rounded-xl p-4 sm:p-8">
      {!ready && <div className="h-40 animate-pulse rounded bg-gray-100" aria-busy="true" />}
      <div ref={host} className="docx-host prose prose-sm max-w-none [&_img]:max-w-full [&_table]:w-full" />
    </div>
  );
};

export default DocxRenderer;
