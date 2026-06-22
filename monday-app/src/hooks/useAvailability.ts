import { useEffect, useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_CATALOGUE_ITEM_WITH_SUBITEMS, GET_RESERVATIONS_FOR_EQUIPMENT } from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import type { DateRange, Equipment, AvailabilityResult, BoardConfig, DemandLine } from '../types';

interface RawItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string }[];
  subitems?: RawItem[];
}

function parseSubitemEquipment(item: RawItem): Equipment {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);
  const statusCol = getCol('status');
  const statusText = (statusCol?.text || 'disponible').toLowerCase();

  return {
    id: item.id,
    name: item.name,
    serial: getCol('text_mm41a6ap')?.text || item.name,
    barcode: getCol('text_mm41kpak')?.text || '',
    status: statusText as Equipment['status'],
    familyId: '',
    reservable: true,
  };
}

function parseReservation(item: RawItem, config: BoardConfig): ReservationRecord | null {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);

  const eqCol = getCol(config.connexionEquipementColumnId);
  let equipmentId = '';
  if (eqCol?.value) {
    try {
      const parsed = JSON.parse(eqCol.value);
      const ids = parsed.linkedPulseIds || parsed.linked_pulse_ids;
      if (Array.isArray(ids) && ids.length > 0) {
        equipmentId = String(ids[0].linkedPulseId || ids[0].linked_pulse_id);
      }
      if (!equipmentId && Array.isArray(parsed.linked_item_ids)) {
        equipmentId = String(parsed.linked_item_ids[0] || '');
      }
    } catch { /* ignore */ }
  }

  const dateCol = getCol(config.plageReservationColumnId);
  if (!dateCol?.value) return null;
  let dateFrom = '', dateTo = '';
  try {
    const parsed = JSON.parse(dateCol.value);
    dateFrom = parsed.from || '';
    dateTo = parsed.to || '';
  } catch { /* ignore */ }
  if (!dateFrom || !dateTo) return null;

  const statusCol = getCol(config.statutReservationColumnId);
  return { equipmentId, dateFrom, dateTo, status: statusCol?.text || 'pre_reserve' };
}

export async function fetchAvailabilityForFamily(
  familyId: string,
  dateRange: DateRange,
  config: BoardConfig,
): Promise<AvailabilityResult> {
  const catalogueData = await apiCall<{ items: RawItem[] }>(
    GET_CATALOGUE_ITEM_WITH_SUBITEMS,
    { itemId: [familyId] },
  );

  const catalogueItem = catalogueData.items?.[0];
  if (!catalogueItem?.subitems?.length) {
    return {
      available: [], reserved: [], maintenance: [],
      total: 0, availableCount: 0, reservedCount: 0, maintenanceCount: 0,
    };
  }

  const equipment = catalogueItem.subitems.map(parseSubitemEquipment);

  const allReservations: ReservationRecord[] = [];
  for (const eq of equipment) {
    try {
      const resData = await apiCall<{
        items_page_by_column_values: { items: RawItem[] };
      }>(GET_RESERVATIONS_FOR_EQUIPMENT, {
        boardId: config.reservationsBoardId,
        columnId: config.connexionEquipementColumnId,
        equipmentId: eq.id,
      });
      for (const item of resData.items_page_by_column_values.items) {
        const r = parseReservation(item, config);
        if (r) allReservations.push(r);
      }
    } catch { /* no reservations */ }
  }

  return computeAvailability(equipment, allReservations, dateRange);
}

export function useMultiAvailability(
  lines: DemandLine[],
  dateRange: DateRange | null,
  config: BoardConfig,
) {
  const [results, setResults] = useState<Map<number, AvailabilityResult>>(new Map());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!dateRange || lines.length === 0) return new Map<number, AvailabilityResult>();

    setLoading(true);
    const newResults = new Map<number, AvailabilityResult>();

    try {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.familyId || line.error) continue;

        try {
          const avail = await fetchAvailabilityForFamily(line.familyId, dateRange, config);
          newResults.set(i, avail);
        } catch (err) {
          console.error(`[INA Stock] Availability error for line ${i}:`, err);
        }
      }
      setResults(newResults);
    } catch (err) {
      console.error('[INA Stock] Multi-availability error:', err);
    } finally {
      setLoading(false);
    }

    return newResults;
  }, [lines, dateRange, config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { results, loading, refresh };
}
