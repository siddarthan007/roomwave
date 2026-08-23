import type {
  ActivityState,
  ActivityType,
} from "@roomwave/shared";

import {
  sqliteTable,
  index,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),

    code: text("code").notNull(),

    title: text("title").notNull(),

    hostTokenHash: text("host_token_hash").notNull(),

    status: text("status")
      .$type<"lobby" | "live" | "ended">()
      .notNull()
      .default("lobby"),

    activeActivityId: text("active_activity_id"),

    settings: text("settings", { mode: "json" })
      .$type<import("@roomwave/shared").RoomSettings>()
      .notNull()
      .$defaultFn(() => ({
        theme: "paper",
        lobbyMessage: "Find your square. The next round starts here.",
        allowReactions: true,
        allowLateJoin: true,
        showPresence: true,
        showResponseCount: true,
        participantNames: "chosen",
        maxParticipants: 500,
        soundMode: "soft",
      })),

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("rooms_code_unique").on(table.code),
  ],
);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),

  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, {
      onDelete: "cascade",
    }),

  type: text("type")
    .$type<ActivityType>()
    .notNull(),

  prompt: text("prompt").notNull(),

  state: text("state")
    .$type<ActivityState>()
    .notNull()
      .default("draft"),

  /** Incremented on reset so in-flight requests cannot cross round boundaries. */
  responseEpoch: integer("response_epoch").notNull().default(0),

  config: text("config", {
    mode: "json",
  })
    .$type<import("@roomwave/shared").ActivityConfig>()
    .notNull(),

  deadlineAt: text("deadline_at"),

  createdAt: text("created_at").notNull(),
});

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),

    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, {
        onDelete: "cascade",
      }),

    tokenHash: text("token_hash").notNull(),

    displayName: text("display_name").notNull().$defaultFn(() => "Guest"),

    avatarSeed: text("avatar_seed").notNull().$defaultFn(() => "roomwave"),

    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    uniqueIndex("participants_token_unique").on(
      table.tokenHash,
    ),
  ],
);

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),

    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, {
        onDelete: "cascade",
      }),

    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, {
        onDelete: "cascade",
      }),

    payload: text("payload", {
      mode: "json",
    })
      .$type<import("@roomwave/shared").ResponsePayload>()
      .notNull(),

    createdAt: text("created_at").notNull(),

    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("responses_activity_index").on(table.activityId),
    index("responses_activity_updated_index").on(
      table.activityId,
      table.updatedAt,
    ),
  ],
);
