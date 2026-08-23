import type { RoomSoundMode } from "@roomwave/shared";

type SoundEvent = "ready" | "vote" | "lock" | "reveal" | "join";

let context: AudioContext | null = null;
const STORAGE_KEY = "roomwave:sound-enabled";

export function isSoundEnabled() {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setSoundEnabled(enabled: boolean, mode: RoomSoundMode) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  if (enabled) {
    context ??= new AudioContext();
    void context.resume();
    playRoomSound(mode, "ready");
  } else if (context) {
    void context.suspend();
  }
}

export function playRoomSound(mode: RoomSoundMode, event: SoundEvent) {
  if (mode === "off" || !isSoundEnabled()) return;
  context ??= new AudioContext();
  if (context.state !== "running") return;

  const patterns: Record<SoundEvent, number[]> = {
    ready: [440, 660],
    join: [330, 495],
    vote: [520],
    lock: [240, 180],
    reveal: [260, 390, 620],
  };
  const notes = patterns[event];
  const now = context.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    oscillator.type = mode === "arcade" ? "square" : "sine";
    oscillator.frequency.value = frequency;
    const start = now + index * 0.075;
    const volume = mode === "arcade" ? 0.055 : 0.035;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095);
    oscillator.connect(gain).connect(context!.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.11);
  });
}
