export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.625} viewBox="0 0 64 32" aria-hidden="true">
      <circle cx="8" cy="16" r="5" fill="var(--color-accent)" />
      <circle cx="56" cy="16" r="5" fill="var(--color-accent)" />
      <path
        d="M8 16 C 24 -4, 40 36, 56 16"
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
