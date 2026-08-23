import { Database } from "bun:sqlite";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

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

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);
const migrationConfig = { migrationsFolder };
const LEGACY_BASELINE_CREATED_AT = 1_787_488_370_484;
const APPLICATION_TABLES = [
  "rooms",
  "activities",
  "participants",
  "responses",
] as const;

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

function tableNames(): Set<string> {
  return new Set(
    (
      sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map(({ name }) => name),
  );
}

function columns(table: string): Set<string> {
  return new Set(
    (
      sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map(({ name }) => name),
  );
}

function repairLegacySchema(): void {
  const roomColumns = columns("rooms");
  if (!roomColumns.has("settings")) {
    sqlite.exec(
      `ALTER TABLE rooms ADD COLUMN settings TEXT NOT NULL DEFAULT '${DEFAULT_ROOM_SETTINGS}'`,
    );
  }

  const activityColumns = columns("activities");
  if (!activityColumns.has("response_epoch")) {
    sqlite.exec(
      "ALTER TABLE activities ADD COLUMN response_epoch INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!activityColumns.has("deadline_at")) {
    sqlite.exec("ALTER TABLE activities ADD COLUMN deadline_at TEXT");
  }

  const participantColumns = columns("participants");
  if (!participantColumns.has("display_name")) {
    sqlite.exec(
      "ALTER TABLE participants ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Guest'",
    );
  }
  if (!participantColumns.has("avatar_seed")) {
    sqlite.exec(
      "ALTER TABLE participants ADD COLUMN avatar_seed TEXT NOT NULL DEFAULT 'roomwave'",
    );
  }
}

function repairResponseIndexes(): void {
  sqlite.exec(`
    -- Early scaffolds enforced one row per participant for every mode. That
    -- made append-only modes fail on a second submission. Single-answer
    -- uniqueness now lives in the synchronous application command.
    DROP INDEX IF EXISTS response_activity_participant_unique;
    CREATE INDEX IF NOT EXISTS responses_activity_index
      ON responses(activity_id);
    CREATE INDEX IF NOT EXISTS responses_activity_updated_index
      ON responses(activity_id, updated_at);
  `);
}

function baselineLegacyMigrations(): void {
  const baseline = readMigrationFiles(migrationConfig).find(
    ({ folderMillis }) => folderMillis === LEGACY_BASELINE_CREATED_AT,
  );
  if (!baseline) {
    throw new Error(
      "Legacy migration baseline 0001 is missing from the application image.",
    );
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
  sqlite
    .query(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    )
    .run(baseline.hash, baseline.folderMillis);
}

sqlite.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
`);

const database = drizzle({
  client: sqlite,
});

const existingTables = tableNames();
const existingApplicationTables = APPLICATION_TABLES.filter((table) =>
  existingTables.has(table),
);
if (
  existingApplicationTables.length > 0 &&
  existingApplicationTables.length !== APPLICATION_TABLES.length
) {
  throw new Error(
    `Database has a partial Roomwave schema (${existingApplicationTables.join(", ")}). Restore a valid backup before starting the API.`,
  );
}

// Releases before the migration runner created the four application tables
// directly. Bring that complete legacy schema to migration 0001 and record the
// baseline without replaying CREATE TABLE statements over live data.
if (
  existingApplicationTables.length === APPLICATION_TABLES.length &&
  !existingTables.has("__drizzle_migrations")
) {
  sqlite.transaction(() => {
    repairLegacySchema();
    repairResponseIndexes();
    baselineLegacyMigrations();
  })();
}

// Fresh volumes apply every checked-in migration here. Existing tracked
// databases apply only pending migrations.
migrate(database, migrationConfig);

// Retain the compatibility repair for databases created by early scaffolds or
// restored from backups that predate migration tracking.
sqlite.transaction(() => {
  repairLegacySchema();
  repairResponseIndexes();
})();

export const db = database;
