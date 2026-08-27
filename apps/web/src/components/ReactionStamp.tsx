import type { ReactionKind } from "@roomwave/shared";

import { REACTION_FILES } from "../lib/reactions";

export function ReactionStamp({
  kind,
  size = 28,
}: {
  kind: ReactionKind;
  size?: number;
}) {
  return (
    <img
      src={`/emoji/${REACTION_FILES[kind]}`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="pointer-events-none select-none"
    />
  );
}
