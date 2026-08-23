import { expect, test } from "bun:test";
import { join } from "node:path";

const REQUIRED_SURFACES = [
  "ink",
  "red",
  "blue",
  "yellow",
  "green",
  "pink",
  "orange",
  "violet",
] as const;

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function rgb(hex: string): [number, number, number] {
  const expanded = hex.length === 4
    ? `#${[...hex.slice(1)].map((digit) => digit.repeat(2)).join("")}`
    : hex;
  return [1, 3, 5].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function luminance(hex: string) {
  const channels = rgb(hex).map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

function resolveColor(value: string, palette: Record<string, string>): string {
  const reference = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  return reference ? resolveColor(palette[reference], palette) : value;
}

test("every named action surface has a WCAG AA foreground in every room theme", async () => {
  const css = await Bun.file(join(import.meta.dir, "../apps/web/src/index.css")).text();
  const root = declarations(css.match(/:root\s*{([^}]+)}/)?.[1] ?? "");
  const themes = ["paper", "signal", "midnight", "field"];

  for (const theme of themes) {
    const override = theme === "paper"
      ? {}
      : declarations(css.match(new RegExp(`\\[data-room-theme="${theme}"\\]\\s*{([^}]+)}`))?.[1] ?? "");
    const palette = { ...root, ...override };

    for (const surface of REQUIRED_SURFACES) {
      const background = resolveColor(palette[surface], palette);
      const foreground = resolveColor(palette[`on-${surface}`], palette);
      expect(contrast(background, foreground), `${theme} ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
