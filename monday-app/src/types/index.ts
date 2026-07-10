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

export type ReservationStatus = 'pre_reserve' | 'confirme' | 'en_cours' | 'termine' | 'annule';

export interface DateRange {
  from: string;
  to: string;
}

export interface DemandLine {
  subitemId: string;
  familyId: string | null;
  familyName: string;
  quantite: number;
  error: string | null;
}

export interface DemandOverview {
  parentId: string;
  parentName: string;
  formationName: string;
  dateRange: DateRange;
  lines: DemandLine[];
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
  lineIndex: number;
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
  tag?: string;
  local?: string;
  dateRange: string;
  lineIndex: number;
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
  formationNameColumnId: string;
  materielRequisColumnId: string;
  serialColumnId: string;
  tagColumnId: string;
  localColumnId: string;
}
