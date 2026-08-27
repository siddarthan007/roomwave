import { describe, expect, test } from "bun:test";

import {
  budgetConcentration,
  meanAbsoluteError,
  median,
  normalizedEntropy,
  polarization,
} from "./analytics";

describe("median", () => {
  test("empty input is null", () => {
    expect(median([])).toBeNull();
  });

  test("odd length", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test("even length averages the middle pair", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("normalizedEntropy", () => {
  test("no votes -> 0", () => {
    expect(normalizedEntropy([0, 0])).toBe(0);
  });

  test("all votes on one option -> 0 (full consensus)", () => {
    expect(normalizedEntropy([10, 0, 0])).toBe(0);
  });

  test("even spread among occupied bins is full disagreement, empty bins ignored", () => {
    expect(normalizedEntropy([1, 1, 0, 0])).toBe(1);
    const alphabet = Array.from({ length: 26 }, (_, index) => (index < 2 ? 5 : 0));
    expect(normalizedEntropy(alphabet)).toBe(1);
  });

  test("single option list -> 0", () => {
    expect(normalizedEntropy([7])).toBe(0);
  });
});

describe("polarization", () => {
  test("empty -> 0", () => {
    expect(polarization([])).toBe(0);
  });

  test("all at midpoint -> 0", () => {
    expect(polarization([500, 500])).toBe(0);
  });

  test("an even split at extremes -> 1", () => {
    expect(polarization([0, 1000])).toBe(1);
  });

  test("unanimous extremes are agreement, not polarization", () => {
    expect(polarization([0, 0, 0])).toBe(0);
    expect(polarization([1000, 1000])).toBe(0);
  });

  test("central cluster scores low", () => {
    expect(polarization([450, 500, 550])).toBeCloseTo(0.0816, 3);
  });
});

describe("meanAbsoluteError", () => {
  test("null on empty", () => {
    expect(meanAbsoluteError([], 10)).toBeNull();
  });

  test("mean of absolute deviations", () => {
    expect(meanAbsoluteError([8, 12], 10)).toBe(2);
  });
});

describe("budgetConcentration", () => {
  test("empty or single pile is null", () => {
    expect(budgetConcentration([])).toBeNull();
    expect(budgetConcentration([10])).toBeNull();
    expect(budgetConcentration([0, 0])).toBeNull();
  });

  test("even split is 0", () => {
    expect(budgetConcentration([5, 5])).toBe(0);
    expect(budgetConcentration([4, 4, 4])).toBe(0);
  });

  test("one pile takes everything is 100", () => {
    expect(budgetConcentration([10, 0])).toBe(100);
  });
});
