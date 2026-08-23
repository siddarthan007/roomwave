import { afterEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import type { Activity, RoomState } from "@roomwave/shared";

import { app } from "../index";
import { db } from "../db";
import { activities, responses, rooms } from "../db/schema";

let cleanupRoomId = "";

afterEach(() => {
  if (cleanupRoomId) {
    db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  }
  cleanupRoomId = "";
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("room lifecycle integration", () => {
  test("simultaneous joins cannot take the same final seat", async () => {
    const created = await json<{
      room: { id: string; code: string };
    }>(
      await app.request("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "One seat room",
          settings: { maxParticipants: 2 },
        }),
      }),
    );
    cleanupRoomId = created.room.id;

    const join = (avatarSeed: string) =>
      app.request(`/api/rooms/${created.room.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarSeed }),
      });
    expect((await join("first_seat_seed")).status).toBe(200);
    const attempts = await Promise.all([
      join("last_seat_alpha"),
      join("last_seat_bravo"),
    ]);

    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
    const state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.participantCount).toBe(2);
  });

  test("create, join, blind vote, lock, reveal, reset, react, and end", async () => {
    const createdResponse = await app.request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Lifecycle room" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(createdResponse);
    cleanupRoomId = created.room.id;

    const firstJoin = await app.request(`/api/rooms/${created.room.code}/join`, {
      method: "POST",
    });
    const first = await json<{ token: string }>(firstJoin);
    const secondJoin = await app.request(`/api/rooms/${created.room.code}/join`, {
      method: "POST",
    });
    expect(secondJoin.status).toBe(200);

    const activityResponse = await app.request(
      `/api/rooms/${created.room.id}/activities`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${created.hostToken}`,
        },
        body: JSON.stringify({
          type: "pulse-choice",
          prompt: "Pick a side",
          options: ["North", "South"],
          resultsMode: "blind",
        }),
      },
    );
    expect(activityResponse.status).toBe(201);
    const activity = await json<Activity>(activityResponse);
    expect(activity.config.type).toBe("pulse-choice");
    if (activity.config.type !== "pulse-choice") return;

    const hostHeaders = { Authorization: `Bearer ${created.hostToken}` };
    const start = await app.request(`/api/activities/${activity.id}/start`, {
      method: "POST",
      headers: hostHeaders,
    });
    expect(start.status).toBe(200);

    const earlyReveal = await app.request(
      `/api/activities/${activity.id}/reveal`,
      { method: "POST", headers: hostHeaders },
    );
    expect(earlyReveal.status).toBe(409);

    const submit = await app.request(`/api/activities/${activity.id}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${first.token}`,
      },
      body: JSON.stringify({
        type: "pulse-choice",
        optionId: activity.config.options[0].id,
      }),
    });
    expect(submit.status).toBe(200);

    const hiddenState = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(hiddenState.participantCount).toBe(2);
    expect(hiddenState.responseCount).toBe(1);
    expect(hiddenState.aggregate).toBeNull();

    const hiddenResults = await app.request(
      `/api/activities/${activity.id}/results`,
    );
    expect(hiddenResults.status).toBe(409);

    expect(
      (
        await app.request(`/api/activities/${activity.id}/lock`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/activities/${activity.id}/reveal`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);

    const revealed = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(revealed.aggregate?.type).toBe("pulse-choice");
    if (revealed.aggregate?.type === "pulse-choice") {
      expect(revealed.aggregate.total).toBe(1);
      expect(revealed.aggregate.consensus).toBe(100);
    }

    const reset = await app.request(`/api/activities/${activity.id}/reset`, {
      method: "POST",
      headers: hostHeaders,
    });
    expect(reset.status).toBe(200);
    const resetState = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(resetState.activity?.state).toBe("live");
    expect(resetState.responseCount).toBe(0);

    const unauthenticatedReaction = await app.request(
      "/api/activities/reactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Room-Id": created.room.id,
        },
        body: JSON.stringify({ kind: "spark" }),
      },
    );
    expect(unauthenticatedReaction.status).toBe(401);

    const reaction = await app.request("/api/activities/reactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Room-Id": created.room.id,
        Authorization: `Bearer ${first.token}`,
      },
      body: JSON.stringify({ kind: "spark" }),
    });
    expect(reaction.status).toBe(200);

    const end = await app.request(`/api/activities/${activity.id}/end`, {
      method: "POST",
      headers: hostHeaders,
    });
    expect(end.status).toBe(200);
    const ended = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(ended.activity).toBeNull();
    expect(ended.room.status).toBe("lobby");
  });

  test("question upvotes are idempotent and moderation is host-only", async () => {
    const createdResponse = await app.request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Question room" }),
    });
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(createdResponse);
    cleanupRoomId = created.room.id;

    const author = await json<{ token: string }>(
      await app.request(`/api/rooms/${created.room.code}/join`, {
        method: "POST",
      }),
    );
    const voter = await json<{ token: string }>(
      await app.request(`/api/rooms/${created.room.code}/join`, {
        method: "POST",
      }),
    );

    const activity = await json<Activity>(
      await app.request(`/api/rooms/${created.room.id}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${created.hostToken}`,
        },
        body: JSON.stringify({
          type: "question-board",
          prompt: "What should we discuss?",
          maxChars: 140,
          resultsMode: "live",
          moderationMode: "live",
        }),
      }),
    );
    expect(
      (
        await app.request(`/api/activities/${activity.id}/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${created.hostToken}` },
        })
      ).status,
    ).toBe(200);

    expect(
      (
        await app.request(`/api/activities/${activity.id}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${author.token}`,
          },
          body: JSON.stringify({
            type: "question-board",
            action: "submit",
            question: "How will the next decision be made?",
          }),
        })
      ).status,
    ).toBe(200);

    const question = db
      .select({ id: responses.id })
      .from(responses)
      .where(eq(responses.activityId, activity.id))
      .get();
    expect(question).toBeTruthy();
    if (!question) return;

    const upvote = () =>
      app.request(`/api/activities/${activity.id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voter.token}`,
        },
        body: JSON.stringify({
          type: "question-board",
          action: "upvote",
          questionId: question.id,
        }),
      });
    expect((await upvote()).status).toBe(200);
    expect((await upvote()).status).toBe(200);

    const storedUpvotes = db
      .select({ payload: responses.payload })
      .from(responses)
      .where(eq(responses.activityId, activity.id))
      .all()
      .filter(
        ({ payload }) =>
          payload.type === "question-board" && payload.action === "upvote",
      );
    expect(storedUpvotes).toHaveLength(1);

    const moderationUrl =
      `/api/activities/${activity.id}/questions/${question.id}`;
    expect(
      (
        await app.request(moderationUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answered: true }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(moderationUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${created.hostToken}`,
          },
          body: JSON.stringify({ answered: true }),
        })
      ).status,
    ).toBe(200);

    const answered = db
      .select({ payload: responses.payload })
      .from(responses)
      .where(
        and(
          eq(responses.activityId, activity.id),
          eq(responses.id, question.id),
        ),
      )
      .get();
    expect(answered?.payload.type).toBe("question-board");
    if (
      answered?.payload.type === "question-board" &&
      answered.payload.action === "submit"
    ) {
      expect(answered.payload.answered).toBe(true);
    }
  });

  test("room rules, presence, and Signal / Noise stay server-authoritative", async () => {
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(
      await app.request("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Signal room",
          settings: {
            theme: "midnight",
            lobbyMessage: "Read the room before the clock closes.",
            allowReactions: false,
            allowLateJoin: false,
            showPresence: true,
            showResponseCount: true,
            participantNames: "chosen",
            maxParticipants: 2,
            soundMode: "arcade",
          },
        }),
      }),
    );
    cleanupRoomId = created.room.id;

    const join = (displayName: string, avatarSeed: string) =>
      app.request(`/api/rooms/${created.room.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, avatarSeed }),
      });
    const firstResponse = await join("Bright Fox", "bright_fox_01");
    const secondResponse = await join("Quick Koi", "quick_koi_02");
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const first = await json<{ token: string; participant: { displayName: string } }>(firstResponse);
    const second = await json<{ token: string }>(secondResponse);
    expect(first.participant.displayName).toBe("Bright Fox");
    expect((await join("Third Otter", "third_otter_03")).status).toBe(409);

    const lobby = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(lobby.onlineCount).toBe(2);
    expect(lobby.presence.map((participant) => participant.displayName).sort()).toEqual([
      "Bright Fox",
      "Quick Koi",
    ]);
    expect(lobby.room.settings.theme).toBe("midnight");

    const activity = await json<Activity>(
      await app.request(`/api/rooms/${created.room.id}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${created.hostToken}`,
        },
        body: JSON.stringify({
          type: "signal-noise",
          prompt: "The release is already live.",
          correctAnswer: "noise",
          explanation: "The deploy is still in the rehearsal lane.",
          timeLimitSeconds: 5,
          resultsMode: "blind",
        }),
      }),
    );
    expect(
      (
        await app.request(`/api/activities/${activity.id}/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${created.hostToken}` },
        })
      ).status,
    ).toBe(200);

    const live = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(live.activity?.deadlineAt).toBeTruthy();
    expect(live.aggregate).toBeNull();
    expect(live.activity?.config.type).toBe("signal-noise");
    if (live.activity?.config.type === "signal-noise") {
      expect(live.activity.config.correctAnswer).toBeNull();
      expect(live.activity.config.explanation).toBe("");
    }
    expect((await join("Late Lynx", "late_lynx_04")).status).toBe(409);

    const answer = (token: string, choice: "signal" | "noise", confidence: number) =>
      app.request(`/api/activities/${activity.id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "signal-noise", choice, confidence }),
      });
    expect((await answer(first.token, "noise", 90)).status).toBe(200);

    db.update(activities)
      .set({ deadlineAt: new Date(Date.now() - 1_000).toISOString() })
      .where(eq(activities.id, activity.id))
      .run();
    expect((await answer(second.token, "signal", 95)).status).toBe(409);

    const autoLocked = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(autoLocked.activity?.state).toBe("locked");
    expect(
      (
        await app.request(`/api/activities/${activity.id}/reveal`, {
          method: "POST",
          headers: { Authorization: `Bearer ${created.hostToken}` },
        })
      ).status,
    ).toBe(200);
    const revealed = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(revealed.aggregate?.type).toBe("signal-noise");
    if (revealed.aggregate?.type === "signal-noise") {
      expect(revealed.aggregate.correctAnswer).toBe("noise");
      expect(revealed.aggregate.accuracy).toBe(100);
      expect(revealed.aggregate.averageConfidence).toBe(90);
    }

    const reaction = await json<{ disabled?: boolean }>(
      await app.request("/api/activities/reactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Room-Id": created.room.id,
          Authorization: `Bearer ${first.token}`,
        },
        body: JSON.stringify({ kind: "spark" }),
      }),
    );
    expect(reaction.disabled).toBe(true);
  });
});
