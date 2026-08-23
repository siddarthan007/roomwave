import { Database } from "bun:sqlite";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/bun-sqlite";

const defaultDatabasePath = fileURLToPath(
  new URL("../../data/roomwave.sqlite", import.meta.url),
);

// Production can point this at a mounted persistent volume. Relative paths
// deliberately resolve from the process working directory so container and
// service configuration stay predictable.
const databasePath = resolve(
  Bun.env.ROOMWAVE_DB_PATH ?? defaultDatabasePath,
);

mkdirSync(dirname(databasePath), {
  recursive: true,
});

const sqlite = new Database(databasePath);

const DEFAULT_ROOM_SETTINGS = JSON.stringify({
  theme: "paper",
  lobbyMessage: "Find your square. The next round starts here.",
  allowReactions: true,
  allowLateJoin: true,
  showPresence: true,
  showResponseCount: true,
  participantNames: "chosen",
  maxParticipants: 500,
  soundMode: "soft",
}).replaceAll("'", "''");

const roomColumns = sqlite
  .query("PRAGMA table_info(rooms)")
  .all() as Array<{ name: string }>;
if (roomColumns.length > 0 && !roomColumns.some(({ name }) => name === "settings")) {
  sqlite.exec(
    `ALTER TABLE rooms ADD COLUMN settings TEXT NOT NULL DEFAULT '${DEFAULT_ROOM_SETTINGS}'`,
  );
}

const activityColumns = sqlite
  .query("PRAGMA table_info(activities)")
  .all() as Array<{ name: string }>;
if (
  activityColumns.length > 0 &&
  !activityColumns.some(({ name }) => name === "response_epoch")
) {
  sqlite.exec(
    "ALTER TABLE activities ADD COLUMN response_epoch INTEGER NOT NULL DEFAULT 0",
  );
}
if (
  activityColumns.length > 0 &&
  !activityColumns.some(({ name }) => name === "deadline_at")
) {
  sqlite.exec("ALTER TABLE activities ADD COLUMN deadline_at TEXT");
}

const participantColumns = sqlite
  .query("PRAGMA table_info(participants)")
  .all() as Array<{ name: string }>;
if (
  participantColumns.length > 0 &&
  !participantColumns.some(({ name }) => name === "display_name")
) {
  sqlite.exec("ALTER TABLE participants ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Guest'");
}
if (
  participantColumns.length > 0 &&
  !participantColumns.some(({ name }) => name === "avatar_seed")
) {
  sqlite.exec("ALTER TABLE participants ADD COLUMN avatar_seed TEXT NOT NULL DEFAULT 'roomwave'");
}

sqlite.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  -- Early scaffolds enforced one row per participant for every mode. That
  -- made append-only modes (Word Bloom and Crowd Meter) fail on a second
  -- submission. Single-answer uniqueness now lives in the synchronous
  -- application command, while append modes keep individual events.
  DROP INDEX IF EXISTS response_activity_participant_unique;
  CREATE INDEX IF NOT EXISTS responses_activity_index
    ON responses(activity_id);
  CREATE INDEX IF NOT EXISTS responses_activity_updated_index
    ON responses(activity_id, updated_at);
`);

export const db = drizzle({
  client: sqlite,
});
