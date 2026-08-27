import type { ReactNode } from "react";

interface QuadrantLabels {
  xLowLabel: string;
  xHighLabel: string;
  yLowLabel: string;
  yHighLabel: string;
}

function AxisMark({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-center text-[11px] font-black uppercase leading-tight tracking-wide text-balance sm:text-xs ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

/**
 * Four-edge axis frame for Quadrant Drop. Cardinal labels sit outside the
 * plot; each cell also names both axes so a projector audience can read
 * the matrix without guessing which end is which.
 */
export function QuadrantPlotFrame({
  labels,
  children,
  className = "",
}: {
  labels: QuadrantLabels;
  children: ReactNode;
  className?: string;
}) {
  const { xLowLabel, xHighLabel, yLowLabel, yHighLabel } = labels;
  return (
    <div
      className={`grid grid-cols-[2.4rem_minmax(0,1fr)_2.4rem] grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-x-1 gap-y-2 sm:grid-cols-[2.85rem_minmax(0,1fr)_2.85rem] ${className}`}
    >
      <span aria-hidden="true" />
      <AxisMark>{yHighLabel}</AxisMark>
      <span aria-hidden="true" />

      <AxisMark className="max-h-full [writing-mode:vertical-rl] rotate-180">
        {xLowLabel}
      </AxisMark>

      <div className="relative min-h-0 min-w-0">
        {children}
        <span className="pointer-events-none absolute left-2 top-2 max-w-[46%] mono-tag bg-[var(--paper)] px-1.5 py-0.5 leading-tight">
          {yHighLabel} · {xLowLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 max-w-[46%] text-right mono-tag bg-[var(--paper)] px-1.5 py-0.5 leading-tight">
          {yHighLabel} · {xHighLabel}
        </span>
        <span className="pointer-events-none absolute bottom-2 left-2 max-w-[46%] mono-tag bg-[var(--paper)] px-1.5 py-0.5 leading-tight">
          {yLowLabel} · {xLowLabel}
        </span>
        <span className="pointer-events-none absolute bottom-2 right-2 max-w-[46%] text-right mono-tag bg-[var(--paper)] px-1.5 py-0.5 leading-tight">
          {yLowLabel} · {xHighLabel}
        </span>
      </div>

      <AxisMark className="max-h-full [writing-mode:vertical-rl]">
        {xHighLabel}
      </AxisMark>

      <span aria-hidden="true" />
      <AxisMark>{yLowLabel}</AxisMark>
      <span aria-hidden="true" />
    </div>
  );
}
