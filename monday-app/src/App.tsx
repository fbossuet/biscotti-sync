import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { colors, fonts } from './constants/design-tokens';
import { useMonday } from './hooks/useMonday';
import { useDemandContext } from './hooks/useDemandContext';
import { useMultiAvailability, fetchAvailabilityForModel } from './hooks/useAvailability';
import { fetchAllReservations, parseReservation } from './services/board-data';
import { resolveConfig } from './services/config-resolver';
import { hasOverlap, isActiveReservation, type ReservationRecord } from './services/availability';
import { useReservations } from './hooks/useReservations';
import { useAlternatives } from './hooks/useAlternatives';
import { DemandContextCard } from './components/DemandContext/DemandContext';
import { LineCard } from './components/LineCard/LineCard';
import { ReservationModal } from './components/ReservationModal/ReservationModal';
import { ReservationLines } from './components/ReservationLines/ReservationLines';
import { Toast } from './components/shared/Toast';
import type { ModalState, BoardConfig } from './types';

interface AppConfig extends BoardConfig {
  sousFamilleColumnId: string;
  osColumnId: string;
}

const DEFAULT_CONFIG: AppConfig = {
  famillesBoardId: '5098193893',
  equipementsBoardId: '5098193893',
  reservationsBoardId: '5098977881',
  dateFormationColumnId: 'timerange_mm398xxz',
  quantiteColumnId: 'numeric_mm293wap',
  connexionCatalogueColumnId: 'board_relation_mm29jxfv',
  statutEquipementColumnId: 'color_mm2952ze',
  connexionFamilleColumnId: 'color_mm3k513j',
  reservableColumnId: 'numeric_mm2921rk',
  plageReservationColumnId: 'timerange_mm4j12mz',
  statutReservationColumnId: 'status',
  connexionEquipementColumnId: 'board_relation_mm4j1ene',
  connexionDemandeColumnId: 'board_relation_mm4jaj64',
  formationNameColumnId: 'text_mm295wsj',
  materielRequisColumnId: 'dropdown_mm29dfgd',
  serialColumnId: 'text_mm4ke2cy',
  tagColumnId: 'text_mm51c6hv',
  localColumnId: 'text_mm3ynk0g',
  sousFamilleColumnId: 'color_mm3x282f',
  osColumnId: 'color_mm29yn1b',
};

const ACCENT = colors.accent;

export const App: React.FC = () => {
  const { context, settings, loading: ctxLoading } = useMonday();

  // Config de base = défauts surchargés par les settings texte non vides du widget.
  const baseConfig = useMemo<AppConfig>(() => {
    const overrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'string' && value.trim()) overrides[key] = value.trim();
    }
    return { ...DEFAULT_CONFIG, ...overrides } as AppConfig;
  }, [settings]);

  // Config effective : auto-mapping des colonnes à partir des seuls ids de boards
  // (installation sur un autre compte = 3 boards à renseigner, colonnes détectées).
  // Court-circuité pour INA (boards par défaut) → baseConfig inchangé.
  const [config, setConfig] = useState<AppConfig>(baseConfig);
  useEffect(() => {
    let cancelled = false;
    resolveConfig(baseConfig, context?.boardId)
      .then(resolved => { if (!cancelled) setConfig(resolved); })
      .catch(() => { if (!cancelled) setConfig(baseConfig); });
    return () => { cancelled = true; };
  }, [baseConfig, context?.boardId]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const itemId = context?.itemId ?? null;

  const { demand, loading: demandLoading, error: demandError } = useDemandContext(itemId, {
    dateFormationColumnId: config.dateFormationColumnId,
    quantiteColumnId: config.quantiteColumnId,
    connexionCatalogueColumnId: config.connexionCatalogueColumnId,
    materielRequisColumnId: config.materielRequisColumnId,
    formationNameColumnId: config.formationNameColumnId,
  });

  const lines = demand?.lines ?? [];

  const { results: availMap, loading: availLoading, refresh } = useMultiAvailability(
    lines,
    demand?.dateRange ?? null,
    config,
  );

  const { lines: resLines, reservedIds, reserve, cancel } = useReservations(config, lines);
  const { alternatives, loading: altLoading, search: searchAlternatives } = useAlternatives();

  const formatDateRange = useCallback(() => {
    if (!demand?.dateRange) return '';
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(demand.dateRange.from)} → ${fmt(demand.dateRange.to)}`;
  }, [demand]);

  const dateRangeStr = formatDateRange();

  const getReservedCountForLine = useCallback((lineIndex: number) =>
    resLines.filter(r => r.lineIndex === lineIndex).length, [resLines]);

  const coveredLines = lines.filter((line, i) => {
    if (line.error) return false;
    return getReservedCountForLine(i) >= line.quantite;
  }).length;

  const nonErrorLineCount = lines.filter(l => !l.error).length;
  const allCovered = nonErrorLineCount > 0 && coveredLines === nonErrorLineCount;
  const reservedModels = Array.from(new Set(lines.filter(l => !l.error).map(l => l.familyName)));

  const openModal = useCallback((lineIndex: number) => {
    const line = lines[lineIndex];
    const avail = availMap.get(lineIndex);
    if (!line || !avail || !demand) return;

    const reserved = getReservedCountForLine(lineIndex);
    const maxNeeded = Math.max(0, line.quantite - reserved);
    if (maxNeeded <= 0) return;

    if (avail.availableCount === 0) {
      setModal({
        step: 'epuise',
        lineIndex,
        targetFamilyId: line.familyId ?? '',
        modelName: line.familyName,
        availableCount: 0,
        requested: 0,
        maxNeeded,
        proposed: 0,
      });
      searchAlternatives(line.familyName, demand.dateRange, config, line.familyId ?? undefined);
      return;
    }

    setModal({
      step: 'saisie',
      lineIndex,
      targetFamilyId: line.familyId ?? '',
      modelName: line.familyName,
      availableCount: avail.availableCount,
      requested: Math.min(maxNeeded, avail.availableCount),
      maxNeeded,
      proposed: 0,
    });
  }, [lines, availMap, demand, getReservedCountForLine, searchAlternatives, config]);

  const handleQuantityChange = useCallback((delta: number) => {
    setModal(prev => {
      if (!prev) return prev;
      const max = Math.min(prev.maxNeeded, prev.availableCount);
      const next = Math.max(1, Math.min(max, prev.requested + delta));
      return { ...prev, requested: next };
    });
  }, []);

  const handleConfirm = useCallback(async (quantity: number) => {
    if (!demand || !modal || confirming) return;

    const line = lines[modal.lineIndex];
    if (!line || line.error) return;

    const targetFamilyId = modal.targetFamilyId;
    const targetModelName = modal.modelName;

    setConfirming(true);

    try {
      const freshAvail = await fetchAvailabilityForModel(targetModelName, demand.dateRange, config);

      if (freshAvail.availableCount === 0) {
        setModal(prev => prev ? { ...prev, step: 'epuise', proposed: 0 } : prev);
        searchAlternatives(targetModelName, demand.dateRange, config, targetFamilyId);
        return;
      }

      const remaining = Math.max(0, line.quantite - getReservedCountForLine(modal.lineIndex));
      if (freshAvail.availableCount < quantity) {
        setModal(prev => prev ? {
          ...prev, step: 'proposition',
          proposed: Math.min(freshAvail.availableCount, remaining),
          availableCount: freshAvail.availableCount,
        } : prev);
        return;
      }

      const created = await reserve(
        freshAvail.available,
        quantity,
        demand.dateRange,
        line.subitemId,
        targetModelName,
        modal.lineIndex,
      );

      // Détection TOCTOU : une unité n'est en conflit que si une AUTRE réservation
      // (id différent des miennes) chevauche la période sur la même unité. On ne
      // compte donc PAS mes propres réservations fraîches comme un conflit.
      const myResIds = new Set(created.map(r => r.id));
      const freshRes = (await fetchAllReservations(config.reservationsBoardId))
        .map(it => parseReservation(it, config))
        .filter((r): r is ReservationRecord => r !== null);
      const conflicts = created.filter(c =>
        freshRes.some(r =>
          !myResIds.has(r.id) &&
          r.equipmentId === c.unitId &&
          hasOverlap(demand.dateRange, { from: r.dateFrom, to: r.dateTo }) &&
          isActiveReservation(r.status),
        ),
      );

      if (conflicts.length > 0) {
        for (const c of conflicts) {
          await cancel(c.id, c.unitId);
        }
        const kept = created.length - conflicts.length;
        if (kept > 0) {
          setModal(null);
          setToast({ message: `${kept} unité(s) réservée(s) pour ${targetModelName} — ${conflicts.length} annulée(s) (conflit avec un autre utilisateur)`, variant: 'error' });
        } else {
          setModal(prev => prev ? { ...prev, step: 'epuise', proposed: 0 } : prev);
          searchAlternatives(targetModelName, demand.dateRange, config, targetFamilyId);
          setToast({ message: `Conflit : les unités ont été réservées par un autre utilisateur`, variant: 'error' });
        }
        refresh();
        return;
      }

      const newReserved = getReservedCountForLine(modal.lineIndex) + quantity;
      if (newReserved >= line.quantite) {
        setModal(null);
        setToast({ message: `Besoin couvert ! ${quantity} unité(s) réservée(s) pour ${targetModelName}`, variant: 'success' });
      } else {
        setModal(null);
        setToast({ message: `${quantity} unité(s) réservée(s) pour ${targetModelName} — il reste ${line.quantite - newReserved} unité(s) à couvrir`, variant: 'success' });
      }
      refresh();
    } catch (err) {
      setModal(null);
      setToast({ message: `Erreur: ${err instanceof Error ? err.message : 'Échec de la réservation'}`, variant: 'error' });
    } finally {
      setConfirming(false);
    }
  }, [demand, modal, lines, config, reserve, cancel, refresh, getReservedCountForLine, confirming, searchAlternatives]);

  const handleCancel = useCallback(async (reservationId: string, unitId: string) => {
    await cancel(reservationId, unitId);
    setToast({ message: 'Réservation annulée', variant: 'success' });
    refresh();
  }, [cancel, refresh]);

  const configMissing = !config.famillesBoardId || !config.reservationsBoardId;

  if (configMissing) {
    return (
      <div style={{ fontFamily: fonts.ui, padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          background: '#fff4e3', border: '1px solid #ffe0b2', borderRadius: 12,
          padding: '18px 20px', textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>&#x2699;&#xFE0F;</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text.primary, marginBottom: 6 }}>
            Configuration requise
          </div>
          <div style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            Veuillez configurer les IDs de tableaux dans les paramètres du widget.
          </div>
        </div>
      </div>
    );
  }

  if (ctxLoading || demandLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 200, fontFamily: fonts.ui, color: colors.text.muted, fontSize: 14,
      }}>
        Chargement de la demande...
      </div>
    );
  }

  if (demandError) {
    return (
      <div style={{ fontFamily: fonts.ui, padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          background: '#fdf2f3', border: '1px solid #f3d3d8', borderRadius: 12,
          padding: '18px 20px', textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>&#x26A0;&#xFE0F;</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text.primary, marginBottom: 6 }}>
            Information manquante
          </div>
          <div style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            {demandError}
          </div>
        </div>
      </div>
    );
  }

  if (!demand) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 200, fontFamily: fonts.ui, color: colors.text.muted, fontSize: 14,
      }}>
        Aucune donnée disponible.
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: fonts.ui, padding: 20, maxWidth: 720, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <DemandContextCard
        parentName={demand.parentName}
        formationName={demand.formationName}
        dateRange={dateRangeStr}
        totalLines={lines.filter(l => !l.error).length}
        coveredLines={coveredLines}
        accent={ACCENT}
      />

      {allCovered && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: '#e9f7ef', border: '1px solid #b6e6cb', borderRadius: 12,
          padding: '14px 18px',
        }}>
          <span style={{ fontSize: 20, lineHeight: 1.2 }}>{'✅'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0b6b3a' }}>
              Demande entièrement couverte
            </div>
            <div style={{ fontSize: 13, color: '#1c6b45', marginTop: 3, lineHeight: 1.5 }}>
              {resLines.length} unité{resLines.length > 1 ? 's' : ''} réservée{resLines.length > 1 ? 's' : ''}
              {reservedModels.length > 0 && ` (${reservedModels.join(', ')})`} · {dateRangeStr}.
              <br />
              Détail des unités attribuées ci-dessous — pensez à préparer puis remettre le matériel sur la période.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: ACCENT }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.text.primary }}>
          Lignes de matériel ({lines.length})
        </h2>
        {availLoading && (
          <span style={{ fontSize: 12, color: colors.text.muted, marginLeft: 'auto' }}>
            Vérification de la disponibilité...
          </span>
        )}
      </div>

      {lines.map((line, i) => (
        <LineCard
          key={line.subitemId}
          line={line}
          lineIndex={i}
          availability={availMap.get(i) ?? null}
          reservedCount={getReservedCountForLine(i)}
          loading={availLoading && !availMap.has(i)}
          accent={ACCENT}
          onReserve={openModal}
        />
      ))}

      {resLines.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#00c875' }} />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.text.primary }}>
              Réservations effectuées ({resLines.length})
            </h2>
          </div>
          <ReservationLines lines={resLines} onCancel={handleCancel} />
        </>
      )}

      {modal && (
        <ReservationModal
          modal={modal}
          dateRange={dateRangeStr}
          accent={ACCENT}
          loading={confirming}
          alternatives={alternatives}
          alternativesLoading={altLoading}
          onClose={() => !confirming && setModal(null)}
          onConfirm={handleConfirm}
          onQuantityChange={handleQuantityChange}
          onSelectAlternative={(altModelName) => {
            if (!demand) return;
            const altItem = alternatives.find(a => a.family.name === altModelName);
            if (!altItem) return;
            setModal(prev => prev ? {
              ...prev,
              step: 'saisie',
              targetFamilyId: altItem.family.id,
              modelName: altModelName,
              availableCount: altItem.availableCount,
              requested: Math.min(prev.maxNeeded, altItem.availableCount),
            } : prev);
          }}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
};
