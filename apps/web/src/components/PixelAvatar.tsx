import { paintAvatarCells } from "../lib/avatar";

/** Anonymous room identity. Local, deterministic, never fingerprints a device. */
export function PixelAvatar({ seed, size = 44 }: { seed: string; size?: number }) {
  const cells = paintAvatarCells(seed);
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      role="img"
      aria-label="Your anonymous room character"
      className="shrink-0 border-2 border-[var(--ink)] p-1 block-shadow-sm"
      style={{ background: "#fff8e9" }}
      shapeRendering="crispEdges"
    >
      {cells.map((cell, index) => (
        <rect key={`${cell.x}:${cell.y}:${index}`} {...cell} width="1" height="1" />
      ))}
    </svg>
  );
}
