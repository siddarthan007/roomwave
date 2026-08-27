import { expect, test } from "bun:test";

import { apportionPercents } from "../packages/shared/src/math";

test("empty piles stay at zero", () => {
  expect(apportionPercents([0, 0], 1)).toEqual([0, 0]);
});

test("a 2/3 split keeps one decimal and still sums to 100", () => {
  expect(apportionPercents([2, 1], 1)).toEqual([66.7, 33.3]);
});

test("a three-way split of tenths sums to 100", () => {
  const shares = apportionPercents([1, 1, 1], 1);
  expect(Math.round(shares.reduce((sum, value) => sum + value, 0) * 10)).toBe(1000);
  expect(shares).toEqual([33.4, 33.3, 33.3]);
});

test("integer percents of four equal piles stay at 25", () => {
  expect(apportionPercents([1, 1, 1, 1])).toEqual([25, 25, 25, 25]);
});
