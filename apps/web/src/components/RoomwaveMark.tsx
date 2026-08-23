export function RoomwaveMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3" aria-label="Roomwave">
      <svg
        viewBox="0 0 40 40"
        width={compact ? 32 : 40}
        height={compact ? 32 : 40}
        aria-hidden="true"
        className="shrink-0 border-2 border-[var(--ink)] bg-[var(--red)]"
        shapeRendering="crispEdges"
      >
        <path d="M4 23h6v-9h6v15h6V9h6v14h8v13H4z" fill="var(--paper)" />
        <path d="M4 29h32v7H4z" fill="var(--ink)" />
      </svg>
      <span className="mono-tag font-bold text-[var(--red)]">roomwave</span>
    </div>
  );
}
