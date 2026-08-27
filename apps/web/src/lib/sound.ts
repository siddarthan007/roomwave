import type { RoomSoundMode } from "@roomwave/shared";

type SoundEvent = "ready" | "vote" | "lock" | "reveal" | "join" | "react";

let context: AudioContext | null = null;
// Master gain keeps stacked bursts from clipping: every note routes through
// one node instead of N oscillators summing straight into the destination.
let masterGain: GainNode | null = null;
let boundMode: RoomSoundMode = "off";
const STORAGE_KEY = "roomwave:sound-enabled";
const memoryStore = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

export function bindRoomSound(mode: RoomSoundMode) {
  boundMode = mode;
}

export function isSoundEnabled() {
  return storageGet(STORAGE_KEY) === "true";
}

export function setSoundEnabled(enabled: boolean, mode: RoomSoundMode) {
  storageSet(STORAGE_KEY, String(enabled));
  bindRoomSound(mode);
  if (enabled) {
    context ??= new AudioContext();
    masterGain ??= context.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(context.destination);
    void context.resume();
    playRoomSound(mode, "ready");
  } else if (context) {
    void context.suspend();
  }
}

export function playBoundSound(event: SoundEvent) {
  playRoomSound(boundMode, event);
}

export function playRoomSound(mode: RoomSoundMode, event: SoundEvent) {
  if (mode === "off" || !isSoundEnabled()) return;
  context ??= new AudioContext();
  masterGain ??= context.createGain();
  if (masterGain.gain.value !== 0.9) {
    masterGain.gain.value = 0.9;
  }
  if (!masterGain.numberOfOutputs) {
    masterGain.connect(context.destination);
  }
  if (context.state !== "running") return;

  const patterns: Record<SoundEvent, number[]> = {
    ready: [440, 660],
    join: [330, 495],
    vote: [520],
    lock: [240, 180],
    reveal: [260, 390, 620],
    react: [880, 1180],
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
    oscillator.connect(gain).connect(masterGain!);
    oscillator.start(start);
    oscillator.stop(start + 0.11);
  });
}
