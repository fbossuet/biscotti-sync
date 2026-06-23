import React from 'react';
import { colors, fonts } from '../../constants/design-tokens';
import type { ModalState } from '../../types';

interface Props {
  modal: ModalState;
  dateRange: string;
  accent: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  onQuantityChange: (delta: number) => void;
}

export const ReservationModal: React.FC<Props> = ({
  modal, dateRange, accent, loading, onClose, onConfirm, onQuantityChange,
}) => (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(28,31,51,.42)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, zIndex: 50, animation: 'scOverlay .15s ease',
  }} onClick={onClose}>
    <div style={{
      width: '100%', maxWidth: 420, background: '#fff', borderRadius: 14,
      boxShadow: '0 24px 60px rgba(20,22,45,.32)', overflow: 'hidden',
      animation: 'scPop .2s ease',
    }} onClick={e => e.stopPropagation()}>
      {modal.step === 'saisie' && (
        <SaisieStep modal={modal} dateRange={dateRange} accent={accent} loading={loading}
          onClose={onClose} onConfirm={onConfirm} onQuantityChange={onQuantityChange} />
      )}
      {modal.step === 'proposition' && (
        <PropositionStep modal={modal} accent={accent} loading={loading}
          onClose={onClose} onConfirm={onConfirm} />
      )}
      {modal.step === 'epuise' && (
        <EpuiseStep accent={accent} onClose={onClose} />
      )}
    </div>
  </div>
);

const SaisieStep: React.FC<{
  modal: ModalState; dateRange: string; accent: string; loading?: boolean;
  onClose: () => void; onConfirm: (q: number) => void; onQuantityChange: (d: number) => void;
}> = ({ modal, dateRange, accent, loading, onClose, onConfirm, onQuantityChange }) => (
  <>
    <div style={{ padding: '22px 24px 6px' }}>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
        textTransform: 'uppercase' as const, color: accent, marginBottom: 6,
      }}>Reserver mon materiel</div>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.text.primary }}>
        {modal.modelName}
      </h3>
      <div style={{ fontSize: 13, color: colors.text.secondary }}>
        {modal.availableCount} unite(s) disponible(s) sur {dateRange}
      </div>
    </div>
    <div style={{ padding: '18px 24px 8px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text.secondary, marginBottom: 9 }}>
        Quantite a reserver
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1px solid ${colors.border.default}`, borderRadius: 10, overflow: 'hidden',
        }}>
          <button onClick={() => onQuantityChange(-1)} style={{
            width: 40, height: 44, border: 'none', background: colors.bg.subtle,
            fontSize: 20, color: colors.text.secondary, cursor: 'pointer', fontFamily: fonts.ui,
          }}>&minus;</button>
          <div style={{
            width: 62, textAlign: 'center' as const, fontSize: 22,
            fontWeight: 800, color: colors.text.primary,
          }}>{modal.requested}</div>
          <button onClick={() => onQuantityChange(1)} style={{
            width: 40, height: 44, border: 'none', background: colors.bg.subtle,
            fontSize: 20, color: colors.text.secondary, cursor: 'pointer', fontFamily: fonts.ui,
          }}>+</button>
        </div>
        <div style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.4 }}>
          Besoin restant : {modal.maxNeeded} unite(s).<br />La dispo est revalidee au clic.
        </div>
      </div>
    </div>
    <div style={{ padding: '16px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button onClick={onClose} style={{
        border: `1px solid ${colors.border.default}`, background: '#fff',
        color: colors.text.secondary, borderRadius: 9, padding: '10px 16px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.ui,
      }}>Annuler</button>
      <button onClick={() => !loading && onConfirm(modal.requested)} disabled={loading} style={{
        border: 'none', color: '#fff', borderRadius: 9, padding: '10px 18px',
        fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        background: loading ? '#999' : accent, fontFamily: fonts.ui,
        opacity: loading ? 0.8 : 1,
      }}>{loading ? 'Reservation en cours...' : `Reserver ${modal.requested} unite(s)`}</button>
    </div>
  </>
);

const PropositionStep: React.FC<{
  modal: ModalState; accent: string; loading?: boolean; onClose: () => void; onConfirm: (q: number) => void;
}> = ({ modal, accent, loading, onClose, onConfirm }) => (
  <>
    <div style={{ padding: '22px 24px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: '#fff4e3',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>&#x26A0;&#xFE0F;</span>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
          textTransform: 'uppercase' as const, color: '#9c5a00',
        }}>Disponibilite reduite</div>
      </div>
      <div style={{ fontSize: 13.5, color: colors.text.body, lineHeight: 1.55 }}>
        Revalidation au clic : seules <b>{modal.proposed} unite(s)</b> sont reellement disponibles
        sur la periode (le stock a change depuis l'affichage). Reserver cette quantite ?
      </div>
    </div>
    <div style={{ padding: '18px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button onClick={onClose} style={{
        border: `1px solid ${colors.border.default}`, background: '#fff',
        color: colors.text.secondary, borderRadius: 9, padding: '10px 16px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.ui,
      }}>Annuler</button>
      <button onClick={() => !loading && onConfirm(modal.proposed)} disabled={loading} style={{
        border: 'none', color: '#fff', borderRadius: 9, padding: '10px 18px',
        fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        background: loading ? '#999' : accent, fontFamily: fonts.ui,
        opacity: loading ? 0.8 : 1,
      }}>{loading ? 'Reservation en cours...' : `Reserver ${modal.proposed} unite(s)`}</button>
    </div>
  </>
);

const EpuiseStep: React.FC<{ accent: string; onClose: () => void }> = ({ accent, onClose }) => (
  <>
    <div style={{ padding: '22px 24px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: '#fdf2f3',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>&#x1F6AB;</span>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
          textTransform: 'uppercase' as const, color: colors.danger.text,
        }}>Plus aucune unite</div>
      </div>
      <div style={{ fontSize: 13.5, color: colors.text.body, lineHeight: 1.55 }}>
        A la revalidation, plus aucune unite de ce modele n'est disponible sur la periode.
        Essayez un equivalent dans « Autre materiel disponible ».
      </div>
    </div>
    <div style={{ padding: '18px 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{
        border: 'none', color: '#fff', borderRadius: 9, padding: '10px 18px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', background: accent, fontFamily: fonts.ui,
      }}>Fermer</button>
    </div>
  </>
);
