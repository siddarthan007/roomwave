import type { ActivityState } from "@roomwave/shared";

export const VALID_TRANSITIONS: Readonly<
  Record<ActivityState, readonly ActivityState[]>
> = {
  draft: ["live"],
  live: ["locked", "ended"],
  locked: ["revealed", "live", "ended"],
  revealed: ["ended"],
  ended: [],
};

export function canTransition(
  current: ActivityState,
  next: ActivityState,
): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}

export function canReset(current: ActivityState): boolean {
  return current === "live" || current === "locked" || current === "revealed";
}
