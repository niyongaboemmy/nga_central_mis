import { useCallback, useEffect, useRef, useState } from "react";

/** Load a report and keep the previous data visible while a new range loads. */
export function useReport<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => {
        if (n === seq.current) setData(d);
      })
      .catch((e) => {
        if (n === seq.current) setError(e?.response?.status === 403 ? "You don't have access to this report." : e?.response?.data?.message || "Couldn't load this report.");
      })
      .finally(() => {
        if (n === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(run, [run]);
  return { data, loading, error, reload: run };
}
