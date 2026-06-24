import { useEffect, useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_CATALOGUE_ITEM_WITH_SUBITEMS } from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import {
  type RawItem,
  parseEquipmentUnit,
  parseReservation,
  fetchAllBoardItems,
  fetchAllReservations,
} from '../services/board-data';
import type { DateRange, AvailabilityResult, BoardConfig, DemandLine } from '../types';

export async function fetchAvailabilityForFamily(
  linkedUnitId: string,
  dateRange: DateRange,
  config: BoardConfig,
): Promise<AvailabilityResult> {
  const emptyResult: AvailabilityResult = {
    available: [], reserved: [], maintenance: [],
    total: 0, availableCount: 0, reservedCount: 0, maintenanceCount: 0,
  };

  const unitData = await apiCall<{ items: RawItem[] }>(
    GET_CATALOGUE_ITEM_WITH_SUBITEMS,
    { itemId: [linkedUnitId] },
  );
  const linkedUnit = unitData.items?.[0];
  if (!linkedUnit) return emptyResult;

  const modelName = linkedUnit.name;

  const allItems = await fetchAllBoardItems(config.equipementsBoardId);
  const sameModelItems = allItems.filter(item => item.name === modelName);

  if (sameModelItems.length === 0) return emptyResult;

  const equipment = sameModelItems.map(item => parseEquipmentUnit(item, config));
  const equipmentIds = new Set(equipment.map(eq => eq.id));

  const allResItems = await fetchAllReservations(config.reservationsBoardId);
  const allReservations: ReservationRecord[] = [];
  for (const item of allResItems) {
    const r = parseReservation(item, config);
    if (r && equipmentIds.has(r.equipmentId)) {
      allReservations.push(r);
    }
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
          // silently skip failed lines
        }
      }
      setResults(newResults);
    } catch (err) {
      // silently ignore
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
