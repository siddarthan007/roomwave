import type { ReactionKind } from "@roomwave/shared";

/**
 * Twemoji SVG stamps, vendored from jdecked/twemoji 15.1.0 (CC-BY 4.0).
 * Local files so a LAN room never waits on a CDN. These are functional
 * reaction glyphs, not decorative copy.
 */
export const REACTION_FILES: Record<ReactionKind, string> = {
  spark: "2728.svg",
  flame: "1f525.svg",
  clap: "1f44f.svg",
  wave: "1f44b.svg",
  bolt: "26a1.svg",
};

export const REACTION_COLORS: Record<ReactionKind, string> = {
  spark: "var(--yellow)",
  flame: "var(--red)",
  clap: "var(--blue)",
  wave: "var(--green)",
  bolt: "var(--violet)",
};

export const REACTION_KINDS: ReactionKind[] = [
  "spark",
  "flame",
  "clap",
  "wave",
  "bolt",
];

export const REACTION_DOCK = REACTION_KINDS.map((kind) => ({
  kind,
  file: REACTION_FILES[kind],
  color: REACTION_COLORS[kind],
}));

export function emptyReactionHeat(): Record<ReactionKind, number> {
  return { spark: 0, flame: 0, clap: 0, wave: 0, bolt: 0 };
}
