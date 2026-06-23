import { useState, useCallback } from 'react';
import { apiCall } from '../services/monday-api';
import {
  GET_BOARD_ITEMS,
  GET_EQUIPMENT_PAGE,
  GET_RESERVATION_BOARD_ITEMS,
  GET_RESERVATION_BOARD_PAGE,
} from '../services/queries';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import type { DateRange, Equipment, Alternative, BoardConfig } from '../types';

interface RawItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string; linked_item_ids?: string[] }[];
}

interface AlternativeConfig extends BoardConfig {
  sousFamilleColumnId: string;
}

const STATUS_MAP: Record<string, Equipment['status']> = {
  'en stock': 'disponible',
  'disponible': 'disponible',
  'en usage': 'occupe',
  'occupé': 'occupe',
  'réservé': 'reserve',
  'pré-réservé': 'reserve',
  'en maintenance': 'maintenance',
  'hors service': 'hors_service',
  'pas en stock': 'hors_service',
};

function parseEquipmentUnit(item: RawItem, config: BoardConfig): Equipment {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);
  const statusText = (getCol(config.statutEquipementColumnId)?.text || '').toLowerCase().trim();
  const status = STATUS_MAP[statusText] || 'disponible';
  const reservableCol = getCol(config.reservableColumnId);
  const reservableVal = reservableCol?.text ? parseInt(reservableCol.text, 10) : 1;

  return {
    id: item.id,
    name: item.name,
    serial: item.name,
    barcode: '',
    status,
    familyId: '',
    reservable: reservableVal !== 0,
  };
}

function parseReservation(item: RawItem, config: BoardConfig): ReservationRecord | null {
  const getCol = (id: string) => item.column_values.find(c => c.id === id);

  const eqCol = getCol(config.connexionEquipementColumnId);
  let equipmentId = '';
  if (eqCol) {
    if (Array.isArray(eqCol.linked_item_ids) && eqCol.linked_item_ids.length > 0) {
      equipmentId = String(eqCol.linked_item_ids[0]);
    }
    if (!equipmentId && eqCol.value) {
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

async function fetchAllBoardItems(boardId: string): Promise<RawItem[]> {
  const firstPage = await apiCall<{
    boards: [{ items_page: { cursor: string | null; items: RawItem[] } }];
  }>(GET_BOARD_ITEMS, { boardId });

  const page = firstPage.boards?.[0]?.items_page;
  if (!page) return [];

  const allItems = [...page.items];
  let cursor = page.cursor;

  while (cursor) {
    const nextPage = await apiCall<{
      next_items_page: { cursor: string | null; items: RawItem[] };
    }>(GET_EQUIPMENT_PAGE, { cursor });
    allItems.push(...nextPage.next_items_page.items);
    cursor = nextPage.next_items_page.cursor;
  }

  return allItems;
}

async function fetchAllReservations(boardId: string): Promise<RawItem[]> {
  const firstPage = await apiCall<{
    boards: [{ items_page: { cursor: string | null; items: RawItem[] } }];
  }>(GET_RESERVATION_BOARD_ITEMS, { boardId });

  const page = firstPage.boards?.[0]?.items_page;
  if (!page) return [];

  const allItems = [...page.items];
  let cursor = page.cursor;

  while (cursor) {
    const nextPage = await apiCall<{
      next_items_page: { cursor: string | null; items: RawItem[] };
    }>(GET_RESERVATION_BOARD_PAGE, { cursor });
    allItems.push(...nextPage.next_items_page.items);
    cursor = nextPage.next_items_page.cursor;
  }

  return allItems;
}

export async function fetchAlternatives(
  currentModelName: string,
  dateRange: DateRange,
  config: AlternativeConfig,
  familyId?: string,
): Promise<Alternative[]> {
  const allItems = await fetchAllBoardItems(config.equipementsBoardId);

  let resolvedModelName = currentModelName;
  if (familyId) {
    const linkedUnit = allItems.find(item => item.id === familyId);
    if (linkedUnit) {
      resolvedModelName = linkedUnit.name;
    }
  }

  const currentItem = allItems.find(item => item.name === resolvedModelName);
  if (!currentItem) return [];

  const sousFamilleCol = currentItem.column_values.find(c => c.id === config.sousFamilleColumnId);
  const sousFamille = sousFamilleCol?.text || '';
  if (!sousFamille) return [];

  console.log('[INA Stock] Looking for alternatives in sous-famille:', sousFamille);

  const modelGroups = new Map<string, RawItem[]>();
  for (const item of allItems) {
    const sf = item.column_values.find(c => c.id === config.sousFamilleColumnId)?.text || '';
    if (sf === sousFamille && item.name !== resolvedModelName) {
      const group = modelGroups.get(item.name) || [];
      group.push(item);
      modelGroups.set(item.name, group);
    }
  }

  console.log('[INA Stock] Found', modelGroups.size, 'alternative models');
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
      console.error('[INA Stock] Alternatives fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { alternatives, loading, search };
}
