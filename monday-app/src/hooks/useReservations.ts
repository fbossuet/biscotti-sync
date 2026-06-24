import { useState, useCallback, useEffect } from 'react';
import { apiCall } from '../services/monday-api';
import { CREATE_RESERVATION, DELETE_RESERVATION } from '../services/mutations';
import { selectUnitsToReserve } from '../services/availability';
import { type RawItem, fetchAllReservations } from '../services/board-data';
import type { Equipment, DateRange, DemandLine, ReservationLine, BoardConfig } from '../types';

export function useReservations(config: BoardConfig, demandLines?: DemandLine[]) {
  const [lines, setLines] = useState<ReservationLine[]>([]);
  const [reservedIds, setReservedIds] = useState<Set<string>>(new Set());
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!demandLines || demandLines.length === 0) return;

    const subitemIds = new Set(demandLines.map(l => l.subitemId));
    if (subitemIds.size === 0) return;

    setLoadingExisting(true);

    fetchAllReservations(config.reservationsBoardId)
      .then(allResItems => {
        const existing: ReservationLine[] = [];
        const existingUnitIds = new Set<string>();

        for (const resItem of allResItems) {
          const linkedDemandId = extractLinkedId(resItem, config.connexionDemandeColumnId);
          if (!linkedDemandId || !subitemIds.has(linkedDemandId)) continue;

          const linkedEquipId = extractLinkedId(resItem, config.connexionEquipementColumnId);
          if (!linkedEquipId) continue;

          const lineIndex = demandLines.findIndex(l => l.subitemId === linkedDemandId);
          if (lineIndex < 0) continue;

          const dateCol = resItem.column_values.find(c => c.id === config.plageReservationColumnId);
          let dateRangeStr = '';
          if (dateCol?.value) {
            try {
              const parsed = JSON.parse(dateCol.value);
              if (parsed.from && parsed.to) {
                dateRangeStr = `${formatDate(parsed.from)} → ${formatDate(parsed.to)}`;
              }
            } catch { /* ignore */ }
          }

          existing.push({
            id: resItem.id,
            unitId: linkedEquipId,
            model: resItem.name,
            serial: '',
            barcode: '',
            dateRange: dateRangeStr,
            lineIndex,
          });
          existingUnitIds.add(linkedEquipId);
        }

        if (existing.length > 0) {
          setLines(existing);
          setReservedIds(existingUnitIds);
        }
      })
      .finally(() => setLoadingExisting(false));
  }, [config, demandLines]);

  const reserve = useCallback(
    async (
      available: Equipment[],
      quantity: number,
      dateRange: DateRange,
      demandItemId: string,
      modelName: string,
      lineIndex: number,
    ): Promise<ReservationLine[]> => {
      const units = selectUnitsToReserve(available, quantity);
      const newLines: ReservationLine[] = [];

      for (const unit of units) {
        const colVals: Record<string, unknown> = {
          [config.connexionEquipementColumnId]: {
            item_ids: [parseInt(unit.id, 10)],
          },
          [config.plageReservationColumnId]: {
            from: dateRange.from,
            to: dateRange.to,
          },
          [config.connexionDemandeColumnId]: {
            item_ids: [parseInt(demandItemId, 10)],
          },
        };

        const columnValues = JSON.stringify(colVals);
        const result = await apiCall<{
          create_item: { id: string; name: string };
        }>(CREATE_RESERVATION, {
          boardId: config.reservationsBoardId,
          itemName: `Résa - ${unit.name} - ${dateRange.from}`,
          columnValues,
        });

        newLines.push({
          id: result.create_item.id,
          unitId: unit.id,
          model: modelName,
          serial: unit.serial,
          barcode: unit.barcode,
          dateRange: `${formatDate(dateRange.from)} → ${formatDate(dateRange.to)}`,
          lineIndex,
        });
      }

      setLines(prev => [...prev, ...newLines]);
      setReservedIds(prev => {
        const next = new Set(prev);
        newLines.forEach(l => next.add(l.unitId));
        return next;
      });

      return newLines;
    },
    [config],
  );

  const cancel = useCallback(
    async (reservationId: string, unitId: string) => {
      await apiCall(DELETE_RESERVATION, { itemId: reservationId });

      setLines(prev => prev.filter(l => l.id !== reservationId));
      setReservedIds(prev => {
        const next = new Set(prev);
        next.delete(unitId);
        return next;
      });
    },
    [],
  );

  return { lines, reservedIds, loadingExisting, reserve, cancel };
}

function extractLinkedId(item: RawItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId);
  if (!col) return null;

  if (Array.isArray(col.linked_item_ids) && col.linked_item_ids.length > 0) {
    return String(col.linked_item_ids[0]);
  }

  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      const ids = parsed.linkedPulseIds || parsed.linked_pulse_ids;
      if (Array.isArray(ids) && ids.length > 0) {
        return String(ids[0].linkedPulseId || ids[0].linked_pulse_id);
      }
      if (Array.isArray(parsed.linked_item_ids) && parsed.linked_item_ids.length > 0) {
        return String(parsed.linked_item_ids[0]);
      }
    } catch { /* ignore */ }
  }

  return null;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
