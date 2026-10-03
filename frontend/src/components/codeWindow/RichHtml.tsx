import React, { useLayoutEffect, useRef } from "react";
import { enhanceCodeBlocks, CodeWindowOptions } from "./codeWindow";

/** Saved lesson HTML (already sanitised server-side) with its code shown as editor
 *  windows. For places that otherwise render the HTML inline with nothing to hydrate. */
const RichHtml: React.FC<{
  html: string;
  className?: string;
  style?: React.CSSProperties;
  codeOptions?: CodeWindowOptions;
}> = ({ html, className, style, codeOptions }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    enhanceCodeBlocks(ref.current, codeOptions);
    // codeOptions is read once per render of new HTML, like the HTML itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  return <div ref={ref} className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default RichHtml;
