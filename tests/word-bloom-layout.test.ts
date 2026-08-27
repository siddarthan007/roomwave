import { expect, test } from "bun:test";

import {
  approximateBloomMeasure,
  bloomAnchors,
  bloomOrientation,
  layoutWordBloom,
} from "../apps/web/src/lib/word-bloom-layout";

test("an empty or tiny field yields no words", () => {
  expect(layoutWordBloom({ terms: [], width: 800, height: 400 })).toEqual([]);
  expect(
    layoutWordBloom({
      terms: [{ text: "hello", count: 3 }],
      width: 10,
      height: 10,
    }),
  ).toEqual([]);
});

test("the lead term sits in the center, horizontal", () => {
  const [lead] = layoutWordBloom({
    terms: [
      { text: "together", count: 12 },
      { text: "now", count: 2 },
    ],
    width: 800,
    height: 400,
  });
  expect(lead.text).toBe("together");
  expect(lead.x).toBe(0);
  expect(lead.y).toBe(0);
  expect(lead.rotate).toBe(0);
  expect(lead.color).toBe("var(--red)");
});

test("placed terms keep a collision gap", () => {
  const placed = layoutWordBloom({
    terms: [
      { text: "chorus", count: 9 },
      { text: "pulse", count: 4 },
      { text: "room", count: 3 },
      { text: "live", count: 2 },
      { text: "field", count: 1 },
    ],
    width: 900,
    height: 420,
  });
  expect(placed.length).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < placed.length; index += 1) {
    for (let other = index + 1; other < placed.length; other += 1) {
      const first = placed[index];
      const second = placed[other];
      const gapX =
        Math.abs(first.x - second.x) - (first.width + second.width) / 2;
      const gapY =
        Math.abs(first.y - second.y) - (first.height + second.height) / 2;
      const separated = gapX >= 7 || gapY >= 7;
      expect(separated).toBe(true);
    }
  }
});

test("a second pass keeps poses when weights are unchanged", () => {
  const terms = [
    { text: "build", count: 6 },
    { text: "together", count: 3 },
    { text: "now", count: 1 },
  ];
  const first = layoutWordBloom({ terms, width: 800, height: 380 });
  const second = layoutWordBloom({
    terms,
    width: 800,
    height: 380,
    previous: bloomAnchors(first),
  });
  expect(second.map((word) => [word.text, word.x, word.y, word.rotate])).toEqual(
    first.map((word) => [word.text, word.x, word.y, word.rotate]),
  );
});

test("reduced motion and heavy terms stay horizontal", () => {
  expect(bloomOrientation("sideways-candidate", 0.2, true)).toBe(0);
  expect(bloomOrientation("anything", 1, false)).toBe(0);
});

test("lighter terms mix in vertical stamps", () => {
  const angles = new Set<number>();
  for (let index = 0; index < 80; index += 1) {
    angles.add(bloomOrientation(`term-${index}`, 0.18, false));
  }
  expect(angles.has(0)).toBe(true);
  expect(angles.has(90) || angles.has(-90)).toBe(true);
});

test("approximateBloomMeasure stays defined for tests and export clones", () => {
  const box = approximateBloomMeasure("hello", 20);
  expect(box.width).toBeGreaterThan(20);
  expect(box.height).toBeGreaterThan(10);
});
