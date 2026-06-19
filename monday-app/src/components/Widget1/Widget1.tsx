import React, { useState } from 'react';
import { colors, fonts, hexToRgba } from '../../constants/design-tokens';
import type { AvailabilityResult } from '../../types';

type ViewMode = 'compact' | 'tableau' | 'cartes';

interface UnitDisplay {
  id: string;
  serial: string;
  barcode: string;
  statusKey: string;
  statusLabel: string;
  dot: string;
  pillBg: string;
  pillColor: string;
  rowBg: string;
  cardBg: string;
}

interface Props {
  modele: string;
  dateRange: string;
  availability: AvailabilityResult;
  reservedIds: Set<string>;
  covered: boolean;
  accent: string;
  onReserve: () => void;
}

function getStatusStyle(statusKey: string, accent: string) {
  const map: Record<string, { label: string; dot: string; pillBg: string; pillColor: string; soft: string }> = {
    disponible: { label: 'Disponible', dot: '#00c875', pillBg: '#e9f7ef', pillColor: '#00854d', soft: '#f4fbf7' },
    reserve: { label: 'Réservé', dot: '#fdab3d', pillBg: '#fff4e3', pillColor: '#9c5a00', soft: '#fffaf2' },
    maintenance: { label: 'Maintenance', dot: '#c4c7d4', pillBg: '#f1f2f6', pillColor: '#676879', soft: '#fbfbfd' },
    mine: { label: 'Cette demande', dot: accent, pillBg: hexToRgba(accent, 0.12), pillColor: accent, soft: hexToRgba(accent, 0.12) },
  };
  return map[statusKey] || map.disponible;
}

function decorateUnits(availability: AvailabilityResult, reservedIds: Set<string>, accent: string): UnitDisplay[] {
  const all = [
    ...availability.available.map(e => ({ ...e, statusKey: reservedIds.has(e.id) ? 'mine' : 'disponible' })),
    ...availability.reserved.map(e => ({ ...e, statusKey: reservedIds.has(e.id) ? 'mine' : 'reserve' })),
    ...availability.maintenance.map(e => ({ ...e, statusKey: 'maintenance' })),
  ];

  return all.map(u => {
    const s = getStatusStyle(u.statusKey, accent);
    return {
      id: u.id, serial: u.serial, barcode: u.barcode,
      statusKey: u.statusKey, statusLabel: s.label,
      dot: s.dot, pillBg: s.pillBg, pillColor: s.pillColor,
      rowBg: u.statusKey === 'mine' ? s.soft : '#fff',
      cardBg: s.soft,
    };
  });
}

export const Widget1: React.FC<Props> = ({
  modele, dateRange, availability, reservedIds, covered, accent, onReserve,
}) => {
  const [view, setView] = useState<ViewMode>('compact');
  const units = decorateUnits(availability, reservedIds, accent);
  const { availableCount, reservedCount, maintenanceCount, total } = availability;
  const availColor = availableCount > 0 ? '#00854d' : colors.text.muted;

  return (
    <section style={{
      background: colors.bg.card, border: `1px solid ${colors.border.default}`,
      borderRadius: 12, boxShadow: '0 4px 14px rgba(29,33,55,.05)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 20px 16px', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 14, borderBottom: `1px solid ${colors.border.light}`,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.text.primary }}>Disponibilité matériel</h2>
          </div>
          <div style={{ fontSize: 12.5, color: colors.text.muted, marginTop: 3 }}>{modele} · sur la période demandée</div>
        </div>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: colors.text.secondary,
          background: colors.bg.input, border: `1px solid ${colors.border.default}`,
          padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap' as const,
        }}>{dateRange}</span>
      </div>

      {/* View Tabs */}
      <div style={{ padding: '12px 20px 0', display: 'flex', gap: 6 }}>
        {(['compact', 'tableau', 'cartes'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12.5,
            fontWeight: 600, cursor: 'pointer', fontFamily: fonts.ui,
            background: view === v ? hexToRgba(accent, 0.1) : 'transparent',
            color: view === v ? accent : colors.text.secondary,
          }}>
            {v === 'compact' ? 'Compact' : v === 'tableau' ? 'Tableau' : 'Cartes'}
          </button>
        ))}
      </div>

      <div style={{ padding: '18px 20px 6px' }}>
        {view === 'compact' && (
          <CompactView units={units} availableCount={availableCount} reservedCount={reservedCount}
            maintenanceCount={maintenanceCount} total={total} availColor={availColor} />
        )}
        {view === 'tableau' && (
          <TableView units={units} availableCount={availableCount} reservedCount={reservedCount}
            maintenanceCount={maintenanceCount} total={total} />
        )}
        {view === 'cartes' && (
          <CardView units={units} availableCount={availableCount} total={total} availColor={availColor} />
        )}
      </div>

      {/* Calc Note */}
      <div style={{
        margin: '6px 20px 0', padding: '10px 12px', background: colors.bg.subtle,
        borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 12 }}>ⓘ</span>
        <span style={{ fontSize: 11.5, color: colors.text.muted, lineHeight: 1.45 }}>
          Calcul basé sur le <b style={{ color: colors.text.secondary }}>tableau des réservations</b> chevauchant la période — jamais sur le statut instantané. La maintenance est le seul statut bloquant.
        </span>
      </div>

      {/* Footer Button */}
      <div style={{ padding: '14px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
        {!covered && availableCount > 0 && (
          <button onClick={onReserve} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
            borderRadius: 9, padding: '11px 18px', fontSize: 13.5, fontWeight: 700,
            color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(31,118,229,.28)',
            background: accent, fontFamily: fonts.ui,
          }}>+ Réserver mon matériel</button>
        )}
        {!covered && availableCount === 0 && (
          <button disabled style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: `1px solid ${colors.border.default}`, borderRadius: 9,
            padding: '11px 18px', fontSize: 13.5, fontWeight: 700,
            color: '#b3b6c4', background: colors.bg.input, cursor: 'not-allowed',
            fontFamily: fonts.ui,
          }}>Aucune unité disponible</button>
        )}
        {covered && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5,
            fontWeight: 700, color: '#00854d', background: '#e9f7ef',
            padding: '11px 16px', borderRadius: 9,
          }}>✓ Besoin couvert</span>
        )}
      </div>
    </section>
  );
};

/* ── Compact View ── */
const CompactView: React.FC<{
  units: UnitDisplay[]; availableCount: number; reservedCount: number;
  maintenanceCount: number; total: number; availColor: string;
}> = ({ units, availableCount, reservedCount, maintenanceCount, total, availColor }) => (
  <>
    <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
      <div style={{ textAlign: 'center', minWidth: 128 }}>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, color: availColor }}>{availableCount}</div>
        <div style={{ fontSize: 12.5, color: colors.text.muted, marginTop: 4 }}>sur {total} unités</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: availColor, marginTop: 2 }}>
          {availableCount > 1 ? 'disponibles' : 'disponible'}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', height: 11, borderRadius: 99, overflow: 'hidden', background: '#eef0f4', marginBottom: 10 }}>
          <div style={{ background: '#00c875', transition: 'flex .4s', flex: availableCount }} />
          <div style={{ background: '#fdab3d', transition: 'flex .4s', flex: reservedCount }} />
          <div style={{ background: '#c4c7d4', transition: 'flex .4s', flex: maintenanceCount }} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
          <Legend dot="#00c875" label={`${availableCount} disponibles`} />
          <Legend dot="#fdab3d" label={`${reservedCount} réservées`} />
          <Legend dot="#c4c7d4" label={`${maintenanceCount} maintenance`} />
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7, marginTop: 16 }}>
      {units.map(u => (
        <span key={u.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          border: `1px solid ${colors.border.default}`, borderRadius: 7,
          padding: '5px 9px', fontSize: 11.5, background: '#fbfbfd',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: u.dot }} />
          <span style={{ fontFamily: fonts.mono, color: colors.text.body, fontWeight: 500 }}>{u.serial}</span>
        </span>
      ))}
    </div>
  </>
);

/* ── Table View ── */
const TableView: React.FC<{
  units: UnitDisplay[]; availableCount: number; reservedCount: number;
  maintenanceCount: number; total: number;
}> = ({ units, availableCount, reservedCount, maintenanceCount, total }) => (
  <>
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' as const }}>
      <StatTile value={availableCount} label="Disponibles" bg="#e9f7ef" color="#00854d" labelColor="#3a8c64" />
      <StatTile value={reservedCount} label="Réservées" bg="#fff4e3" color="#9c5a00" labelColor="#9c5a00" />
      <StatTile value={maintenanceCount} label="Maintenance" bg="#f1f2f6" color="#676879" labelColor="#676879" />
      <StatTile value={total} label="Parc total" bg="#f4f5f8" color="#323338" labelColor="#9699a6" />
    </div>
    <div style={{ border: `1px solid ${colors.border.input}`, borderRadius: 9, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr', padding: '9px 13px',
        background: colors.bg.subtle, fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase' as const, letterSpacing: '.4px', color: colors.text.muted,
      }}>
        <span>N° de série</span><span>Code-barres INA</span><span style={{ textAlign: 'right' }}>Statut</span>
      </div>
      {units.map(u => (
        <div key={u.id} style={{
          display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr', padding: '9px 13px',
          borderTop: `1px solid ${colors.border.subtle}`, alignItems: 'center',
          fontSize: 12.5, background: u.rowBg,
        }}>
          <span style={{ fontFamily: fonts.mono, fontWeight: 500, color: colors.text.body }}>{u.serial}</span>
          <span style={{ fontFamily: fonts.mono, color: colors.text.secondary }}>{u.barcode}</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              background: u.pillBg, color: u.pillColor,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: u.dot }} />
              {u.statusLabel}
            </span>
          </span>
        </div>
      ))}
    </div>
  </>
);

/* ── Card View ── */
const CardView: React.FC<{
  units: UnitDisplay[]; availableCount: number; total: number; availColor: string;
}> = ({ units, availableCount, total, availColor }) => (
  <>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 32, fontWeight: 800, color: availColor, lineHeight: 1 }}>{availableCount}</span>
      <span style={{ fontSize: 13, color: colors.text.secondary }}>unités disponibles sur {total}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 9 }}>
      {units.map(u => (
        <div key={u.id} style={{
          border: `1px solid ${colors.border.default}`, borderRadius: 10,
          padding: '11px 12px', background: u.cardBg, borderLeft: `3px solid ${u.dot}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 12.5, fontWeight: 500, color: colors.text.primary }}>{u.serial}</span>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: u.dot }} />
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.muted, marginBottom: 9 }}>{u.barcode}</div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
            borderRadius: 99, fontSize: 11, fontWeight: 600, background: u.pillBg, color: u.pillColor,
          }}>{u.statusLabel}</span>
        </div>
      ))}
    </div>
  </>
);

/* ── Shared ── */
const Legend: React.FC<{ dot: string; label: string }> = ({ dot, label }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: colors.text.secondary }}>
    <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />
    {label}
  </span>
);

const StatTile: React.FC<{ value: number; label: string; bg: string; color: string; labelColor: string }> = ({
  value, label, bg, color, labelColor,
}) => (
  <div style={{ flex: 1, minWidth: 96, background: bg, borderRadius: 9, padding: '11px 13px' }}>
    <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11.5, color: labelColor, fontWeight: 600, marginTop: 3 }}>{label}</div>
  </div>
);
