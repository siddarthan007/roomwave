import type { ActivityType } from "@roomwave/shared";

// ---------------------------------------------------------------------------
// Run-of-show: an ordered, host-local queue of rounds.
//
// Stored in localStorage per room so the run survives a page refresh without
// needing server persistence — the host's phone is the single source of truth
// for what plays next. Entries hold enough to launch a round with one tap;
// full mode configs are rebuilt by the existing HostPage editors when the
// host taps "load into composer".
// ---------------------------------------------------------------------------

export interface PlaylistEntry {
  id: string;
  type: ActivityType;
  /** Short label shown in the queue; defaults to the prompt. */
  title: string;
  prompt: string;
  /** Serialized create-activity payload minus type; spread back on launch. */
  configJson: string;
}

export function loadPlaylist(roomId: string): PlaylistEntry[] {
  try {
    const raw = localStorage.getItem(`roomwave:playlist:${roomId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PlaylistEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as PlaylistEntry).id === "string" &&
        typeof (entry as PlaylistEntry).type === "string" &&
        typeof (entry as PlaylistEntry).prompt === "string" &&
        typeof (entry as PlaylistEntry).configJson === "string",
    );
  } catch {
    return [];
  }
}

export function savePlaylist(roomId: string, entries: PlaylistEntry[]): void {
  try {
    localStorage.setItem(`roomwave:playlist:${roomId}`, JSON.stringify(entries));
  } catch {
    // Storage unavailable: the queue lives only for this session.
  }
}

export function makePlaylistEntry(
  type: ActivityType,
  prompt: string,
  config: Record<string, unknown>,
): PlaylistEntry {
  const { type: _type, prompt: _prompt, ...rest } = config;
  return {
    id: crypto.randomUUID(),
    type,
    title: prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt,
    prompt,
    configJson: JSON.stringify(rest),
  };
}
