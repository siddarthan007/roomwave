import type { RoomSoundMode } from "@roomwave/shared";

import { useEffect, useState } from "react";

import { bindRoomSound, isSoundEnabled, setSoundEnabled } from "../lib/sound";

export function SoundToggle({ mode }: { mode: RoomSoundMode }) {
  const [enabled, setEnabled] = useState(isSoundEnabled);
  useEffect(() => {
    bindRoomSound(mode);
  }, [mode]);
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
      className="mono-tag min-h-10 border-2 border-[var(--ink)] px-3
        transition-transform active:translate-x-[2px] active:translate-y-[2px]
        active:shadow-none block-shadow-sm"
    >
      sound {enabled ? "on" : "off"}
    </button>
  );
}
