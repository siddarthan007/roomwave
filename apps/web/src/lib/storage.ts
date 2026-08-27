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

export interface HostRoomRecord {
  roomId: string;
  title: string;
  code: string;
  savedAt: string;
}

const HOST_ROOMS_KEY = "roomwave:host-rooms";

export function listHostRooms(): HostRoomRecord[] {
  const raw = safeGet(HOST_ROOMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is HostRoomRecord =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as HostRoomRecord).roomId === "string" &&
        typeof (entry as HostRoomRecord).title === "string" &&
        typeof (entry as HostRoomRecord).code === "string" &&
        Boolean(getHostToken((entry as HostRoomRecord).roomId)),
    );
  } catch {
    return [];
  }
}

export function rememberHostRoom(
  roomId: string,
  token: string,
  meta: { title: string; code: string },
) {
  saveHostToken(roomId, token);
  const next = [
    { roomId, title: meta.title, code: meta.code, savedAt: new Date().toISOString() },
    ...listHostRooms().filter((room) => room.roomId !== roomId),
  ].slice(0, 8);
  safeSet(HOST_ROOMS_KEY, JSON.stringify(next));
}

const LAST_JOIN_KEY = "roomwave:last-join-code";
const JOIN_DRAFT_KEY = "roomwave:join-draft";
const AVATAR_SEED = /^[A-Za-z0-9_-]{6,40}$/;

export function rememberLastJoinCode(code: string) {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return;
  safeSet(LAST_JOIN_KEY, trimmed);
}

export function getLastJoinCode(): string {
  return (safeGet(LAST_JOIN_KEY) ?? "").toUpperCase();
}

export interface JoinDraft {
  avatarSeed: string;
  displayName: string;
  nameTouched: boolean;
}

export function rememberJoinDraft(draft: JoinDraft) {
  safeSet(JOIN_DRAFT_KEY, JSON.stringify(draft));
}

export function getJoinDraft(): JoinDraft | null {
  const raw = safeGet(JOIN_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<JoinDraft>;
    if (typeof parsed.avatarSeed !== "string" || !AVATAR_SEED.test(parsed.avatarSeed)) {
      return null;
    }
    return {
      avatarSeed: parsed.avatarSeed,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      nameTouched: parsed.nameTouched === true,
    };
  } catch {
    return null;
  }
}

function answerKey(activityId: string) {
  return `roomwave:answer:${activityId}`;
}

export function saveActivityAnswer(activityId: string, payload: unknown) {
  safeSet(answerKey(activityId), JSON.stringify(payload));
}

export function loadActivityAnswer(activityId: string): unknown | null {
  const raw = safeGet(answerKey(activityId));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
