import type { ActivityConfig, ActivityState } from "./types";

/**
 * A reveal is a product rule, not a generic lifecycle decoration.
 * Prediction always has a truth moment. Other modes reveal only when their
 * result distribution was collected blind.
 */
export function activityRequiresReveal(config: ActivityConfig): boolean {
  return config.type === "prediction" || config.resultsMode === "blind";
}

/** True when a closed round has already reached its audience-facing result. */
export function activityHasFinalResult(
  config: ActivityConfig,
  state: ActivityState,
): boolean {
  return state === "revealed" ||
    (state === "locked" && !activityRequiresReveal(config));
}
