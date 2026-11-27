import api from "./api";
import { setLetterheadSource } from "../utils/documentLetterhead";

/**
 * Ties the document letterhead (utils/documentLetterhead.ts) to this app: the signed-in
 * school's header and footer come from GET /schools/profile. Imported once, from main.tsx.
 */
setLetterheadSource(async () => {
  const p = (await api.get("/schools/profile")).data?.data;
  if (!p) return null;
  return {
    schoolName: p.name ?? null,
    headerUrl: p.documents_logo_url ?? null,
    fallbackLogoUrl: p.logo_url ?? null,
    footerUrl: p.documents_footer_url ?? null,
    footerText: p.documents_footer_text ?? null,
  };
});
