import type { Activity, ActivityAggregate } from "@roomwave/shared";

import { useState } from "react";

import { submitResponse } from "../lib/api";

export interface CommonModeInputProps {
  activity: Activity;
  token: string;
  aggregate?: ActivityAggregate | null;
}

export function useModeSubmit(activity: Activity, token: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(payload: unknown) {
    setPending(true);
    setError("");
    try {
      await submitResponse(activity.id, token, payload);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run };
}
