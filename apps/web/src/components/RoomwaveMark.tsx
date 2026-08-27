export function RoomwaveMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 32 : 40;
  return (
    <div className="inline-flex items-center gap-3" aria-label="Roomwave">
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        aria-hidden="true"
        className="shrink-0 border-2 border-[var(--ink)] bg-[var(--red)]"
        shapeRendering="crispEdges"
      >
        <path
          d="M4 20 L8 14 L12 18 L16 10 L20 16 L24 8 L28 13"
          fill="none"
          stroke="var(--paper)"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <rect x="4" y="24" width="24" height="4" fill="var(--ink)" />
      </svg>
      <span className="mono-tag font-bold text-[var(--red)]">roomwave</span>
    </div>
  );
}
