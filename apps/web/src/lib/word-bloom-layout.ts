export type BloomTerm = {
  text: string;
  count: number;
};

export type BloomAnchor = {
  x: number;
  y: number;
  rotate: number;
};

export type PlacedBloomWord = BloomTerm & {
  x: number;
  y: number;
  rotate: number;
  fontSize: number;
  width: number;
  height: number;
  color: string;
};

export type BloomLayoutInput = {
  terms: readonly BloomTerm[];
  width: number;
  height: number;
  previous?: ReadonlyMap<string, BloomAnchor>;
  reduceMotion?: boolean;
  measure?: (text: string, fontSize: number) => { width: number; height: number };
};

/** Ink-first palette. Yellow is skipped: it fails on the white field. */
export const BLOOM_COLORS = [
  "var(--ink)",
  "var(--red)",
  "var(--blue)",
  "var(--orange)",
  "var(--green)",
  "var(--violet)",
  "var(--pink)",
] as const;

const SPIRAL_STEPS = 420;
const COLLISION_PAD = 8;

export function hashBloomTerm(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Classic cloud mix: heavy terms stay readable and horizontal; lighter
 * terms stamp in at 0 / ±90 with a few paper-craft tilts. Deterministic
 * per string so a word does not spin when its count changes.
 */
export function bloomOrientation(
  text: string,
  weight: number,
  reduceMotion: boolean,
): number {
  if (reduceMotion || weight >= 0.62) return 0;
  const slot = hashBloomTerm(text) % 12;
  if (slot < 6) return 0;
  if (slot < 8) return 90;
  if (slot < 10) return -90;
  return slot === 10 ? -14 : 14;
}

export function approximateBloomMeasure(text: string, fontSize: number) {
  const glyphs = Math.max(text.length, 1);
  return {
    width: Math.max(fontSize * 0.64 * glyphs, fontSize * 1.05),
    height: fontSize * 0.86,
  };
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Glyph box using the live Archivo face when a document exists. */
export function browserBloomMeasure(text: string, fontSize: number) {
  if (typeof document === "undefined") {
    return approximateBloomMeasure(text, fontSize);
  }
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return approximateBloomMeasure(text, fontSize);
  ctx.font = `800 ${fontSize}px Archivo, "Arial Narrow", sans-serif`;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.14;
  return {
    width: Math.max(metrics.width, fontSize * 0.5),
    height: Math.max(ascent + descent, fontSize * 0.8),
  };
}

function rotatedBox(
  glyphWidth: number,
  glyphHeight: number,
  rotate: number,
): { width: number; height: number } {
  const radians = (rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: glyphWidth * cos + glyphHeight * sin,
    height: glyphWidth * sin + glyphHeight * cos,
  };
}

function overlaps(
  first: Pick<PlacedBloomWord, "x" | "y" | "width" | "height">,
  second: Pick<PlacedBloomWord, "x" | "y" | "width" | "height">,
  pad: number,
): boolean {
  return !(
    first.x + first.width / 2 + pad < second.x - second.width / 2 ||
    first.x - first.width / 2 - pad > second.x + second.width / 2 ||
    first.y + first.height / 2 + pad < second.y - second.height / 2 ||
    first.y - first.height / 2 - pad > second.y + second.height / 2
  );
}

function inBounds(
  word: Pick<PlacedBloomWord, "x" | "y" | "width" | "height">,
  halfW: number,
  halfH: number,
): boolean {
  return (
    Math.abs(word.x) + word.width / 2 <= halfW &&
    Math.abs(word.y) + word.height / 2 <= halfH
  );
}

function bloomColor(text: string, lead: boolean): string {
  if (lead) return "var(--red)";
  return BLOOM_COLORS[hashBloomTerm(text) % BLOOM_COLORS.length];
}

function fontSizeFor(
  text: string,
  weight: number,
  width: number,
  height: number,
): number {
  const maxSize = Math.min(
    height * 0.3,
    width * 0.46 / Math.max(text.length * 0.64, 1),
    92,
  );
  const minSize = Math.max(13, Math.min(width, height) * 0.042);
  const t = Math.sqrt(Math.max(0, Math.min(1, weight)));
  return minSize + t * (maxSize - minSize);
}

/**
 * Wordle-style elliptical spiral from the center. Existing terms keep
 * their last pose when it still fits after a size change.
 */
export function layoutWordBloom(input: BloomLayoutInput): PlacedBloomWord[] {
  const { terms, width, height, previous, reduceMotion } = input;
  if (terms.length === 0 || width < 40 || height < 40) return [];

  const measure = input.measure ?? approximateBloomMeasure;
  const maxCount = Math.max(1, ...terms.map((term) => term.count));
  const halfW = width / 2 - 10;
  const halfH = height / 2 - 10;
  const aspect = width / Math.max(height, 1);
  const placed: PlacedBloomWord[] = [];

  for (const [index, term] of terms.entries()) {
    const weight = term.count / maxCount;
    const lead = index === 0;
    const rotate = lead
      ? 0
      : previous?.get(term.text)?.rotate ??
        bloomOrientation(term.text, weight, Boolean(reduceMotion));
    const fontSize = fontSizeFor(term.text, weight, width, height);
    const glyphs = measure(term.text, fontSize);
    const box = rotatedBox(glyphs.width, glyphs.height, rotate);
    const candidate: PlacedBloomWord = {
      ...term,
      x: 0,
      y: 0,
      rotate,
      fontSize,
      width: box.width,
      height: box.height,
      color: bloomColor(term.text, lead),
    };

    const fits = (word: PlacedBloomWord) =>
      inBounds(word, halfW, halfH) &&
      placed.every((other) => !overlaps(word, other, COLLISION_PAD));

    const remembered = previous?.get(term.text);
    if (lead) {
      candidate.x = 0;
      candidate.y = 0;
      if (!fits(candidate)) {
        // Shrink the chorus word until it sits in the plate.
        for (let step = 0; step < 8 && !fits(candidate); step += 1) {
          candidate.fontSize *= 0.88;
          const next = measure(term.text, candidate.fontSize);
          const nextBox = rotatedBox(next.width, next.height, 0);
          candidate.width = nextBox.width;
          candidate.height = nextBox.height;
        }
      }
      placed.push(candidate);
      continue;
    }

    if (remembered) {
      candidate.x = remembered.x;
      candidate.y = remembered.y;
      if (fits(candidate)) {
        placed.push(candidate);
        continue;
      }
    }

    const originX = remembered?.x ?? 0;
    const originY = remembered?.y ?? 0;
    const start = (hashBloomTerm(term.text) % 628) / 100;
    const seat = () => {
      for (let step = 0; step < SPIRAL_STEPS; step += 1) {
        const angle = start + step * 0.38;
        const radius = 6 + step * 3.4;
        candidate.x = originX + Math.cos(angle) * radius * aspect;
        candidate.y = originY + Math.sin(angle) * radius;
        if (fits(candidate)) return true;
      }
      return false;
    };
    let seated = seat();
    for (let shrink = 0; shrink < 6 && !seated; shrink += 1) {
      candidate.fontSize *= 0.8;
      const next = measure(term.text, candidate.fontSize);
      const nextBox = rotatedBox(next.width, next.height, rotate);
      candidate.width = nextBox.width;
      candidate.height = nextBox.height;
      seated = seat();
    }
    if (seated) placed.push(candidate);
  }

  return placed;
}

export function bloomAnchors(
  words: readonly PlacedBloomWord[],
): Map<string, BloomAnchor> {
  return new Map(
    words.map((word) => [word.text, { x: word.x, y: word.y, rotate: word.rotate }]),
  );
}
