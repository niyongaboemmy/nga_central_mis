import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  academicYearsApi,
  academicTermsApi,
  programsApi,
  gradesApi,
  AcademicYear,
  AcademicTerm,
  Program,
  Grade,
} from "../api/academics";
import { useUser } from "./UserContext";

interface MetadataState {
  years: AcademicYear[];
  programs: Program[];
  terms: Record<number, AcademicTerm[]>;
  grades: Record<number, Grade[]>;
}

interface MetadataContextType {
  years: AcademicYear[];
  programs: Program[];
  termsCache: Record<number, AcademicTerm[]>;
  getTerms: (yearId: number) => Promise<AcademicTerm[]>;
  getGrades: (programId: number) => Promise<Grade[]>;
  refreshYears: () => Promise<void>;
  refreshPrograms: () => Promise<void>;
  invalidateTerms: (yearId: number) => void;
  invalidateGrades: (programId: number) => void;
  loading: {
    years: boolean;
    programs: boolean;
    terms: Record<number, boolean>;
    grades: Record<number, boolean>;
  };
}

const MetadataContext = createContext<MetadataContextType | undefined>(undefined);

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

export const MetadataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [loading, setLoading] = useState({
    years: false,
    programs: false,
    terms: {} as Record<number, boolean>,
    grades: {} as Record<number, boolean>,
  });

  const fetchingYearsRef = React.useRef(false);
  const fetchingProgramsRef = React.useRef(false);
  // Maps to the in-flight request promise (not just a boolean) so that
  // overlapping callers — e.g. React StrictMode's double effect-invocation
  // in dev — await the same fetch instead of getting an empty placeholder
  // result back, which previously overwrote real data with `[]`.
  const fetchingTermsRef = React.useRef<Map<number, Promise<AcademicTerm[]>>>(
    new Map(),
  );
  const fetchingGradesRef = React.useRef<Map<number, Promise<Grade[]>>>(
    new Map(),
  );

  const [state, setState] = useState<MetadataState>(() => {
    const saved = sessionStorage.getItem("metadata_cache");
    if (saved) {
      try {
        const { timestamp, data } = JSON.parse(saved);
        if (Date.now() - timestamp < CACHE_EXPIRY) {
          return data;
        }
      } catch (e) {
        console.error("Failed to parse metadata cache", e);
      }
    }
    return {
      years: [],
      programs: [],
      terms: {},
      grades: {},
    };
  });

  // Mirrors `state` synchronously so getTerms/getGrades can read the latest
  // cache without depending on `state` — a dependency on `state.terms`/
  // `state.grades` gives these callbacks a new identity on every fetch
  // (even a cache-miss for an empty result), which previously caused an
  // infinite fetch loop for any year/program with zero terms/grades.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const saveToSession = useCallback((updates: Partial<MetadataState>) => {
    setState((prev) => {
      const updated = { ...prev, ...updates };
      sessionStorage.setItem(
        "metadata_cache",
        JSON.stringify({
          timestamp: Date.now(),
          data: updated,
        })
      );
      return updated;
    });
  }, []);

  const refreshYears = useCallback(async () => {
    if (fetchingYearsRef.current) return;
    fetchingYearsRef.current = true;
    setLoading((prev) => ({ ...prev, years: true }));
    try {
      const res = await academicYearsApi.getAll();
      const data = (res.data as any)?.data || (res.data as any) || [];
      const yearsList = Array.isArray(data) ? data : [];
      saveToSession({ years: yearsList });
    } catch (e) {
      console.error("Failed to fetch years", e);
    } finally {
      setLoading((prev) => ({ ...prev, years: false }));
      fetchingYearsRef.current = false;
    }
  }, [saveToSession]);

  const refreshPrograms = useCallback(async () => {
    if (fetchingProgramsRef.current) return;
    fetchingProgramsRef.current = true;
    setLoading((prev) => ({ ...prev, programs: true }));
    try {
      const res = await programsApi.getAll();
      const data = res.data.data || [];
      saveToSession({ programs: data });
    } catch (e) {
      console.error("Failed to fetch programs", e);
    } finally {
      setLoading((prev) => ({ ...prev, programs: false }));
      fetchingProgramsRef.current = false;
    }
  }, [saveToSession]);

  const getTerms = useCallback((yearId: number): Promise<AcademicTerm[]> => {
    // `yearId in terms` (not `.length > 0`) so a year with zero terms is
    // still cached — otherwise every call re-fetches, which combined with
    // an unstable callback identity caused an infinite request loop.
    const cached = stateRef.current.terms[yearId];
    if (cached !== undefined) return Promise.resolve(cached);

    const inFlight = fetchingTermsRef.current.get(yearId);
    if (inFlight) return inFlight;

    const request = (async () => {
      setLoading((prev) => ({
        ...prev,
        terms: { ...prev.terms, [yearId]: true },
      }));
      try {
        const res = await academicTermsApi.getAll(yearId);
        const data = (res.data as any)?.data || (res.data as any) || [];
        const termsList = Array.isArray(data) ? data : [];

        setState((prev) => {
          const newTerms = { ...prev.terms, [yearId]: termsList };
          const updated = { ...prev, terms: newTerms };
          stateRef.current = updated;
          sessionStorage.setItem(
            "metadata_cache",
            JSON.stringify({
              timestamp: Date.now(),
              data: updated,
            })
          );
          return updated;
        });
        return termsList;
      } catch (e) {
        console.error(`Failed to fetch terms for year ${yearId}`, e);
        return [];
      } finally {
        setLoading((prev) => ({
          ...prev,
          terms: { ...prev.terms, [yearId]: false },
        }));
        fetchingTermsRef.current.delete(yearId);
      }
    })();

    fetchingTermsRef.current.set(yearId, request);
    return request;
  }, []);

  // Drops a year's cached terms so the next `getTerms` call re-fetches instead
  // of returning a stale (possibly empty) list after a term is created/edited/
  // deleted outside this context (e.g. from the Academics admin page).
  const invalidateTerms = useCallback((yearId: number) => {
    setState((prev) => {
      if (!(yearId in prev.terms)) return prev;
      const newTerms = { ...prev.terms };
      delete newTerms[yearId];
      const updated = { ...prev, terms: newTerms };
      stateRef.current = updated;
      sessionStorage.setItem(
        "metadata_cache",
        JSON.stringify({ timestamp: Date.now(), data: updated })
      );
      return updated;
    });
  }, []);

  const invalidateGrades = useCallback((programId: number) => {
    setState((prev) => {
      if (!(programId in prev.grades)) return prev;
      const newGrades = { ...prev.grades };
      delete newGrades[programId];
      const updated = { ...prev, grades: newGrades };
      stateRef.current = updated;
      sessionStorage.setItem(
        "metadata_cache",
        JSON.stringify({ timestamp: Date.now(), data: updated })
      );
      return updated;
    });
  }, []);

  const getGrades = useCallback((programId: number): Promise<Grade[]> => {
    const cached = stateRef.current.grades[programId];
    if (cached !== undefined) return Promise.resolve(cached);

    const inFlight = fetchingGradesRef.current.get(programId);
    if (inFlight) return inFlight;

    const request = (async () => {
      setLoading((prev) => ({
        ...prev,
        grades: { ...prev.grades, [programId]: true },
      }));
      try {
        const res = await gradesApi.getAll(programId);
        const gradesList = res.data.data || [];

        setState((prev) => {
          const newGrades = { ...prev.grades, [programId]: gradesList };
          const updated = { ...prev, grades: newGrades };
          stateRef.current = updated;
          sessionStorage.setItem(
            "metadata_cache",
            JSON.stringify({
              timestamp: Date.now(),
              data: updated,
            })
          );
          return updated;
        });
        return gradesList;
      } catch (e) {
        console.error(`Failed to fetch grades for program ${programId}`, e);
        return [];
      } finally {
        setLoading((prev) => ({
          ...prev,
          grades: { ...prev.grades, [programId]: false },
        }));
        fetchingGradesRef.current.delete(programId);
      }
    })();

    fetchingGradesRef.current.set(programId, request);
    return request;
  }, []);

  // Loads once a token exists. The provider is mounted above the router (so
  // it also covers /login), so without this guard the fetch fires pre-login,
  // gets a 401, and — since the effect only ran once — never retries after
  // the user actually signs in, leaving `years` permanently empty.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (state.years.length === 0) refreshYears();
    if (state.programs.length === 0) refreshPrograms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <MetadataContext.Provider
      value={{
        years: state.years,
        programs: state.programs,
        termsCache: state.terms,
        getTerms,
        getGrades,
        refreshYears,
        refreshPrograms,
        invalidateTerms,
        invalidateGrades,
        loading,
      }}
    >
      {children}
    </MetadataContext.Provider>
  );
};

export const useMetadata = () => {
  const context = useContext(MetadataContext);
  if (!context) {
    throw new Error("useMetadata must be used within a MetadataProvider");
  }
  return context;
};
