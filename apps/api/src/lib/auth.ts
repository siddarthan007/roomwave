import { eq } from "drizzle-orm";

import { db } from "../db";
import {
  participants,
  rooms,
} from "../db/schema";

import { hashToken } from "./tokens";

export function getBearerToken(
  authorization:
    | string
    | undefined,
): string | null {
  if (!authorization) {
    return null;
  }

  if (
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

export function isHostAuthorized(
  roomId: string,
  token: string,
): boolean {
  const room = db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();

  if (!room) {
    return false;
  }

  return timingSafeEqual(hashToken(token), room.hostTokenHash);
}

/**
 * Length-aware constant-time comparison. Both inputs are SHA-256 hex digests
 * in practice, so lengths always match; the guard just keeps the XOR loop
 * honest for malformed input without leaking match progress.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function findParticipantByToken(
  token: string,
) {
  const tokenHash = hashToken(token);

  return db
    .select()
    .from(participants)
    .where(
      eq(
        participants.tokenHash,
        tokenHash,
      ),
    )
    .get();
}
