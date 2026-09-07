export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 40,
      }}
    >
      <svg className="rb-thread-loader" viewBox="0 0 64 32" aria-hidden="true">
        <circle cx="8" cy="16" r="5" />
        <circle cx="56" cy="16" r="5" />
        <path d="M8 16 C 24 -4, 40 36, 56 16" />
      </svg>
      {label && (
        <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{label}</span>
      )}
    </div>
  );
}
