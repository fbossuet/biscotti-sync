import { useEffect, useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_CATALOGUE_ITEM_WITH_SUBITEMS, GET_RESERVATIONS_FOR_EQUIPMENT } from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import type { DateRange, Equipment, AvailabilityResult, BoardConfig } from '../types';

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
      const ids = parsed.linkedPulseIds || parsed.linked_pulse_ids || [];
      if (ids.length > 0) equipmentId = String(ids[0].linkedPulseId || ids[0].linked_pulse_id);
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
  const status = statusCol?.text || 'pre_reserve';

  return { equipmentId, dateFrom, dateTo, status };
}

export function useAvailability(
  familyId: string | null,
  dateRange: DateRange | null,
  config: BoardConfig,
) {
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!familyId || !dateRange) return null;

    setLoading(true);
    try {
      const catalogueData = await apiCall<{ items: RawItem[] }>(
        GET_CATALOGUE_ITEM_WITH_SUBITEMS,
        { itemId: [familyId] },
      );

      const catalogueItem = catalogueData.items?.[0];
      if (!catalogueItem?.subitems?.length) {
        setResult({
          available: [], reserved: [], maintenance: [],
          total: 0, availableCount: 0, reservedCount: 0, maintenanceCount: 0,
        });
        return null;
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
        } catch {
          // No reservations for this unit
        }
      }

      const avail = computeAvailability(equipment, allReservations, dateRange);
      setResult(avail);
      return avail;
    } catch (err) {
      console.error('Availability fetch error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [familyId, dateRange, config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { result, loading, refresh };
}
