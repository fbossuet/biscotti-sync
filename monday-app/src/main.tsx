import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: "'Figtree', sans-serif", padding: 24,
          maxWidth: 600, margin: '0 auto',
        }}>
          <div style={{
            background: '#fdf2f3', border: '1px solid #f3d3d8',
            borderRadius: 12, padding: '18px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>&#x26A0;&#xFE0F;</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1f33', marginBottom: 6 }}>
              Erreur inattendue
            </div>
            <div style={{ fontSize: 12, color: '#676879', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {this.state.error.message}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
