import React, { useState, useCallback } from 'react';
import { colors, fonts } from './constants/design-tokens';
import { useMonday } from './hooks/useMonday';
import { useDemandContext } from './hooks/useDemandContext';
import { useMultiAvailability, fetchAvailabilityForFamily } from './hooks/useAvailability';
import { useReservations } from './hooks/useReservations';
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
  sousFamilleColumnId: 'color_mm3x282f',
  osColumnId: 'color_mm29yn1b',
};

const ACCENT = colors.accent;

export const App: React.FC = () => {
  const { context, loading: ctxLoading } = useMonday();
  const [config] = useState<AppConfig>(DEFAULT_CONFIG);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const itemId = context?.itemId ?? null;

  const { demand, loading: demandLoading, error: demandError } = useDemandContext(itemId, {
    dateFormationColumnId: config.dateFormationColumnId,
    quantiteColumnId: config.quantiteColumnId,
    connexionCatalogueColumnId: config.connexionCatalogueColumnId,
  });

  const lines = demand?.lines ?? [];

  const { results: availMap, loading: availLoading, refresh } = useMultiAvailability(
    lines,
    demand?.dateRange ?? null,
    config,
  );

  const { lines: resLines, reservedIds, reserve, cancel } = useReservations(config);

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

  const openModal = useCallback((lineIndex: number) => {
    const line = lines[lineIndex];
    const avail = availMap.get(lineIndex);
    if (!line || !avail || !demand) return;

    const reserved = getReservedCountForLine(lineIndex);
    const maxNeeded = Math.max(0, line.quantite - reserved);
    if (maxNeeded <= 0) return;

    setModal({
      step: 'saisie',
      lineIndex,
      targetFamilyId: line.familyId!,
      modelName: line.familyName,
      availableCount: avail.availableCount,
      requested: Math.min(maxNeeded, avail.availableCount),
      maxNeeded,
      proposed: 0,
    });
  }, [lines, availMap, demand, getReservedCountForLine]);

  const handleQuantityChange = useCallback((delta: number) => {
    setModal(prev => {
      if (!prev) return prev;
      const max = Math.min(prev.maxNeeded, prev.availableCount);
      const next = Math.max(1, Math.min(max, prev.requested + delta));
      return { ...prev, requested: next };
    });
  }, []);

  const handleConfirm = useCallback(async (quantity: number) => {
    if (!demand || !modal) return;

    const line = lines[modal.lineIndex];
    if (!line?.familyId) return;

    try {
      const freshAvail = await fetchAvailabilityForFamily(line.familyId, demand.dateRange, config);

      if (freshAvail.availableCount === 0) {
        setModal(prev => prev ? { ...prev, step: 'epuise', proposed: 0 } : prev);
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

      await reserve(
        freshAvail.available,
        quantity,
        demand.dateRange,
        demand.parentId,
        line.familyName,
        modal.lineIndex,
      );

      setModal(null);
      setToast(`${quantity} unité(s) réservée(s) pour ${line.familyName}`);
      refresh();
    } catch (err) {
      console.error('[INA Stock] Reservation error:', err);
      setModal(null);
      setToast(`Erreur: ${err instanceof Error ? err.message : 'Échec de la réservation'}`);
    }
  }, [demand, modal, lines, config, reserve, refresh, getReservedCountForLine]);

  const handleCancel = useCallback(async (reservationId: string, unitId: string) => {
    await cancel(reservationId, unitId);
    setToast('Réservation annulée');
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
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
          onQuantityChange={handleQuantityChange}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
};
