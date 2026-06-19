export const colors = {
  text: {
    primary: '#1d1f33',
    body: '#323338',
    secondary: '#676879',
    muted: '#9699a6',
    white: '#ffffff',
  },
  bg: {
    app: '#eceef3',
    card: '#ffffff',
    subtle: '#f7f8fa',
    input: '#f4f5f8',
  },
  border: {
    default: '#e6e9ef',
    light: '#f0f1f5',
    subtle: '#f3f4f7',
    input: '#eceef3',
  },
  accent: '#1f76e5',
  status: {
    disponible: { dot: '#00c875', text: '#00854d', bg: '#e9f7ef', soft: '#f4fbf7' },
    reserve: { dot: '#fdab3d', text: '#9c5a00', bg: '#fff4e3', soft: '#fffaf2' },
    maintenance: { dot: '#c4c7d4', text: '#676879', bg: '#f1f2f6', soft: '#fbfbfd' },
    mine: (accent: string) => ({
      dot: accent,
      text: accent,
      bg: hexToRgba(accent, 0.12),
      soft: hexToRgba(accent, 0.12),
    }),
  },
  danger: { text: '#e2445c', bg: '#fdf2f3', border: '#f3d3d8' },
  widget2: '#7b5cff',
  demo: '#22233a',
  toast: '#1d2438',
} as const;

export const fonts = {
  ui: "'Figtree', -apple-system, system-ui, sans-serif",
  mono: "'Roboto Mono', monospace",
} as const;

export const radius = {
  sm: '7px',
  md: '9px',
  lg: '12px',
  xl: '14px',
  pill: '99px',
  card: '10px',
} as const;

export const shadows = {
  card: '0 4px 14px rgba(29,33,55,.05)',
  button: '0 2px 8px rgba(31,118,229,.28)',
  modal: '0 24px 60px rgba(20,22,45,.32)',
  toast: '0 12px 32px rgba(20,22,45,.32)',
  demo: '0 8px 24px rgba(20,22,45,.18)',
} as const;

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
