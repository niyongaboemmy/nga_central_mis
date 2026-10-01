import React, { useCallback, useEffect, useState } from "react";
import { elearningApi, FilePreviewManifest } from "../../../api/elearning";
import { API_BASE_URL } from "../../../services/api";
import { getToken } from "../../../utils/auth";
import FilePreview from "../../files/FilePreview";

/** The teacher's view of a FILE / material item: exactly what students will see (§10.6). */
const BuilderFilePreview: React.FC<{ itemId: number }> = ({ itemId }) => {
  const [manifest, setManifest] = useState<FilePreviewManifest | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    elearningApi
      .builderItemPreview(itemId)
      .then((r) => !off && setManifest(r.data.data))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [itemId]);
  const url = (extra: string) => `${API_BASE_URL}/elearning/items/${itemId}/file?${extra}&token=${encodeURIComponent(getToken() || "")}`;
  const load = useCallback(async (v: "original" | "pdf" | "text") => (await elearningApi.builderItemFileBlob(itemId, v)).data, [itemId]);
  const refresh = useCallback(async () => (await elearningApi.builderItemPreview(itemId)).data.data, [itemId]);
  if (failed) return <p className="text-sm text-slate-600 dark:text-slate-300">This file couldn't be found.</p>;
  if (!manifest) return <div className="h-32 rounded-xl bg-gray-100 dark:bg-white/10 animate-pulse" aria-busy="true" />;
  return <FilePreview compact manifest={manifest} loadVariant={load} refreshManifest={refresh} mediaUrl={url("variant=original")} onDownload={() => (window.location.href = url("download=1"))} />;
};

export default BuilderFilePreview;
