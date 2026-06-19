export interface Equipment {
  id: string;
  name: string;
  serial: string;
  barcode: string;
  status: EquipmentStatus;
  familyId: string;
  reservable: boolean;
}

export type EquipmentStatus = 'disponible' | 'reserve' | 'occupe' | 'maintenance' | 'hors_service';

export interface Family {
  id: string;
  name: string;
  sousFamille: string;
  categorie: string;
  os: string;
  quantiteLS: number;
}

export interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  serial: string;
  barcode: string;
  familyName: string;
  dateFrom: string;
  dateTo: string;
  demandId: string;
  status: ReservationStatus;
}

export type ReservationStatus = 'pre_reserve' | 'confirme' | 'en_cours' | 'termine' | 'annule';

export interface DateRange {
  from: string;
  to: string;
}

export interface DemandContext {
  itemId: string;
  parentItemId: string;
  sousFamille: string;
  familyId: string;
  familyName: string;
  os: string;
  dateRange: DateRange;
  quantite: number;
}

export interface AvailabilityResult {
  available: Equipment[];
  reserved: Equipment[];
  maintenance: Equipment[];
  total: number;
  availableCount: number;
  reservedCount: number;
  maintenanceCount: number;
}

export interface Alternative {
  family: Family;
  availableCount: number;
  total: number;
}

export type ModalStep = 'saisie' | 'proposition' | 'epuise';

export interface ModalState {
  step: ModalStep;
  targetFamilyId: string;
  modelName: string;
  availableCount: number;
  requested: number;
  maxNeeded: number;
  proposed: number;
}

export interface ReservationLine {
  id: string;
  unitId: string;
  model: string;
  serial: string;
  barcode: string;
  dateRange: string;
}

export interface BoardConfig {
  famillesBoardId: string;
  equipementsBoardId: string;
  reservationsBoardId: string;
  dateFormationColumnId: string;
  quantiteColumnId: string;
  connexionCatalogueColumnId: string;
  statutEquipementColumnId: string;
  connexionFamilleColumnId: string;
  reservableColumnId: string;
  plageReservationColumnId: string;
  statutReservationColumnId: string;
  connexionEquipementColumnId: string;
  connexionDemandeColumnId: string;
}
