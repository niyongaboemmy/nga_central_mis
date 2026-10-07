import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useMetadata } from "./MetadataContext";
import { AcademicYear, AcademicTerm } from "../api/academics";

const YEAR_STORAGE_KEY = "academic_period_year_id";
const TERM_STORAGE_KEY = "academic_period_term_id";

interface AcademicPeriodContextType {
  years: AcademicYear[];
  terms: AcademicTerm[];
  selectedYearId: number | null;
  selectedTermId: number | null;
  selectedYear: AcademicYear | null;
  selectedTerm: AcademicTerm | null;
  setSelectedYearId: (id: number) => void;
  setSelectedTermId: (id: number) => void;
  loading: boolean;
}

const AcademicPeriodContext = createContext<
  AcademicPeriodContextType | undefined
>(undefined);

const readStoredId = (key: string): number | null => {
  const saved = localStorage.getItem(key);
  const parsed = saved ? Number(saved) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const AcademicPeriodProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { years, getTerms, termsCache, loading: metadataLoading } =
    useMetadata();

  const [selectedYearId, setSelectedYearIdState] = useState<number | null>(
    () => readStoredId(YEAR_STORAGE_KEY),
  );
  const [selectedTermId, setSelectedTermIdState] = useState<number | null>(
    () => readStoredId(TERM_STORAGE_KEY),
  );
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termsLoading, setTermsLoading] = useState(false);

  // Once years are available, make sure the selected year is valid; otherwise
  // fall back to the year flagged `is_current`, or the first available year.
  useEffect(() => {
    if (years.length === 0) return;
    const isValid = years.some(
      (y) => y.academic_year_id === selectedYearId,
    );
    if (!isValid) {
      const currentYear =
        years.find((y) => y.is_current) || years[0];
      setSelectedYearIdState(currentYear.academic_year_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years]);

  // Whenever the selected year changes, load its terms and make sure the
  // selected term is valid for that year; otherwise default to `is_current`.
  useEffect(() => {
    // `years` is only populated post-login (MetadataContext gates its fetch on
    // `isAuthenticated`). Without this guard, a `selectedYearId` restored from
    // localStorage on the very first (pre-login) app mount fires an
    // unauthenticated terms request that 401s; MetadataContext.getTerms
    // swallows that error and returns `[]` uncached, which we'd then commit as
    // the permanent terms list — never retried after the user actually logs
    // in, since the failed fetch never changes `termsCache[selectedYearId]`.
    if (!selectedYearId || years.length === 0) {
      setTerms([]);
      return;
    }
    let cancelled = false;
    setTermsLoading(true);
    getTerms(selectedYearId).then((data) => {
      if (cancelled) return;
      setTerms(data);
      setTermsLoading(false);
      setSelectedTermIdState((prev) => {
        const isValid = data.some((t) => t.academic_term_id === prev);
        if (isValid) return prev;
        const currentTerm = data.find((t) => t.is_current) || data[0];
        return currentTerm ? currentTerm.academic_term_id : null;
      });
    });
    return () => {
      cancelled = true;
    };
    // `termsCache[selectedYearId]` is included so this re-runs after
    // `invalidateTerms` clears the cache entry (e.g. a term was just
    // created/edited/deleted elsewhere) — otherwise this only re-fetches
    // on year change. `years.length` is included so this re-runs once years
    // finish loading post-login, even when `selectedYearId` (restored from
    // localStorage) was already valid and therefore didn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId, getTerms, termsCache[selectedYearId ?? -1], years.length]);

  useEffect(() => {
    if (selectedYearId != null) {
      localStorage.setItem(YEAR_STORAGE_KEY, String(selectedYearId));
    }
  }, [selectedYearId]);

  useEffect(() => {
    if (selectedTermId != null) {
      localStorage.setItem(TERM_STORAGE_KEY, String(selectedTermId));
    }
  }, [selectedTermId]);

  const setSelectedYearId = useCallback((id: number) => {
    setSelectedYearIdState(id);
    setSelectedTermIdState(null); // re-seeded once terms for the new year load
    localStorage.removeItem(TERM_STORAGE_KEY);
  }, []);

  const setSelectedTermId = useCallback((id: number) => {
    setSelectedTermIdState(id);
  }, []);

  const selectedYear = useMemo(
    () => years.find((y) => y.academic_year_id === selectedYearId) || null,
    [years, selectedYearId],
  );
  const selectedTerm = useMemo(
    () => terms.find((t) => t.academic_term_id === selectedTermId) || null,
    [terms, selectedTermId],
  );

  return (
    <AcademicPeriodContext.Provider
      value={{
        years,
        terms,
        selectedYearId,
        selectedTermId,
        selectedYear,
        selectedTerm,
        setSelectedYearId,
        setSelectedTermId,
        loading: metadataLoading.years || termsLoading,
      }}
    >
      {children}
    </AcademicPeriodContext.Provider>
  );
};

/** Like useAcademicPeriod, but null outside the provider (for shell chrome such as the sidebar). */
export const useOptionalAcademicPeriod = (): AcademicPeriodContextType | null =>
  useContext(AcademicPeriodContext) ?? null;

export const useAcademicPeriod = (): AcademicPeriodContextType => {
  const context = useContext(AcademicPeriodContext);
  if (!context) {
    throw new Error(
      "useAcademicPeriod must be used within an AcademicPeriodProvider",
    );
  }
  return context;
};
