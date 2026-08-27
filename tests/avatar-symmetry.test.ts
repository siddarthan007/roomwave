import { describe, expect, test } from "bun:test";

import { paintAvatarCells } from "../apps/web/src/lib/avatar";

describe("pixel avatar symmetry", () => {
  test("every painted cell has a matching mirror across the vertical axis", () => {
    for (const seed of ["bright_fox_01", "shuffle-me", "abc123"]) {
      const cells = paintAvatarCells(seed);
      const colors = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell.color]));
      expect(cells.length).toBeGreaterThan(8);
      for (const cell of cells) {
        expect(colors.get(`${7 - cell.x},${cell.y}`)).toBe(cell.color);
      }
      const columns = new Set(cells.map((cell) => cell.x));
      expect(columns.has(3)).toBe(true);
      expect(columns.has(4)).toBe(true);
    }
  });
});
