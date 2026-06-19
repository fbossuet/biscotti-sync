import React, { useEffect } from 'react';
import { colors } from '../../constants/design-tokens';

interface Props {
  message: string;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<Props> = ({ message, onClose, duration = 3500 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div style={{
      position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)',
      background: colors.toast, color: '#fff', padding: '12px 18px', borderRadius: 10,
      fontSize: 13, fontWeight: 600, boxShadow: '0 12px 32px rgba(20,22,45,.32)',
      display: 'flex', alignItems: 'center', gap: 9, zIndex: 60,
      animation: 'scToast .2s ease',
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 99, background: '#00c875',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
      }}>&#x2713;</span>
      {message}
    </div>
  );
};
