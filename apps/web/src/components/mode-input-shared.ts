import type { Activity, ActivityAggregate } from "@roomwave/shared";

import { useState } from "react";

import { submitResponse } from "../lib/api";
import { loadActivityAnswer, saveActivityAnswer } from "../lib/storage";
import { playBoundSound } from "../lib/sound";

export interface CommonModeInputProps {
  activity: Activity;
  token: string;
  aggregate?: ActivityAggregate | null;
}

/**
 * Persists the participant's own submitted answer per activity so a reload
 * restores it. A new activity id (host reset) uses a fresh key.
 */
export function useModeSubmit(activity: Activity, token: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(payload: unknown) {
    setPending(true);
    setError("");
    try {
      await submitResponse(activity.id, token, payload);
      saveActivityAnswer(activity.id, payload);
      playBoundSound("vote");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function restore<T>(): T | null {
    return loadActivityAnswer(activity.id) as T | null;
  }

  return { pending, error, run, restore };
}
