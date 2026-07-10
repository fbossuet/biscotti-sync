import { useEffect, useState, useRef } from 'react';
import { initMonday, listen } from '../services/monday-api';

interface MondayContext {
  itemId: string;
  boardId: string;
  theme: string;
}

type MondaySettings = Record<string, unknown>;

export function useMonday() {
  const [context, setContext] = useState<MondayContext | null>(null);
  const [settings, setSettings] = useState<MondaySettings>({});
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

    // Settings du widget (config par installation : ids de boards/colonnes).
    monday.get('settings').then((res: { data?: MondaySettings }) => {
      if (res?.data) setSettings(res.data);
    });

    listen('context', (data: unknown) => {
      const ctx = data as { data: MondayContext };
      setContext(ctx.data);
    });

    listen('settings', (data: unknown) => {
      const s = data as { data?: MondaySettings };
      if (s?.data) setSettings(s.data);
    });
  }, []);

  return { context, settings, loading };
}
