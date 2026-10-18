import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onCancel()}>
      <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={{ width: 360, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {danger && (
            <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'rgba(196, 68, 46, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} strokeWidth={1.75} color="var(--color-danger)" />
            </div>
          )}
          <div>
            <h3 id="confirm-dialog-title" style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>{message}</p>
          </div>
        </div>
        {error && <p className="rb-error-text" role="alert" style={{ margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="rb-btn rb-btn--outline" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            className="rb-btn"
            style={{ background: danger ? 'var(--color-danger)' : 'var(--color-brand-700)', color: '#fff' }}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};
