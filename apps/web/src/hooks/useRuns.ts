import { useCallback, useEffect, useState } from 'react';
import { fetchRuns, fetchRunDetail } from '../api/runs';
import { ApiError } from '../api/client';
import type { RunDetail, RunSummary } from '../types';

export function useRuns(refreshKey = 0, enabled = true) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setRuns([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuns({ limit: 500 });
      setRuns(data.runs);
      setTotal(data.total);
    } catch (e) {
      setRuns([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { runs, total, loading, error, reload };
}

export function useRunDetail(runId: string | null, enabled = true) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !enabled) {
      setRun(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRunDetail(runId)
      .then((data) => { if (!cancelled) setRun(data); })
      .catch((e) => {
        if (!cancelled) {
          setRun(null);
          setError(e instanceof ApiError ? e.message : 'Failed to load run');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId, enabled]);

  return { run, loading, error };
}
