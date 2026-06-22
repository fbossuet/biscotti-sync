import React from 'react';
import { colors, fonts } from '../../constants/design-tokens';

interface Props {
  parentName: string;
  formationName: string;
  dateRange: string;
  totalLines: number;
  coveredLines: number;
  accent: string;
}

export const DemandContextCard: React.FC<Props> = ({
  parentName, formationName, dateRange, totalLines, coveredLines, accent,
}) => {
  const allCovered = coveredLines >= totalLines;

  return (
    <div style={{
      background: colors.bg.card, border: `1px solid ${colors.border.default}`,
      borderRadius: '12px', padding: '18px 20px', boxShadow: '0 4px 14px rgba(29,33,55,.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: '#eef1fb',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        }}>📋</div>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
          textTransform: 'uppercase' as const, color: colors.text.muted,
        }}>Demande de matériel</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <LabelValue label="Demande" value={parentName} />
        <LabelValue label="Formation" value={formationName || '—'} />
        <LabelValue label="Période" value={dateRange} />
      </div>

      <div style={{ height: 1, background: colors.border.light, margin: '16px 0 14px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.text.secondary }}>
              Lignes de matériel
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.text.body }}>
              {coveredLines} / {totalLines} couvertes
            </span>
          </div>
          <div style={{ height: 8, background: '#eef0f4', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width .4s ease',
              width: `${totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0}%`,
              background: allCovered ? '#00c875' : accent,
            }} />
          </div>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 99, whiteSpace: 'nowrap' as const,
          background: allCovered ? '#e9f7ef' : '#fff4e3',
          color: allCovered ? '#00854d' : '#9c5a00',
        }}>{allCovered ? 'Tout couvert' : 'En cours'}</span>
      </div>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
    letterSpacing: '.4px', color: colors.text.muted, marginBottom: 5,
    fontFamily: fonts.ui,
  }}>{children}</div>
);

const Value: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.body, lineHeight: 1.3 }}>{children}</div>
);

const LabelValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div><Label>{label}</Label><Value>{value}</Value></div>
);
