import { eq } from "drizzle-orm";

import { db } from "../db";
import { rooms } from "../db/schema";

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(
  length = 6,
): string {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(length),
    );

  let result = "";

  for (const byte of bytes) {
    result +=
      ALPHABET[
        byte % ALPHABET.length
      ];
  }

  return result;
}

export function createUniqueRoomCode(): string {
  for (
    let attempt = 0;
    attempt < 20;
    attempt++
  ) {
    const code = randomCode();

    const existing = db
      .select({
        id: rooms.id,
      })
      .from(rooms)
      .where(eq(rooms.code, code))
      .get();

    if (!existing) {
      return code;
    }
  }

  throw new Error(
    "Could not generate room code",
  );
}