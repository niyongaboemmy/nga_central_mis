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

interface MetadataState {
  years: AcademicYear[];
  programs: Program[];
  terms: Record<number, AcademicTerm[]>;
  grades: Record<number, Grade[]>;
}

interface MetadataContextType {
  years: AcademicYear[];
  programs: Program[];
  getTerms: (yearId: number) => Promise<AcademicTerm[]>;
  getGrades: (programId: number) => Promise<Grade[]>;
  refreshYears: () => Promise<void>;
  refreshPrograms: () => Promise<void>;
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
  const [loading, setLoading] = useState({
    years: false,
    programs: false,
    terms: {} as Record<number, boolean>,
    grades: {} as Record<number, boolean>,
  });

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
    }
  }, [saveToSession]);

  const refreshPrograms = useCallback(async () => {
    setLoading((prev) => ({ ...prev, programs: true }));
    try {
      const res = await programsApi.getAll();
      const data = res.data.data || [];
      saveToSession({ programs: data });
    } catch (e) {
      console.error("Failed to fetch programs", e);
    } finally {
      setLoading((prev) => ({ ...prev, programs: false }));
    }
  }, [saveToSession]);

  const getTerms = useCallback(async (yearId: number) => {
    if (state.terms[yearId] && state.terms[yearId].length > 0) return state.terms[yearId];
    
    setLoading((prev) => ({ ...prev, terms: { ...prev.terms, [yearId]: true } }));
    try {
      const res = await academicTermsApi.getAll(yearId);
      const data = (res.data as any)?.data || (res.data as any) || [];
      const termsList = Array.isArray(data) ? data : [];
      
      setState(prev => {
        const newTerms = { ...prev.terms, [yearId]: termsList };
        const updated = { ...prev, terms: newTerms };
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
      setLoading((prev) => ({ ...prev, terms: { ...prev.terms, [yearId]: false } }));
    }
  }, [state.terms]);

  const getGrades = useCallback(async (programId: number) => {
    if (state.grades[programId] && state.grades[programId].length > 0) return state.grades[programId];
    
    setLoading((prev) => ({ ...prev, grades: { ...prev.grades, [programId]: true } }));
    try {
      const res = await gradesApi.getAll(programId);
      const gradesList = res.data.data || [];
      
      setState(prev => {
        const newGrades = { ...prev.grades, [programId]: gradesList };
        const updated = { ...prev, grades: newGrades };
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
      setLoading((prev) => ({ ...prev, grades: { ...prev.grades, [programId]: false } }));
    }
  }, [state.grades]);

  // Initial load if empty
  useEffect(() => {
    if (state.years.length === 0) refreshYears();
    if (state.programs.length === 0) refreshPrograms();
  }, []);

  return (
    <MetadataContext.Provider
      value={{
        years: state.years,
        programs: state.programs,
        getTerms,
        getGrades,
        refreshYears,
        refreshPrograms,
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
