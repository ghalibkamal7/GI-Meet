export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: '4px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px' }}>
          <div className="rb-skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="rb-skeleton" style={{ width: '45%', height: 13, borderRadius: 4, marginBottom: 8 }} />
            <div className="rb-skeleton" style={{ width: '70%', height: 11, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
