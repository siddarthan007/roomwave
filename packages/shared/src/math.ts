/**
 * Largest-remainder percents so a set of shares always sums to 100.
 * `decimals` is the display precision (0 = integers, 1 = tenths).
 */
export function apportionPercents(
  counts: readonly number[],
  decimals = 0,
): number[] {
  const scale = 10 ** decimals;
  const target = 100 * scale;
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return counts.map(() => 0);

  const exact = counts.map((count) => (count / total) * target);
  const floors = exact.map((value) => Math.floor(value));
  let leftover = target - floors.reduce((sum, value) => sum + value, 0);
  const rank = exact
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const result = [...floors];
  for (let step = 0; leftover > 0 && step < rank.length; step += 1) {
    result[rank[step].index] += 1;
    leftover -= 1;
  }
  return result.map((value) => value / scale);
}
