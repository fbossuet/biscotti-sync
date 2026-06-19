import { useEffect, useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_FAMILIES_BY_SOUS_FAMILLE, GET_EQUIPMENT_BY_FAMILY } from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import { GET_RESERVATIONS_FOR_EQUIPMENT } from '../services/queries';
import type { DateRange, Equipment, Family, Alternative, BoardConfig } from '../types';

interface RawItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string }[];
}

function parseFamily(item: RawItem, config: BoardConfig & { sousFamilleColumnId: string; osColumnId: string }): Family {
  const getCol = (id: string) => item.column_values.find(c => c.id === id)?.text || '';
  return {
    id: item.id,
    name: item.name,
    sousFamille: getCol(config.sousFamilleColumnId),
    categorie: '',
    os: getCol(config.osColumnId),
    quantiteLS: 0,
  };
}

function parseEquipmentBasic(item: RawItem, config: BoardConfig): Equipment {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);
  const statusCol = getCol(config.statutEquipementColumnId);
  const statusText = (statusCol?.text || 'disponible').toLowerCase();
  const reservableCol = getCol(config.reservableColumnId);
  const isReservable = reservableCol?.value
    ? JSON.parse(reservableCol.value)?.checked === true || reservableCol.text === 'v'
    : true;

  return {
    id: item.id,
    name: item.name,
    serial: item.name,
    barcode: getCol('code_barres')?.text || getCol('code_barres_ina')?.text || '',
    status: statusText as Equipment['status'],
    familyId: '',
    reservable: isReservable,
  };
}

function parseReservationRecord(item: RawItem, config: BoardConfig): ReservationRecord | null {
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
  return { equipmentId, dateFrom, dateTo, status: statusCol?.text || 'pre_reserve' };
}

export function useAlternatives(
  currentFamilyId: string | null,
  sousFamille: string | null,
  dateRange: DateRange | null,
  config: BoardConfig & { sousFamilleColumnId: string; osColumnId: string },
) {
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentFamilyId || !sousFamille || !dateRange) return;

    setLoading(true);
    try {
      const famData = await apiCall<{
        items_page_by_column_values: { items: RawItem[] };
      }>(GET_FAMILIES_BY_SOUS_FAMILLE, {
        boardId: config.famillesBoardId,
        columnId: config.sousFamilleColumnId,
        sousFamille,
      });

      const families = famData.items_page_by_column_values.items
        .map(i => parseFamily(i, config))
        .filter(f => f.id !== currentFamilyId);

      const results: Alternative[] = [];

      for (const family of families) {
        const eqData = await apiCall<{
          items_page_by_column_values: { items: RawItem[] };
        }>(GET_EQUIPMENT_BY_FAMILY, {
          boardId: config.equipementsBoardId,
          columnId: config.connexionFamilleColumnId,
          familyItemId: family.id,
        });

        const equipment = eqData.items_page_by_column_values.items.map(i =>
          parseEquipmentBasic(i, config),
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
            const r = parseReservationRecord(item, config);
            if (r) allReservations.push(r);
          }
        }

        const avail = computeAvailability(equipment, allReservations, dateRange);
        results.push({
          family,
          availableCount: avail.availableCount,
          total: avail.total,
        });
      }

      setAlternatives(results);
    } catch (err) {
      console.error('Alternatives fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFamilyId, sousFamille, dateRange, config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { alternatives, loading, refresh };
}
