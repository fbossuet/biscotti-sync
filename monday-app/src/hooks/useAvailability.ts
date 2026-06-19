import { useEffect, useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_EQUIPMENT_BY_FAMILY, GET_RESERVATIONS_FOR_EQUIPMENT } from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import type { DateRange, Equipment, AvailabilityResult, BoardConfig } from '../types';

interface RawItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string }[];
}

function parseEquipment(item: RawItem, config: BoardConfig): Equipment {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);

  const statusCol = getCol(config.statutEquipementColumnId);
  const statusText = (statusCol?.text || 'disponible').toLowerCase();
  const reservableCol = getCol(config.reservableColumnId);
  const isReservable = reservableCol?.value
    ? JSON.parse(reservableCol.value)?.checked === true || reservableCol.text === 'v'
    : true;

  const familyCol = getCol(config.connexionFamilleColumnId);
  let familyId = '';
  if (familyCol?.value) {
    try {
      const parsed = JSON.parse(familyCol.value);
      const ids = parsed.linkedPulseIds || parsed.linked_pulse_ids || [];
      if (ids.length > 0) familyId = String(ids[0].linkedPulseId || ids[0].linked_pulse_id);
    } catch { /* ignore */ }
  }

  return {
    id: item.id,
    name: item.name,
    serial: item.name,
    barcode: getCol('code_barres')?.text || getCol('code_barres_ina')?.text || '',
    status: statusText as Equipment['status'],
    familyId,
    reservable: isReservable,
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
      const eqData = await apiCall<{
        items_page_by_column_values: { items: RawItem[] };
      }>(GET_EQUIPMENT_BY_FAMILY, {
        boardId: config.equipementsBoardId,
        columnId: config.connexionFamilleColumnId,
        familyItemId: familyId,
      });

      const equipment = eqData.items_page_by_column_values.items.map(i =>
        parseEquipment(i, config),
      );

      const allReservations: ReservationRecord[] = [];
      for (const eq of equipment) {
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
