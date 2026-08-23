import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const databaseModuleUrl = new URL("./index.ts", import.meta.url).href;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDatabase(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return join(directory, "roomwave.sqlite");
}

function bootstrap(databasePath: string) {
  return Bun.spawnSync({
    cmd: [
      process.execPath,
      "-e",
      `await import(${JSON.stringify(databaseModuleUrl)});`,
    ],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ROOMWAVE_DB_PATH: databasePath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function diagnostic(result: ReturnType<typeof bootstrap>): string {
  return new TextDecoder().decode(result.stderr);
}

function names(
  database: Database,
  type: "table" | "index",
): string[] {
  return (
    database
      .query("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
      .all(type) as Array<{ name: string }>
  ).map(({ name }) => name);
}

describe("database startup", () => {
  test("a fresh Docker-style volume migrates before compatibility indexes", () => {
    const databasePath = temporaryDatabase("roomwave-fresh-");

    const first = bootstrap(databasePath);
    expect(first.exitCode, diagnostic(first)).toBe(0);
    const second = bootstrap(databasePath);
    expect(second.exitCode, diagnostic(second)).toBe(0);

    const database = new Database(databasePath, { readonly: true });
    expect(names(database, "table")).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "activities",
        "participants",
        "responses",
        "rooms",
      ]),
    );
    expect(
      database
        .query("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 2 });
    expect(names(database, "index")).toEqual(
      expect.arrayContaining([
        "responses_activity_index",
        "responses_activity_updated_index",
      ]),
    );
    database.close();
  });

  test("a complete pre-migration schema is repaired and baselined without data loss", () => {
    const databasePath = temporaryDatabase("roomwave-legacy-");
    const legacy = new Database(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE rooms (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        title TEXT NOT NULL,
        host_token_hash TEXT NOT NULL,
        status TEXT DEFAULT 'lobby' NOT NULL,
        active_activity_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE activities (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        state TEXT DEFAULT 'draft' NOT NULL,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
      CREATE TABLE participants (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
      CREATE TABLE responses (
        id TEXT PRIMARY KEY NOT NULL,
        activity_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX response_activity_participant_unique
        ON responses(activity_id, participant_id);
      INSERT INTO rooms (
        id, code, title, host_token_hash, status, created_at
      ) VALUES (
        'legacy-room', 'LEGACY', 'Preserve me', 'hash', 'lobby',
        '2026-08-23T00:00:00.000Z'
      );
    `);
    legacy.close();

    const first = bootstrap(databasePath);
    expect(first.exitCode, diagnostic(first)).toBe(0);
    const second = bootstrap(databasePath);
    expect(second.exitCode, diagnostic(second)).toBe(0);

    const database = new Database(databasePath, { readonly: true });
    const room = database
      .query("SELECT title, settings FROM rooms WHERE id = 'legacy-room'")
      .get() as { title: string; settings: string };
    expect(room.title).toBe("Preserve me");
    expect(JSON.parse(room.settings)).toEqual(
      expect.objectContaining({ theme: "paper", maxParticipants: 500 }),
    );
    expect(
      database
        .query("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 1 });
    expect(names(database, "index")).not.toContain(
      "response_activity_participant_unique",
    );
    expect(names(database, "index")).toEqual(
      expect.arrayContaining([
        "responses_activity_index",
        "responses_activity_updated_index",
      ]),
    );
    const activityColumns = namesForColumns(database, "activities");
    const participantColumns = namesForColumns(database, "participants");
    expect(activityColumns).toEqual(
      expect.arrayContaining(["response_epoch", "deadline_at"]),
    );
    expect(participantColumns).toEqual(
      expect.arrayContaining(["display_name", "avatar_seed"]),
    );
    database.close();
  });

  test("a partial application schema fails closed with a recovery message", () => {
    const databasePath = temporaryDatabase("roomwave-partial-");
    const partial = new Database(databasePath);
    partial.exec("CREATE TABLE rooms (id TEXT PRIMARY KEY NOT NULL)");
    partial.close();

    const result = bootstrap(databasePath);
    expect(result.exitCode).not.toBe(0);
    expect(diagnostic(result)).toContain("partial Roomwave schema (rooms)");
    expect(diagnostic(result)).toContain("Restore a valid backup");
  });
});

function namesForColumns(database: Database, table: string): string[] {
  return (
    database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map(({ name }) => name);
}
