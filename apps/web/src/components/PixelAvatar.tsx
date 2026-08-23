const PALETTES = [
  ["#17150f", "#f2b830", "#e63b2e", "#f4efe3"],
  ["#17150f", "#1d53c4", "#f4efe3", "#e85a8a"],
  ["#17150f", "#1d7a4f", "#e85a8a", "#f2b830"],
  ["#17150f", "#5b3ea6", "#ec7014", "#f4efe3"],
  ["#101828", "#38bdf8", "#fb7185", "#fef3c7"],
  ["#1f2937", "#a3e635", "#22c55e", "#fefce8"],
  ["#292524", "#fb923c", "#fde047", "#fdf2f8"],
  ["#172554", "#818cf8", "#c084fc", "#f5f3ff"],
] as const;

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Anonymous room identity. It is local, deterministic and never fingerprints a device. */
export function PixelAvatar({ seed, size = 44 }: { seed: string; size?: number }) {
  let noise = hashSeed(seed);
  const palette = PALETTES[noise % PALETTES.length];
  const cells: Array<{ x: number; y: number; color: string }> = [];
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      noise ^= noise << 13;
      noise ^= noise >>> 17;
      noise ^= noise << 5;
      if ((noise >>> 0) % 5 === 0) continue;
      const color = palette[(noise >>> 0) % palette.length];
      cells.push({ x, y, color });
      if (x !== 3) cells.push({ x: 6 - x, y, color });
    }
  }
  return (
    <svg
      viewBox="0 0 7 7"
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
