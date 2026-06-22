import React, { useState } from 'react';
import { colors, fonts, hexToRgba } from '../../constants/design-tokens';
import type { AvailabilityResult, DemandLine } from '../../types';

interface Props {
  line: DemandLine;
  lineIndex: number;
  availability: AvailabilityResult | null;
  reservedCount: number;
  loading: boolean;
  accent: string;
  onReserve: (lineIndex: number) => void;
}

export const LineCard: React.FC<Props> = ({
  line, lineIndex, availability, reservedCount, loading, accent, onReserve,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (line.error) {
    return (
      <div style={{
        background: '#fdf2f3', border: '1px solid #f3d3d8', borderRadius: 10,
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 16 }}>&#x26A0;&#xFE0F;</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{line.familyName || 'Ligne incomplète'}</div>
          <div style={{ fontSize: 12, color: '#9c5a00', marginTop: 2 }}>{line.error}</div>
        </div>
      </div>
    );
  }

  const covered = reservedCount >= line.quantite;
  const remaining = Math.max(0, line.quantite - reservedCount);
  const availCount = availability?.availableCount ?? 0;
  const total = availability?.total ?? 0;

  return (
    <div style={{
      background: colors.bg.card, border: `1px solid ${covered ? '#c3e6cb' : colors.border.default}`,
      borderRadius: 10, overflow: 'hidden',
      borderLeft: `3px solid ${covered ? '#00c875' : availCount > 0 ? accent : '#fdab3d'}`,
    }}>
      {/* Summary row */}
      <div
        onClick={() => !loading && availability && setExpanded(!expanded)}
        style={{
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: availability ? 'pointer' : 'default',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {line.familyName}
          </div>
          <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
            {line.quantite} unité{line.quantite > 1 ? 's' : ''} demandée{line.quantite > 1 ? 's' : ''}
          </div>
        </div>

        {loading && (
          <span style={{ fontSize: 12, color: colors.text.muted }}>Chargement...</span>
        )}

        {!loading && availability && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Availability badge */}
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
              background: availCount > 0 ? '#e9f7ef' : '#f1f2f6',
              color: availCount > 0 ? '#00854d' : '#676879',
            }}>
              {availCount} / {total} dispo
            </span>

            {/* Coverage badge */}
            {covered ? (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                background: '#e9f7ef', color: '#00854d',
              }}>✓ Couvert</span>
            ) : reservedCount > 0 ? (
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                background: '#fff4e3', color: '#9c5a00',
              }}>{reservedCount}/{line.quantite} réservés</span>
            ) : null}

            {/* Reserve button */}
            {!covered && availCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onReserve(lineIndex); }}
                style={{
                  border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12.5,
                  fontWeight: 700, color: '#fff', cursor: 'pointer',
                  background: accent, fontFamily: fonts.ui,
                }}
              >Réserver</button>
            )}

            {/* Expand arrow */}
            <span style={{
              fontSize: 11, color: colors.text.muted,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform .2s',
            }}>▼</span>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && availability && (
        <div style={{
          padding: '0 16px 14px', borderTop: `1px solid ${colors.border.light}`,
          paddingTop: 14,
        }}>
          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <StatBadge value={availability.availableCount} label="Disponibles" bg="#e9f7ef" color="#00854d" />
            <StatBadge value={availability.reservedCount} label="Réservées" bg="#fff4e3" color="#9c5a00" />
            <StatBadge value={availability.maintenanceCount} label="Maintenance" bg="#f1f2f6" color="#676879" />
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: '#eef0f4', marginBottom: 10 }}>
            <div style={{ background: '#00c875', flex: availability.availableCount, transition: 'flex .3s' }} />
            <div style={{ background: '#fdab3d', flex: availability.reservedCount, transition: 'flex .3s' }} />
            <div style={{ background: '#c4c7d4', flex: availability.maintenanceCount, transition: 'flex .3s' }} />
          </div>

          {/* Unit chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {[...availability.available, ...availability.reserved, ...availability.maintenance].map(u => {
              const isAvail = availability.available.includes(u);
              const isMaint = availability.maintenance.includes(u);
              const dot = isAvail ? '#00c875' : isMaint ? '#c4c7d4' : '#fdab3d';
              return (
                <span key={u.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${colors.border.default}`, borderRadius: 6,
                  padding: '4px 8px', fontSize: 11, background: '#fbfbfd',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: dot }} />
                  <span style={{ fontFamily: fonts.mono, color: colors.text.body, fontWeight: 500 }}>{u.serial}</span>
                </span>
              );
            })}
          </div>

          {/* Coverage info */}
          {!covered && remaining > 0 && (
            <div style={{
              marginTop: 10, padding: '8px 12px', background: '#fff4e3', borderRadius: 7,
              fontSize: 12, color: '#9c5a00',
            }}>
              Il manque encore <b>{remaining}</b> unité{remaining > 1 ? 's' : ''} pour couvrir ce besoin.
              {availCount === 0 && ' Aucune unité disponible actuellement.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StatBadge: React.FC<{ value: number; label: string; bg: string; color: string }> = ({
  value, label, bg, color,
}) => (
  <div style={{
    flex: 1, background: bg, borderRadius: 7, padding: '8px 10px', textAlign: 'center',
  }}>
    <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10.5, color, fontWeight: 600, marginTop: 2 }}>{label}</div>
  </div>
);
