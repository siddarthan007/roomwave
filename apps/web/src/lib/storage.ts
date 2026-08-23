export interface ParticipantSession {
  participantId: string;
  token: string;
  displayName: string;
  avatarSeed: string;
}

export function saveHostToken(
  roomId: string,
  token: string,
) {
  localStorage.setItem(
    `roomwave:host:${roomId}`,
    token,
  );
}

export function getHostToken(
  roomId: string,
) {
  return localStorage.getItem(
    `roomwave:host:${roomId}`,
  );
}

export function saveParticipantSession(
  roomId: string,
  session: ParticipantSession,
  roomCode?: string,
) {
  localStorage.setItem(
    `roomwave:participant:${roomId}`,

    JSON.stringify(session),
  );
  if (roomCode) {
    localStorage.setItem(
      `roomwave:join:${roomCode.trim().toUpperCase()}`,
      roomId,
    );
  }
}

export function getParticipantSession(
  roomId: string,
): ParticipantSession | null {
  const raw =
    localStorage.getItem(
      `roomwave:participant:${roomId}`,
    );

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
  const roomId = localStorage.getItem(
    `roomwave:join:${roomCode.trim().toUpperCase()}`,
  );
  if (!roomId) return null;
  const session = getParticipantSession(roomId);
  return session ? { roomId, session } : null;
}
