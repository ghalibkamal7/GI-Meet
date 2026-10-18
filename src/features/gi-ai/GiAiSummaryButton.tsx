import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export function GiAiSummaryButton({ onGenerate, onOpen }: { onGenerate: () => Promise<string>; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    onOpen?.();
    setLoading(true);
    setError(null);
    try {
      setSummary(await onGenerate());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="rb-btn rb-btn--outline rb-icon-btn" title="Summarize with GI" aria-label="Summarize conversation with GI" onClick={handleOpen}>
        <Sparkles size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div className="rb-card rb-modal-card" role="dialog" aria-modal="true" aria-labelledby="gi-summary-title" style={{ width: 420, padding: 20, maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 id="gi-summary-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} strokeWidth={1.75} color="var(--color-accent)" /> GI summary
            </h3>
            {loading && <p style={{ color: 'var(--color-text-muted)' }}>Summarizing…</p>}
            {error && <p className="rb-error-text">{error}</p>}
            {summary && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{summary}</p>}
            <button className="rb-btn rb-btn--outline" style={{ marginTop: 16 }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 51, 47, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 150,
};
