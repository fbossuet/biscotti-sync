import React from 'react';
import { colors, fonts } from '../../constants/design-tokens';
import type { Alternative } from '../../types';

interface Props {
  sousFamille: string;
  remaining: number;
  alternatives: Alternative[];
  accent: string;
  onReserve: (familyId: string) => void;
}

export const Widget2: React.FC<Props> = ({
  sousFamille, remaining, alternatives, accent, onReserve,
}) => {
  const hasOptions = alternatives.some(a => a.availableCount > 0);

  return (
    <section style={{
      background: colors.bg.card, border: `1px solid ${colors.border.default}`,
      borderRadius: 12, boxShadow: '0 4px 14px rgba(29,33,55,.05)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 20px 15px', borderBottom: `1px solid ${colors.border.light}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: colors.widget2 }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.text.primary }}>Autre materiel disponible</h2>
        </div>
        <div style={{ fontSize: 12.5, color: colors.text.muted, marginTop: 3 }}>
          Equivalents de la sous-famille « {sousFamille} » libres sur la meme periode — il reste {remaining} unite(s) a couvrir.
        </div>
      </div>

      <div style={{ padding: '14px 20px 18px' }}>
        {hasOptions ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {alternatives.map(alt => {
              const availColor = alt.availableCount > 0 ? '#00854d' : colors.text.muted;
              const canReserve = alt.availableCount > 0;
              return (
                <div key={alt.family.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 14, border: `1px solid ${colors.border.input}`, borderRadius: 10,
                  padding: '12px 14px', background: '#fff',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>{alt.family.name}</div>
                    <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>{alt.family.os}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: availColor, lineHeight: 1 }}>{alt.availableCount}</div>
                      <div style={{ fontSize: 10.5, color: colors.text.muted }}>/ {alt.total} dispo</div>
                    </div>
                    {canReserve ? (
                      <button onClick={() => onReserve(alt.family.id)} style={{
                        border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 12.5,
                        fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                        background: accent, fontFamily: fonts.ui,
                      }}>Reserver</button>
                    ) : (
                      <span style={{
                        border: `1px solid ${colors.border.default}`, borderRadius: 8,
                        padding: '9px 15px', fontSize: 12.5, fontWeight: 600,
                        color: '#b3b6c4', background: colors.bg.input, whiteSpace: 'nowrap' as const,
                      }}>Indisponible</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign: 'center' as const, padding: '22px 16px',
            background: '#faf9fd', border: '1px dashed #ddd6f5', borderRadius: 11,
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>&#x1F5D2;&#xFE0F;</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.text.primary, marginBottom: 6 }}>
              Aucun equivalent disponible sur la periode
            </div>
            <div style={{
              fontSize: 12.5, color: colors.text.secondary, lineHeight: 1.5,
              maxWidth: 430, margin: '0 auto',
            }}>
              Hors perimetre de l'application : le demandeur signale le besoin via le champ commentaire du formulaire.
              Le cas est pris en charge par le workflow natif de contact de l'equipe de planification.
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
