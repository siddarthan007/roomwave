const PALETTES = [
  ["#17150f", "#f2b830", "#e63b2e", "#f4efe3"],
  ["#17150f", "#1d53c4", "#f4efe3", "#e85a8a"],
  ["#17150f", "#1d7a4f", "#e85a8a", "#f2b830"],
  ["#17150f", "#5b3ea6", "#ec7014", "#f4efe3"],
  ["#17150f", "#f2b830", "#1d53c4", "#fff4d6"],
  ["#17150f", "#e63b2e", "#f4efe3", "#1d7a4f"],
  ["#24120d", "#ec7014", "#f2b830", "#fff1df"],
  ["#172016", "#1d7a4f", "#e63b2e", "#edf3df"],
] as const;

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export interface AvatarCell {
  x: number;
  y: number;
  color: string;
}

/**
 * 8x8 print sprite, mirrored across the vertical axis so the character
 * always has a face. Column 3 always copies to column 4.
 */
export function paintAvatarCells(seed: string): AvatarCell[] {
  let noise = hashSeed(seed);
  const palette = PALETTES[noise % PALETTES.length];
  const cells: AvatarCell[] = [];
  const ink = palette[0];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      noise ^= noise << 13;
      noise ^= noise >>> 17;
      noise ^= noise << 5;
      const face = y === 3 || y === 5;
      const skip = !face && (noise >>> 0) % 6 === 0;
      if (skip) continue;
      const isEye = y === 3 && x === 1;
      const isMouth = y === 5 && (x === 2 || x === 3);
      const color = isEye || isMouth ? ink : palette[(noise >>> 0) % palette.length];
      cells.push({ x, y, color });
      cells.push({ x: 7 - x, y, color });
    }
  }
  return cells;
}
