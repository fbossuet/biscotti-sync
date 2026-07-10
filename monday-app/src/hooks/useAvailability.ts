import { useEffect, useState, useCallback } from 'react';
import { computeAvailability, type ReservationRecord } from '../services/availability';
import {
  type RawItem,
  parseEquipmentUnit,
  parseReservation,
  fetchAllBoardItems,
  fetchAllReservations,
} from '../services/board-data';
import type { DateRange, AvailabilityResult, BoardConfig, DemandLine } from '../types';

const EMPTY_RESULT: AvailabilityResult = {
  available: [], reserved: [], maintenance: [],
  total: 0, availableCount: 0, reservedCount: 0, maintenanceCount: 0,
};

// Calcul PUR (aucun appel réseau) de la dispo d'un modèle à partir de données
// déjà chargées. Permet de charger le board d'équipements + les réservations
// UNE SEULE FOIS, puis de calculer toutes les lignes en mémoire — au lieu d'un
// scan complet du board (~1000 items) par ligne, ce qui était catastrophique.
export function computeModelAvailability(
  modelName: string,
  allItems: RawItem[],
  allResItems: RawItem[],
  dateRange: DateRange,
  config: BoardConfig,
): AvailabilityResult {
  if (!modelName) return EMPTY_RESULT;

  const sameModelItems = allItems.filter(item => item.name === modelName);
  if (sameModelItems.length === 0) return EMPTY_RESULT;

  const equipment = sameModelItems.map(item => parseEquipmentUnit(item, config));
  const equipmentIds = new Set(equipment.map(eq => eq.id));

  const reservations: ReservationRecord[] = [];
  for (const item of allResItems) {
    const r = parseReservation(item, config);
    if (r && equipmentIds.has(r.equipmentId)) reservations.push(r);
  }

  return computeAvailability(equipment, reservations, dateRange);
}

// Version autonome (charge les données puis calcule) pour les revalidations
// ponctuelles au moment de réserver. Les deux fetch partent en parallèle.
export async function fetchAvailabilityForModel(
  modelName: string,
  dateRange: DateRange,
  config: BoardConfig,
): Promise<AvailabilityResult> {
  if (!modelName) return EMPTY_RESULT;
  const [allItems, allResItems] = await Promise.all([
    fetchAllBoardItems(config.equipementsBoardId, [config.statutEquipementColumnId, config.reservableColumnId]),
    fetchAllReservations(config.reservationsBoardId),
  ]);
  return computeModelAvailability(modelName, allItems, allResItems, dateRange, config);
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
      // UN SEUL chargement (équipements + réservations), en parallèle, réutilisé
      // pour toutes les lignes. Le calcul par ligne est ensuite fait en mémoire.
      const [allItems, allResItems] = await Promise.all([
        fetchAllBoardItems(config.equipementsBoardId),
        fetchAllReservations(config.reservationsBoardId),
      ]);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.error || !line.familyName) continue;
        newResults.set(
          i,
          computeModelAvailability(line.familyName, allItems, allResItems, dateRange, config),
        );
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
