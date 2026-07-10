import { apiCall } from './monday-api';
import {
  GET_BOARD_ITEMS,
  GET_EQUIPMENT_PAGE,
  GET_RESERVATION_BOARD_ITEMS,
  GET_RESERVATION_BOARD_PAGE,
} from './queries';
import type { ReservationRecord } from './availability';
import type { Equipment, BoardConfig } from '../types';

export interface RawItem {
  id: string;
  name: string;
  column_values: { id: string; text: string; value: string; linked_item_ids?: string[] }[];
}

export const STATUS_MAP: Record<string, Equipment['status']> = {
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

export function parseEquipmentUnit(item: RawItem, config: BoardConfig): Equipment {
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

export function parseReservation(item: RawItem, config: BoardConfig): ReservationRecord | null {
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
  return { id: item.id, equipmentId, dateFrom, dateTo, status: statusCol?.text || 'pre_reserve' };
}

// columnIds : ne récupérer que les colonnes réellement exploitées (payload
// bien plus léger sur un board de ~1000 items). Le nom de l'item est toujours
// renvoyé (champ de haut niveau, hors column_values).
export async function fetchAllBoardItems(boardId: string, columnIds?: string[]): Promise<RawItem[]> {
  const firstPage = await apiCall<{
    boards: [{ items_page: { cursor: string | null; items: RawItem[] } }];
  }>(GET_BOARD_ITEMS, { boardId, columnIds });

  const page = firstPage.boards?.[0]?.items_page;
  if (!page) return [];

  const allItems = [...page.items];
  let cursor = page.cursor;

  while (cursor) {
    const nextPage = await apiCall<{
      next_items_page: { cursor: string | null; items: RawItem[] };
    }>(GET_EQUIPMENT_PAGE, { cursor, columnIds });

    allItems.push(...nextPage.next_items_page.items);
    cursor = nextPage.next_items_page.cursor;
  }

  return allItems;
}

export async function fetchAllReservations(boardId: string): Promise<RawItem[]> {
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
