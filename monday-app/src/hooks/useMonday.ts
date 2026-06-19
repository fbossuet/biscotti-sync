import { useEffect, useState, useRef } from 'react';
import { initMonday, listen } from '../services/monday-api';

interface MondayContext {
  itemId: string;
  boardId: string;
  theme: string;
}

export function useMonday() {
  const [context, setContext] = useState<MondayContext | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const monday = initMonday();

    monday.get('context').then((res: { data: MondayContext }) => {
      setContext(res.data);
      setLoading(false);
    });

    listen('context', (data: unknown) => {
      const ctx = data as { data: MondayContext };
      setContext(ctx.data);
    });
  }, []);

  return { context, loading };
}
