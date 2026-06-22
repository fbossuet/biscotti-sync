import { useEffect, useState } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_SUBITEM_CONTEXT } from '../services/queries';
import type { DemandContext, DateRange } from '../types';

interface ColumnValue {
  id: string;
  text: string;
  value: string;
}

interface ItemData {
  id: string;
  name: string;
  column_values: ColumnValue[];
  parent_item?: {
    id: string;
    name: string;
    column_values: ColumnValue[];
  };
}

function findColumn(cols: ColumnValue[], id: string): ColumnValue | undefined {
  return cols.find(c => c.id === id);
}

function parseDateRange(col: ColumnValue | undefined): DateRange | null {
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    if (parsed.from && parsed.to) return { from: parsed.from, to: parsed.to };
  } catch { /* ignore */ }
  return null;
}

function parseConnectedItemId(col: ColumnValue | undefined): string | null {
  if (!col) return null;
  console.log('[INA Stock] Parsing board_relation column:', { id: col.id, text: col.text, value: col.value });

  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      // Format v1: {"linkedPulseIds":[{"linkedPulseId":123}]}
      const pulseIds = parsed.linkedPulseIds || parsed.linked_pulse_ids;
      if (Array.isArray(pulseIds) && pulseIds.length > 0) {
        return String(pulseIds[0].linkedPulseId || pulseIds[0].linked_pulse_id);
      }
      // Format v2: {"linked_item_ids":["123"]}
      if (Array.isArray(parsed.linked_item_ids) && parsed.linked_item_ids.length > 0) {
        return String(parsed.linked_item_ids[0]);
      }
      // Format v3: {"item_ids":[123]}
      if (Array.isArray(parsed.item_ids) && parsed.item_ids.length > 0) {
        return String(parsed.item_ids[0]);
      }
    } catch { /* ignore */ }
  }

  // Fallback: extract ID from text if it contains a number
  if (col.text) {
    const match = col.text.match(/^(\d+)/);
    if (match) return match[1];
  }
  return null;
}

function parseNumber(col: ColumnValue | undefined): number {
  if (!col?.text) return 0;
  const n = parseInt(col.text, 10);
  return isNaN(n) ? 0 : n;
}

export function useSubitemContext(
  itemId: string | null,
  config: {
    dateFormationColumnId: string;
    quantiteColumnId: string;
    connexionCatalogueColumnId: string;
  },
) {
  const [demand, setDemand] = useState<DemandContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;

    setLoading(true);
    setError(null);

    apiCall<{ items: ItemData[] }>(GET_SUBITEM_CONTEXT, { itemId: [itemId] })
      .then(data => {
        const item = data.items?.[0];
        if (!item) {
          setError('Sous-élément introuvable.');
          return;
        }

        console.log('[INA Stock] Sub-item columns:', item.column_values.map(c => ({
          id: c.id, text: c.text, value: c.value,
        })));

        const parent = item.parent_item;
        if (!parent) {
          setError('Demande parente introuvable.');
          return;
        }

        console.log('[INA Stock] Parent columns:', parent.column_values.map(c => ({
          id: c.id, text: c.text, value: c.value,
        })));

        const dateRange = parseDateRange(
          findColumn(parent.column_values, config.dateFormationColumnId),
        );
        if (!dateRange) {
          setError('Veuillez renseigner les dates de la formation sur la demande principale.');
          return;
        }

        const familyId = parseConnectedItemId(
          findColumn(item.column_values, config.connexionCatalogueColumnId),
        );
        if (!familyId) {
          setError('Veuillez sélectionner un type de matériel dans le catalogue.');
          return;
        }

        const quantite = parseNumber(
          findColumn(item.column_values, config.quantiteColumnId),
        );
        if (!quantite) {
          setError('Veuillez indiquer la quantité souhaitée.');
          return;
        }

        const catalogueCol = findColumn(item.column_values, config.connexionCatalogueColumnId);

        setDemand({
          itemId: item.id,
          parentItemId: parent.id,
          sousFamille: '',
          familyId,
          familyName: catalogueCol?.text || '',
          os: '',
          dateRange,
          quantite,
        });
      })
      .catch(err => {
        setError(err.message || 'Erreur lors du chargement.');
      })
      .finally(() => setLoading(false));
  }, [itemId, config.dateFormationColumnId, config.quantiteColumnId, config.connexionCatalogueColumnId]);

  return { demand, loading, error };
}
