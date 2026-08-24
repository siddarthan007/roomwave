export interface ParticipantSession {
  participantId: string;
  token: string;
  displayName: string;
  avatarSeed: string;
}

// localStorage throws in privacy modes / when storage is disabled
// (Safari lockdown, embedded webviews). Values then fall back to an
// in-memory map for the tab lifetime instead of crashing the page.
const memoryStore = new Map<string, string>();

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}
export function saveHostToken(
  roomId: string,
  token: string,
) {
  safeSet(`roomwave:host:${roomId}`, token);
}

export function getHostToken(
  roomId: string,
) {
  return safeGet(`roomwave:host:${roomId}`);
}

export function saveParticipantSession(
  roomId: string,
  session: ParticipantSession,
  roomCode?: string,
) {
  safeSet(`roomwave:participant:${roomId}`, JSON.stringify(session));
  if (roomCode) {
    safeSet(`roomwave:join:${roomCode.trim().toUpperCase()}`, roomId);
  }
}

export function getParticipantSession(
  roomId: string,
): ParticipantSession | null {
  const raw = safeGet(`roomwave:participant:${roomId}`);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ParticipantSession>;
    if (!parsed.participantId || !parsed.token) return null;
    return {
      participantId: parsed.participantId,
      token: parsed.token,
      displayName: parsed.displayName ?? "Guest",
      avatarSeed: parsed.avatarSeed ?? parsed.participantId,
    };
  } catch {
    return null;
  }
}

export function getParticipantSessionForCode(
  roomCode: string,
): { roomId: string; session: ParticipantSession } | null {
  const roomId = safeGet(`roomwave:join:${roomCode.trim().toUpperCase()}`);
  if (!roomId) return null;
  const session = getParticipantSession(roomId);
  return session ? { roomId, session } : null;
}
