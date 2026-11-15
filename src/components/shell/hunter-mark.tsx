/** HUNTER logo mark: a reticle. Pure SVG so it inherits colour and scales cleanly. */
export function HunterMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} role="img" aria-label="HUNTER">
      <rect width="32" height="32" rx="8" fill="var(--foreground)" />
      <circle cx="16" cy="16" r="7" stroke="var(--background)" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="var(--background)" />
      <path d="M16 5v5M16 22v5M5 16h5M22 16h5" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
