import { useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { CREATE_RESERVATION, DELETE_RESERVATION } from '../services/mutations';
import { selectUnitsToReserve } from '../services/availability';
import type { Equipment, DateRange, ReservationLine, BoardConfig } from '../types';

export function useReservations(config: BoardConfig) {
  const [lines, setLines] = useState<ReservationLine[]>([]);
  const [reservedIds, setReservedIds] = useState<Set<string>>(new Set());

  const reserve = useCallback(
    async (
      available: Equipment[],
      quantity: number,
      dateRange: DateRange,
      demandItemId: string,
      modelName: string,
    ): Promise<ReservationLine[]> => {
      const units = selectUnitsToReserve(available, quantity);
      const newLines: ReservationLine[] = [];

      for (const unit of units) {
        const columnValues = JSON.stringify({
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
          [config.statutReservationColumnId]: {
            label: 'Pré-réservé',
          },
        });

        const result = await apiCall<{
          create_item: { id: string; name: string };
        }>(CREATE_RESERVATION, {
          boardId: config.reservationsBoardId,
          itemName: `Résa - ${unit.serial} - ${dateRange.from}`,
          columnValues,
        });

        newLines.push({
          id: result.create_item.id,
          unitId: unit.id,
          model: modelName,
          serial: unit.serial,
          barcode: unit.barcode,
          dateRange: `${formatDate(dateRange.from)} → ${formatDate(dateRange.to)}`,
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

  return { lines, reservedIds, reserve, cancel };
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
