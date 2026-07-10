import React from 'react';
import { colors, fonts } from '../../constants/design-tokens';
import type { ReservationLine } from '../../types';

interface Props {
  lines: ReservationLine[];
  onCancel: (reservationId: string, unitId: string) => void;
}

export const ReservationLines: React.FC<Props> = ({ lines, onCancel }) => {
  if (lines.length === 0) return null;

  return (
    <section style={{
      background: colors.bg.card, border: `1px solid ${colors.border.default}`,
      borderRadius: 12, boxShadow: '0 4px 14px rgba(29,33,55,.05)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px 13px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: `1px solid ${colors.border.light}`,
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.text.primary }}>
          Lignes de reservation creees
        </h2>
        <span style={{
          fontSize: 12, fontWeight: 700, color: '#00854d', background: '#e9f7ef',
          padding: '4px 11px', borderRadius: 99,
        }}>{lines.length} ligne(s)</span>
      </div>

      <div>
        {lines.map(l => (
          <div key={l.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '11px 20px', borderTop: `1px solid ${colors.border.subtle}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 7, background: '#eef1fb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, flexShrink: 0,
              }}>&#x1F4BB;</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.body }}>{l.model}</div>
                <div style={{ fontSize: 11.5, color: colors.text.muted, fontFamily: fonts.mono }}>
                  {[
                    l.serial ? `S/N ${l.serial}` : null,
                    l.tag ? `TAG ${l.tag}` : null,
                    l.local ? `\u{1F4CD} ${l.local}` : null,
                  ].filter(Boolean).join('  ·  ') || 'Identifiants non renseignés'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 11.5, color: colors.text.secondary, whiteSpace: 'nowrap' as const }}>
                {l.dateRange}
              </span>
              <button onClick={() => onCancel(l.id, l.unitId)} style={{
                border: `1px solid ${colors.danger.border}`, background: colors.danger.bg,
                color: colors.danger.text, borderRadius: 7, padding: '5px 10px',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap' as const, fontFamily: fonts.ui,
              }}>Annuler</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 20px', background: '#fafbfc',
        borderTop: `1px solid ${colors.border.light}`, fontSize: 11.5, color: colors.text.muted,
      }}>
        Chaque ligne relie une unite physique a la demande. Annuler une ligne libere immediatement l'unite sur la periode.
      </div>
    </section>
  );
};
