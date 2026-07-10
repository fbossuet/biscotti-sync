import { useEffect, useState } from 'react';
import { apiCall } from '../services/monday-api';
import { GET_DEMAND_WITH_SUBITEMS } from '../services/queries';
import type { DemandOverview, DemandLine, DateRange } from '../types';

interface ColumnValue {
  id: string;
  text: string;
  value: string;
  linked_item_ids?: string[];
}

interface RawItem {
  id: string;
  name: string;
  column_values: ColumnValue[];
  subitems?: RawItem[];
}

function findColumn(cols: ColumnValue[], id: string): ColumnValue | undefined {
  return cols.find(c => c.id === id);
}

function parseDateRange(col: ColumnValue | undefined): DateRange | null {
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    if (parsed.from && parsed.to) return { from: parsed.from, to: parsed.to };
  } catch { /* ignore */ }
  return null;
}

function parseConnectedItemId(col: ColumnValue | undefined): string | null {
  if (!col) return null;

  // API 2024-10+: linked_item_ids is a top-level field on BoardRelationValue
  if (Array.isArray(col.linked_item_ids) && col.linked_item_ids.length > 0) {
    return String(col.linked_item_ids[0]);
  }

  // Fallback: parse from JSON value string
  if (col.value) {
    try {
      const parsed = JSON.parse(col.value);
      const pulseIds = parsed.linkedPulseIds || parsed.linked_pulse_ids;
      if (Array.isArray(pulseIds) && pulseIds.length > 0) {
        return String(pulseIds[0].linkedPulseId || pulseIds[0].linked_pulse_id);
      }
      if (Array.isArray(parsed.linked_item_ids) && parsed.linked_item_ids.length > 0) {
        return String(parsed.linked_item_ids[0]);
      }
    } catch { /* ignore */ }
  }

  return null;
}

function parseNumber(col: ColumnValue | undefined): number {
  if (!col?.text) return 0;
  const n = parseInt(col.text, 10);
  return isNaN(n) ? 0 : n;
}

// Une "ligne de matériel" = un sous-élément qui porte un matériel (dropdown
// « Matériel requis », lien catalogue ou quantité). Les sous-éléments de tâche
// du workflow (Confirmer la disponibilité / Préparer / Récupérer) n'en ont aucun
// et doivent être exclus.
function isMaterialLine(
  subitem: RawItem,
  catalogueColumnId: string,
  quantiteColumnId: string,
  materielRequisColumnId: string,
): boolean {
  const hasCatalogue = !!parseConnectedItemId(findColumn(subitem.column_values, catalogueColumnId));
  const hasMateriel = !!findColumn(subitem.column_values, materielRequisColumnId)?.text?.trim();
  const hasQuantite = parseNumber(findColumn(subitem.column_values, quantiteColumnId)) > 0;
  return hasCatalogue || hasMateriel || hasQuantite;
}

function parseDemandLine(
  subitem: RawItem,
  catalogueColumnId: string,
  quantiteColumnId: string,
  materielRequisColumnId: string,
): DemandLine {
  const catalogueCol = findColumn(subitem.column_values, catalogueColumnId);
  const familyId = parseConnectedItemId(catalogueCol);
  const quantite = parseNumber(findColumn(subitem.column_values, quantiteColumnId));

  // Nom du modèle : priorité au lien catalogue, sinon au dropdown « Matériel requis ».
  // Le connect-board (board_relation) est rempli par une automation monday qui ne se
  // déclenche pas toujours ; le dropdown, lui, contient le choix saisi au formulaire.
  const materielRequis = findColumn(subitem.column_values, materielRequisColumnId)?.text?.trim() || '';
  const modelName = catalogueCol?.text?.trim() || materielRequis;

  let error: string | null = null;
  if (!modelName) {
    error = 'Aucun matériel lié dans le catalogue.';
  } else if (!quantite) {
    error = 'Quantité non renseignée.';
  }

  return {
    subitemId: subitem.id,
    familyId,
    familyName: modelName,
    quantite,
    error,
  };
}

export function useDemandContext(
  itemId: string | null,
  config: {
    dateFormationColumnId: string;
    quantiteColumnId: string;
    connexionCatalogueColumnId: string;
    materielRequisColumnId: string;
    formationNameColumnId: string;
  },
) {
  const [demand, setDemand] = useState<DemandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;

    setLoading(true);
    setError(null);

    apiCall<{ items: RawItem[] }>(GET_DEMAND_WITH_SUBITEMS, { itemId: [itemId] })
      .then(data => {
        const item = data.items?.[0];
        if (!item) {
          setError('Demande introuvable.');
          return;
        }

        const dateRange = parseDateRange(
          findColumn(item.column_values, config.dateFormationColumnId),
        );
        if (!dateRange) {
          setError('Veuillez renseigner la date de la formation sur cette demande.');
          return;
        }

        const subitems = item.subitems || [];
        const materialSubitems = subitems.filter(si =>
          isMaterialLine(
            si,
            config.connexionCatalogueColumnId,
            config.quantiteColumnId,
            config.materielRequisColumnId,
          ),
        );
        if (materialSubitems.length === 0) {
          setError('Aucun sous-élément de matériel trouvé pour cette demande.');
          return;
        }

        const formationNameCol = findColumn(item.column_values, config.formationNameColumnId);

        const lines = materialSubitems.map(si =>
          parseDemandLine(
            si,
            config.connexionCatalogueColumnId,
            config.quantiteColumnId,
            config.materielRequisColumnId,
          ),
        );

        setDemand({
          parentId: item.id,
          parentName: item.name,
          formationName: formationNameCol?.text || '',
          dateRange,
          lines,
        });
      })
      .catch(err => {
        setError(err.message || 'Erreur lors du chargement de la demande.');
      })
      .finally(() => setLoading(false));
  }, [itemId, config.dateFormationColumnId, config.quantiteColumnId, config.connexionCatalogueColumnId, config.materielRequisColumnId]);

  return { demand, loading, error };
}
