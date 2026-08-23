import type { RoomSoundMode } from "@roomwave/shared";

import { useState } from "react";

import { isSoundEnabled, setSoundEnabled } from "../lib/sound";

export function SoundToggle({ mode }: { mode: RoomSoundMode }) {
  const [enabled, setEnabled] = useState(isSoundEnabled);
  if (mode === "off") return null;
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setSoundEnabled(next, mode);
      }}
      className="mono-tag min-h-10 border-2 border-[var(--ink)] bg-[var(--paper)] px-3 block-shadow-sm"
    >
      sound {enabled ? "on" : "off"}
    </button>
  );
}
