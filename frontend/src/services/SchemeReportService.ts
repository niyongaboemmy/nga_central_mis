import { schemeOfWorkApi } from "../api/schemeOfWork";

/**
 * Thin client for the backend-rendered Scheme of Work PDF (see
 * backend/src/services/schemeReportPdf.ts). Replaces the old client-side jsPDF/jspdf-autotable
 * construction — the backend renderer is the single source of truth for both preview and
 * download, so they're always pixel-identical, and it can embed dynamic school logos and
 * cover-page data that the old hardcoded-literal client build never had access to.
 */
export const SchemeReportService = {
  /** Fetches the PDF and returns a local blob: URL suitable for an <iframe src>. The caller is
   * responsible for revoking it (e.g. on modal close) once no longer needed. */
  getPreviewBlobUrl: async (schemeId: number): Promise<string> => {
    const res = await schemeOfWorkApi.getSchemePdfBlob(schemeId, "preview");
    return URL.createObjectURL(res.data);
  },

  /** Fetches the PDF and triggers a browser download with a sensible filename. */
  downloadPdf: async (schemeId: number, filenameBase: string): Promise<void> => {
    const res = await schemeOfWorkApi.getSchemePdfBlob(schemeId, "download");
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenameBase.replace(/\s+/g, "_")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
