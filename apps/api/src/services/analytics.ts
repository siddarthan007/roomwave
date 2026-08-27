// ---------------------------------------------------------------------------
// Analytics are pure functions with unit tests and honest labels.
// ---------------------------------------------------------------------------

/**
 * Normalized Shannon entropy over counts, 0..1.
 * 1 = perfectly even spread (no consensus), lower = more consensus.
 */
export function normalizedEntropy(counts: number[]): number {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || counts.length <= 1) return 0;

  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(counts.length);
  if (maxEntropy === 0) return 0;
  return Math.min(1, Math.max(0, entropy / maxEntropy));
}

/** Median of unsorted numeric samples. Empty input -> null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Normalized population spread for spectrum data on 0..1000.
 * 1 is the mathematical maximum (an even split between both extremes).
 * 0 means every participant chose the same position, including a unanimous
 * position away from the midpoint. This avoids calling unanimous extremes
 * "polarized" merely because they are far from the centre.
 */
export function polarization(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.min(1, Math.sqrt(variance) / 500);
}

export function meanAbsoluteError(
  values: number[],
  truth: number,
): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce(
    (acc, value) => acc + Math.abs(value - truth),
    0,
  );
  return sum / values.length;
}

/**
 * Normalized Herfindahl concentration of a budget, 0..100.
 * 0 = chips split evenly, 100 = every chip on one option.
 */
export function budgetConcentration(counts: readonly number[]): number | null {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || counts.length <= 1) return null;
  let hhi = 0;
  for (const count of counts) {
    const share = count / total;
    hhi += share * share;
  }
  const floor = 1 / counts.length;
  const span = 1 - floor;
  if (span <= 0) return 100;
  return Math.round(((hhi - floor) / span) * 100);
}
