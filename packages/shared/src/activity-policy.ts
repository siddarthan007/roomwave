import type { ActivityConfig, ActivityState } from "./types";

/**
 * A reveal is a product rule, not a generic lifecycle decoration.
 * Prediction and Over/Under always have a truth moment. Other modes reveal
 * only when their result distribution was collected blind.
 */
export function activityRequiresReveal(config: ActivityConfig): boolean {
  return (
    config.type === "prediction" ||
    config.type === "over-under" ||
    config.resultsMode === "blind"
  );
}

/** Server-owned round clock, if this mode ships one. */
export function timedRoundSeconds(config: ActivityConfig): number | undefined {
  if (
    config.type === "signal-noise" ||
    config.type === "cipher-room" ||
    config.type === "shadow-council"
  ) {
    return config.timeLimitSeconds;
  }
  if (config.type === "over-under" && config.timeLimitSeconds > 0) {
    return config.timeLimitSeconds;
  }
  return undefined;
}

/** True when a closed round has already reached its audience-facing result. */
export function activityHasFinalResult(
  config: ActivityConfig,
  state: ActivityState,
): boolean {
  return state === "revealed" ||
    (state === "locked" && !activityRequiresReveal(config));
}
