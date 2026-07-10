import { apiCall } from './monday-api';
import { GET_BOARDS_SCHEMA } from './queries';
import type { BoardConfig } from '../types';

interface RawCol { id: string; title: string; type: string; settings_str?: string }
interface RawBoard { id: string; columns: RawCol[] }

// Boards INA par défaut : si la config pointe dessus (ou n'est pas personnalisée),
// on NE fait PAS d'auto-mapping → la prod existante garde sa config codée en dur,
// aucun appel réseau, zéro risque de mauvaise détection.
const INA_EQUIP_BOARD = '5098193893';
const INA_RESA_BOARD = '5098977881';

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function boardIdsOf(col: RawCol): string[] {
  try {
    return (JSON.parse(col.settings_str || '{}').boardIds || []).map(String);
  } catch {
    return [];
  }
}

// Trouve une colonne par type, en priorisant un titre qui contient un mot-clé,
// et (pour les liens) une cible de board donnée. Ne renvoie rien si ambigu et
// sans indice → l'appelant garde alors la valeur par défaut.
function findCol(
  cols: RawCol[],
  type: string,
  keywords: string[],
  targetBoardId?: string,
): string | undefined {
  let pool = cols.filter(c => c.type === type);
  if (targetBoardId) {
    const scoped = pool.filter(c => boardIdsOf(c).includes(String(targetBoardId)));
    if (scoped.length) pool = scoped;
  }
  if (keywords.length) {
    const kws = keywords.map(norm);
    const hit = pool.find(c => kws.some(k => norm(c.title).includes(k)));
    if (hit) return hit.id;
  }
  return pool.length === 1 ? pool[0].id : undefined;
}

async function fetchBoards(ids: string[]): Promise<Map<string, RawBoard>> {
  const clean = [...new Set(ids)].filter(Boolean);
  if (!clean.length) return new Map();
  const data = await apiCall<{ boards: RawBoard[] }>(GET_BOARDS_SCHEMA, { ids: clean });
  return new Map((data.boards || []).map(b => [String(b.id), b]));
}

/**
 * Résout les IDs de colonnes automatiquement à partir des seuls IDs de boards.
 * Permet d'installer l'app sur un autre compte en ne configurant que 3 boards.
 * Toute colonne non détectée conserve la valeur de `base` (fallback sûr).
 */
export async function resolveConfig<T extends BoardConfig>(
  base: T,
  contextBoardId?: string,
): Promise<T> {
  // Court-circuit INA / config non personnalisée.
  if (base.equipementsBoardId === INA_EQUIP_BOARD && base.reservationsBoardId === INA_RESA_BOARD) {
    return base;
  }

  const demandesBoardId = contextBoardId || '';
  const catalogueBoardId = base.famillesBoardId || base.equipementsBoardId;

  let boards: Map<string, RawBoard>;
  try {
    boards = await fetchBoards([demandesBoardId, base.equipementsBoardId, base.reservationsBoardId]);
  } catch {
    return base; // échec réseau → fallback prudent
  }

  const demandes = demandesBoardId ? boards.get(demandesBoardId) : undefined;
  const equip = boards.get(String(base.equipementsBoardId));
  const resa = boards.get(String(base.reservationsBoardId));

  // Board des sous-éléments = dérivé de la colonne "subtasks" du board Demandes.
  let subitemsBoardId = '';
  const subCol = demandes?.columns.find(c => c.type === 'subtasks');
  if (subCol) subitemsBoardId = boardIdsOf(subCol)[0] || '';
  let subitems: RawBoard | undefined;
  if (subitemsBoardId) {
    try {
      subitems = (await fetchBoards([subitemsBoardId])).get(subitemsBoardId);
    } catch { /* ignore */ }
  }

  const cfg = { ...base } as T;
  const cfgRecord = cfg as unknown as Record<string, string>;
  const set = (key: string, val: string | undefined) => {
    if (val) cfgRecord[key] = val;
  };

  if (demandes) {
    set('dateFormationColumnId', findCol(demandes.columns, 'timeline', ['periode', 'date', 'formation']));
    set('formationNameColumnId', findCol(demandes.columns, 'text', ['formation', 'intitule', 'objet']));
  }
  if (subitems) {
    set('quantiteColumnId', findCol(subitems.columns, 'numbers', ['qte', 'quantite']));
    set('materielRequisColumnId', findCol(subitems.columns, 'dropdown', ['materiel', 'modele', 'equipement']));
    set('connexionCatalogueColumnId', findCol(subitems.columns, 'board_relation', ['catalogue', 'materiel', 'equipement'], catalogueBoardId));
  }
  if (equip) {
    set('statutEquipementColumnId', findCol(equip.columns, 'status', ['statut', 'status', 'etat']));
    set('reservableColumnId', findCol(equip.columns, 'numbers', ['reservable', 'quantite', 'stock', 'ls']));
    set('sousFamilleColumnId', findCol(equip.columns, 'status', ['sous']));
    set('serialColumnId', findCol(equip.columns, 'text', ['serie', 'serial', 's/n']));
    set('tagColumnId', findCol(equip.columns, 'text', ['tag']));
    set('localColumnId', findCol(equip.columns, 'text', ['local', 'emplacement', 'lieu']));
    set('osColumnId', findCol(equip.columns, 'status', ['exploitation', ' os', 'os ']));
  }
  if (resa) {
    set('plageReservationColumnId', findCol(resa.columns, 'timeline', ['reservation', 'date', 'periode']));
    set('statutReservationColumnId', findCol(resa.columns, 'status', ['statut', 'status']));
    set('connexionEquipementColumnId', findCol(resa.columns, 'board_relation', ['equipement', 'materiel'], base.equipementsBoardId));
    set('connexionDemandeColumnId', findCol(resa.columns, 'board_relation', ['demande'], subitemsBoardId));
  }
  return cfg;
}
