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

export async function isHostAuthorized(
  roomId: string,
  token: string,
): Promise<boolean> {
  const room = db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();

  if (!room) {
    return false;
  }

  const tokenHash =
    await hashToken(token);

  return (
    tokenHash ===
    room.hostTokenHash
  );
}

export async function findParticipantByToken(
  token: string,
) {
  const tokenHash =
    await hashToken(token);

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