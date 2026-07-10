import type { DateRange, Equipment } from '../types';

export function hasOverlap(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && a.to >= b.from;
}

export function isBlockingStatus(status: string): boolean {
  const blocking = ['maintenance', 'hors_service', 'en_maintenance', 'hors service'];
  return blocking.includes(status.toLowerCase().replace(/[_\s]/g, '_'));
}

export interface ReservationRecord {
  id: string;
  equipmentId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

// Une réservation est "active" (elle bloque l'unité) si son statut est pré-réservé
// / confirmé / en cours. Un statut vide est traité comme pré-réservé (bloquant).
export function isActiveReservation(status: string): boolean {
  const s = status.toLowerCase().replace(/[éè]/g, 'e').replace(/-/g, '_');
  return ['pre_reserve', 'confirme', 'en_cours', 'en cours'].includes(s);
}

export function computeAvailability(
  equipment: Equipment[],
  reservations: ReservationRecord[],
  dateRange: DateRange,
) {
  const available: Equipment[] = [];
  const reserved: Equipment[] = [];
  const maintenance: Equipment[] = [];

  for (const eq of equipment) {
    if (!eq.reservable) continue;

    if (isBlockingStatus(eq.status)) {
      maintenance.push(eq);
      continue;
    }

    const hasConflict = reservations.some(
      r =>
        r.equipmentId === eq.id &&
        hasOverlap(dateRange, { from: r.dateFrom, to: r.dateTo }) &&
        isActiveReservation(r.status),
    );

    if (hasConflict) {
      reserved.push(eq);
    } else {
      available.push(eq);
    }
  }

  return {
    available,
    reserved,
    maintenance,
    total: equipment.filter(e => e.reservable).length,
    availableCount: available.length,
    reservedCount: reserved.length,
    maintenanceCount: maintenance.length,
  };
}

export function selectUnitsToReserve(
  available: Equipment[],
  quantity: number,
): Equipment[] {
  return available.slice(0, quantity);
}
