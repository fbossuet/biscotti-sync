import React, { useState, useCallback, useEffect } from 'react';
import { colors, fonts } from './constants/design-tokens';
import { useMonday } from './hooks/useMonday';
import { useSubitemContext } from './hooks/useSubitemContext';
import { useAvailability } from './hooks/useAvailability';
import { useAlternatives } from './hooks/useAlternatives';
import { useReservations } from './hooks/useReservations';
import { DemandContextCard } from './components/DemandContext/DemandContext';
import { Widget1 } from './components/Widget1/Widget1';
import { Widget2 } from './components/Widget2/Widget2';
import { ReservationModal } from './components/ReservationModal/ReservationModal';
import { ReservationLines } from './components/ReservationLines/ReservationLines';
import { Toast } from './components/shared/Toast';
import { listen } from './services/monday-api';
import type { ModalState, BoardConfig } from './types';

interface AppConfig extends BoardConfig {
  sousFamilleColumnId: string;
  osColumnId: string;
}

const DEFAULT_CONFIG: AppConfig = {
  famillesBoardId: '',
  equipementsBoardId: '',
  reservationsBoardId: '',
  dateFormationColumnId: 'date_formation',
  quantiteColumnId: 'quantite',
  connexionCatalogueColumnId: 'connexion_catalogue',
  statutEquipementColumnId: 'statut',
  connexionFamilleColumnId: 'connexion_famille',
  reservableColumnId: 'reservable',
  plageReservationColumnId: 'plage_reservation',
  statutReservationColumnId: 'statut_reservation',
  connexionEquipementColumnId: 'connexion_equipement',
  connexionDemandeColumnId: 'connexion_demande',
  sousFamilleColumnId: 'sous_famille',
  osColumnId: 'os',
};

const ACCENT = colors.accent;

export const App: React.FC = () => {
  const { context, loading: ctxLoading } = useMonday();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listen('settings', (res: unknown) => {
      const settings = (res as { data: Record<string, string> }).data;
      setConfig(prev => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(settings).filter(([, v]) => v !== undefined && v !== ''),
        ),
      }));
    });
  }, []);

  const itemId = context?.itemId ?? null;

  const { demand, loading: demandLoading, error: demandError } = useSubitemContext(itemId, {
    dateFormationColumnId: config.dateFormationColumnId,
    quantiteColumnId: config.quantiteColumnId,
    connexionCatalogueColumnId: config.connexionCatalogueColumnId,
  });

  const { result: availability, loading: availLoading, refresh } = useAvailability(
    demand?.familyId ?? null,
    demand?.dateRange ?? null,
    config,
  );

  const { alternatives } = useAlternatives(
    demand?.familyId ?? null,
    demand?.sousFamille || null,
    demand?.dateRange ?? null,
    config,
  );

  const { lines, reservedIds, reserve, cancel } = useReservations(config);

  const reserved = lines.length;
  const quantite = demand?.quantite ?? 0;
  const covered = reserved >= quantite;
  const remaining = Math.max(0, quantite - reserved);

  const formatDateRange = useCallback(() => {
    if (!demand?.dateRange) return '';
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(demand.dateRange.from)} → ${fmt(demand.dateRange.to)}`;
  }, [demand]);

  const dateRangeStr = formatDateRange();

  const openModal = useCallback((familyId?: string) => {
    if (!availability || !demand) return;
    const maxNeeded = remaining;
    if (maxNeeded <= 0) return;

    setModal({
      step: 'saisie',
      targetFamilyId: familyId || demand.familyId,
      modelName: demand.familyName,
      availableCount: availability.availableCount,
      requested: Math.min(maxNeeded, availability.availableCount),
      maxNeeded,
      proposed: 0,
    });
  }, [availability, demand, remaining]);

  const handleQuantityChange = useCallback((delta: number) => {
    setModal(prev => {
      if (!prev) return prev;
      const max = Math.min(prev.maxNeeded, prev.availableCount);
      const next = Math.max(1, Math.min(max, prev.requested + delta));
      return { ...prev, requested: next };
    });
  }, []);

  const handleConfirm = useCallback(async (quantity: number) => {
    if (!demand || !availability) return;

    const freshAvail = await refresh();
    if (!freshAvail) return;

    if (freshAvail.availableCount === 0) {
      setModal(prev => prev ? { ...prev, step: 'epuise', proposed: 0 } : prev);
      return;
    }

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
      demand.itemId,
      demand.familyName,
    );

    setModal(null);
    setToast(`${quantity} unité(s) réservée(s) avec succès`);
    refresh();
  }, [demand, availability, refresh, reserve, remaining]);

  const handleCancel = useCallback(async (reservationId: string, unitId: string) => {
    await cancel(reservationId, unitId);
    setToast('Réservation annulée');
    refresh();
  }, [cancel, refresh]);

  const configMissing = !config.famillesBoardId || !config.equipementsBoardId || !config.reservationsBoardId;

  if (configMissing) {
    return (
      <div style={{
        fontFamily: fonts.ui, padding: 24, maxWidth: 600, margin: '0 auto',
      }}>
        <div style={{
          background: '#fff4e3', border: '1px solid #ffe0b2', borderRadius: 12,
          padding: '18px 20px', textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>&#x2699;&#xFE0F;</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text.primary, marginBottom: 6 }}>
            Configuration requise
          </div>
          <div style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 1.5 }}>
            Veuillez configurer les IDs de tableaux dans les paramètres du widget
            (Board ID Familles, Équipements et Réservations).
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
        Chargement...
      </div>
    );
  }

  if (demandError) {
    return (
      <div style={{
        fontFamily: fonts.ui, padding: 24, maxWidth: 600, margin: '0 auto',
      }}>
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

  if (!demand || !availability) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 200, fontFamily: fonts.ui, color: colors.text.muted, fontSize: 14,
      }}>
        {availLoading ? 'Calcul de la disponibilité...' : 'Aucune donnée disponible.'}
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: fonts.ui, padding: 20, maxWidth: 720, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <DemandContextCard
        sousFamille={demand.sousFamille || demand.familyName}
        modele={demand.familyName}
        os={demand.os}
        dateRange={dateRangeStr}
        quantite={quantite}
        reserved={reserved}
        accent={ACCENT}
      />

      <Widget1
        modele={demand.familyName}
        dateRange={dateRangeStr}
        availability={availability}
        reservedIds={reservedIds}
        covered={covered}
        accent={ACCENT}
        onReserve={() => openModal()}
      />

      {!covered && (
        <Widget2
          sousFamille={demand.sousFamille || demand.familyName}
          remaining={remaining}
          alternatives={alternatives}
          accent={ACCENT}
          onReserve={(familyId) => openModal(familyId)}
        />
      )}

      <ReservationLines lines={lines} onCancel={handleCancel} />

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
