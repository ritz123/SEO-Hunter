import { useState, useEffect, useCallback } from 'react';
import { fetchBusinesses } from '../api';

export function useBusinesses() {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBusinesses({ limit: 2000 });
      setBusinesses(res.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { businesses, loading, error, reload: load };
}
