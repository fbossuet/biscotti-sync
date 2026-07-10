import { useState, useCallback } from 'react';
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
import type { DateRange, Alternative, BoardConfig } from '../types';

interface AlternativeConfig extends BoardConfig {
  sousFamilleColumnId: string;
}

export async function fetchAlternatives(
  currentModelName: string,
  dateRange: DateRange,
  config: AlternativeConfig,
  familyId?: string,
): Promise<Alternative[]> {
  let resolvedModelName = currentModelName;
  if (familyId) {
    const unitData = await apiCall<{ items: RawItem[] }>(
      GET_CATALOGUE_ITEM_WITH_SUBITEMS,
      { itemId: [familyId] },
    );
    const linkedUnit = unitData.items?.[0];
    if (linkedUnit) {
      resolvedModelName = linkedUnit.name;
    }
  }
  const allItems = await fetchAllBoardItems(config.equipementsBoardId, [
    config.statutEquipementColumnId,
    config.reservableColumnId,
    config.sousFamilleColumnId,
  ]);

  const currentItem = allItems.find(item => item.name === resolvedModelName);
  if (!currentItem) return [];

  const sousFamilleCol = currentItem.column_values.find(c => c.id === config.sousFamilleColumnId);
  const sousFamille = sousFamilleCol?.text || '';
  if (!sousFamille) return [];

  const modelGroups = new Map<string, RawItem[]>();
  for (const item of allItems) {
    const sf = item.column_values.find(c => c.id === config.sousFamilleColumnId)?.text || '';
    if (sf === sousFamille && item.name !== resolvedModelName) {
      const group = modelGroups.get(item.name) || [];
      group.push(item);
      modelGroups.set(item.name, group);
    }
  }

  if (modelGroups.size === 0) return [];

  const allResItems = await fetchAllReservations(config.reservationsBoardId);

  const results: Alternative[] = [];

  for (const [modelName, items] of modelGroups) {
    const equipment = items.map(item => parseEquipmentUnit(item, config));
    const equipmentIds = new Set(equipment.map(eq => eq.id));

    const reservations: ReservationRecord[] = [];
    for (const resItem of allResItems) {
      const r = parseReservation(resItem, config);
      if (r && equipmentIds.has(r.equipmentId)) {
        reservations.push(r);
      }
    }

    const avail = computeAvailability(equipment, reservations, dateRange);

    if (avail.availableCount > 0) {
      results.push({
        family: {
          id: items[0].id,
          name: modelName,
          sousFamille,
          categorie: '',
          os: '',
          quantiteLS: avail.total,
        },
        availableCount: avail.availableCount,
        total: avail.total,
      });
    }
  }

  results.sort((a, b) => b.availableCount - a.availableCount);
  return results;
}

export function useAlternatives() {
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (
    currentModelName: string,
    dateRange: DateRange,
    config: AlternativeConfig,
    familyId?: string,
  ) => {
    setLoading(true);
    setAlternatives([]);
    try {
      const results = await fetchAlternatives(currentModelName, dateRange, config, familyId);
      setAlternatives(results);
    } catch (err) {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  return { alternatives, loading, search };
}
