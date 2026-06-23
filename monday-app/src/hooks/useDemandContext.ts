import { useEffect, useState } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_DEMAND_WITH_SUBITEMS } from '../services/queries';
import type { DemandOverview, DemandLine, DateRange } from '../types';

interface ColumnValue {
  id: string;
  text: string;
  value: string;
}

interface RawItem {
  id: string;
  name: string;
  column_values: ColumnValue[];
  subitems?: RawItem[];
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

  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      const pulseIds = parsed.linkedPulseIds || parsed.linked_pulse_ids;
      if (Array.isArray(pulseIds) && pulseIds.length > 0) {
        return String(pulseIds[0].linkedPulseId || pulseIds[0].linked_pulse_id);
      }
      if (Array.isArray(parsed.linked_item_ids) && parsed.linked_item_ids.length > 0) {
        return String(parsed.linked_item_ids[0]);
      }
      if (Array.isArray(parsed.item_ids) && parsed.item_ids.length > 0) {
        return String(parsed.item_ids[0]);
      }
    } catch { /* ignore */ }
  }

  return null;
}

function parseNumber(col: ColumnValue | undefined): number {
  if (!col?.text) return 0;
  const n = parseInt(col.text, 10);
  return isNaN(n) ? 0 : n;
}

function parseDemandLine(
  subitem: RawItem,
  catalogueColumnId: string,
  quantiteColumnId: string,
): DemandLine {
  const catalogueCol = findColumn(subitem.column_values, catalogueColumnId);
  const familyId = parseConnectedItemId(catalogueCol);
  const quantite = parseNumber(findColumn(subitem.column_values, quantiteColumnId));

  let error: string | null = null;
  if (!familyId) {
    error = 'Aucun matériel lié dans le catalogue.';
  } else if (!quantite) {
    error = 'Quantité non renseignée.';
  }

  return {
    subitemId: subitem.id,
    familyId,
    familyName: catalogueCol?.text || subitem.name,
    quantite,
    error,
  };
}

export function useDemandContext(
  itemId: string | null,
  config: {
    dateFormationColumnId: string;
    quantiteColumnId: string;
    connexionCatalogueColumnId: string;
  },
) {
  const [demand, setDemand] = useState<DemandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;

    setLoading(true);
    setError(null);

    apiCall<{ items: RawItem[] }>(GET_DEMAND_WITH_SUBITEMS, { itemId: [itemId] })
      .then(data => {
        const item = data.items?.[0];
        if (!item) {
          setError('Demande introuvable.');
          return;
        }

        console.log('[INA Stock] Demand columns:', item.column_values.map(c => ({
          id: c.id, text: c.text, value: c.value?.slice(0, 100),
        })));

        const dateRange = parseDateRange(
          findColumn(item.column_values, config.dateFormationColumnId),
        );
        if (!dateRange) {
          setError('Veuillez renseigner la date de la formation sur cette demande.');
          return;
        }

        const subitems = item.subitems || [];
        if (subitems.length === 0) {
          setError('Aucun sous-élément de matériel trouvé pour cette demande.');
          return;
        }

        console.log('[INA Stock] Found', subitems.length, 'sub-items');
        if (subitems[0]) {
          const cols = subitems[0].column_values;
          const catalogueCol = cols.find(c => c.id === config.connexionCatalogueColumnId);
          console.log('[INA Stock] CATALOGUE COLUMN RAW:', JSON.stringify(catalogueCol));
          console.log('[INA Stock] ALL SUB-ITEM COLS:', JSON.stringify(cols.map(c => c.id + '=' + (c.value || '(null)').slice(0, 80))));
        }

        const formationNameCol = findColumn(item.column_values, 'text_mm295wsj');

        const lines = subitems.map(si =>
          parseDemandLine(si, config.connexionCatalogueColumnId, config.quantiteColumnId),
        );

        setDemand({
          parentId: item.id,
          parentName: item.name,
          formationName: formationNameCol?.text || '',
          dateRange,
          lines,
        });
      })
      .catch(err => {
        console.error('[INA Stock] Demand fetch error:', err);
        setError(err.message || 'Erreur lors du chargement de la demande.');
      })
      .finally(() => setLoading(false));
  }, [itemId, config.dateFormationColumnId, config.quantiteColumnId, config.connexionCatalogueColumnId]);

  return { demand, loading, error };
}
