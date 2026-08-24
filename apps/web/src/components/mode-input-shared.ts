import type { Activity, ActivityAggregate } from "@roomwave/shared";

import { useCallback, useEffect, useState } from "react";

import { submitResponse } from "../lib/api";

export interface CommonModeInputProps {
  activity: Activity;
  token: string;
  aggregate?: ActivityAggregate | null;
}

/**
 * Persists the participant's own submitted answer per (activity, token) so a
 * reload restores it instead of silently resetting to defaults. Cleared when
 * the host resets the round (new epoch = fresh answers).
 */
const STORE_KEY = "roomwave:answer:";

function storageKey(activityId: string): string {
  return `${STORE_KEY}${activityId}`;
}

function readStoredAnswer(activityId: string): unknown {
  try {
    const raw = localStorage.getItem(storageKey(activityId));
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeStoredAnswer(activityId: string, payload: unknown) {
  try {
    localStorage.setItem(storageKey(activityId), JSON.stringify(payload));
  } catch {
    // Storage unavailable: the answer simply won't survive a reload.
  }
}

export function useModeSubmit(activity: Activity, token: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const clearAnswer = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(activity.id));
    } catch {
      // ignore
    }
  }, [activity.id]);

  useEffect(() => clearAnswer, [clearAnswer]);

  async function run(payload: unknown) {
    setPending(true);
    setError("");
    try {
      await submitResponse(activity.id, token, payload);
      writeStoredAnswer(activity.id, payload);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function restore<T>(): T | null {
    return readStoredAnswer(activity.id) as T | null;
  }

  return { pending, error, run, restore, clearAnswer };
}
