import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import type {
  ActivityConfig,
  ActivityType,
  ResponsePayload,
} from "@roomwave/shared";

import { db } from "../db";
import {
  activities,
  participants,
  responses,
  rooms,
} from "../db/schema";

import { aggregateActivity, validateResponseFor } from "./modes";

// The mode registry reads from SQLite via drizzle, so tests run against a
// throwaway in-memory-shaped database: same file is fine because we clean
// tables between tests.

let roomId: string;
let activityId: string;
let participantIds: string[];

function seedRoom() {
  roomId = crypto.randomUUID();
  activityId = crypto.randomUUID();

  db.insert(rooms)
    .values({
      id: roomId,
      code: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      title: "Test Room",
      hostTokenHash: "test-hash",
      status: "live",
      activeActivityId: null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function seedActivity(type: ActivityType, config: ActivityConfig) {
  db.insert(activities)
    .values({
      id: activityId,
      roomId,
      type,
      prompt: "Test?",
      state: "live",
      config,
      createdAt: new Date().toISOString(),
    })
    .run();

  db.update(rooms)
    .set({ activeActivityId: activityId })
    .where(eq(rooms.id, roomId))
    .run();
}

function seedParticipants(count: number) {
  participantIds = [];
  for (let i = 0; i < count; i += 1) {
    const id = crypto.randomUUID();
    participantIds.push(id);
    db.insert(participants)
      .values({
        id,
        roomId,
        tokenHash: crypto.randomUUID(),
        joinedAt: new Date().toISOString(),
      })
      .run();
  }
}

function submit(payload: ResponsePayload, index = 0, activity = activityId) {
  const now = new Date().toISOString();
  const existing = db
    .select({ id: responses.id })
    .from(responses)
    .where(
      and(
        eq(responses.activityId, activity),
        eq(responses.participantId, participantIds[index]),
      ),
    )
    .get();

  if (existing) {
    db.update(responses)
      .set({ payload, updatedAt: now })
      .where(eq(responses.id, existing.id))
      .run();
    return;
  }

  db.insert(responses)
    .values({
      id: crypto.randomUUID(),
      activityId: activity,
      participantId: participantIds[index],
      payload,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function append(payload: ResponsePayload, index = 0) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.insert(responses)
    .values({
      id,
      activityId,
      participantId: participantIds[index],
      payload,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

beforeEach(() => {
  db.delete(responses).run();
  db.delete(activities).run();
  db.delete(participants).run();
  db.delete(rooms).run();
  seedRoom();
});

describe("pulse-choice mode", () => {
  test("aggregate counts and percentages", () => {
    seedActivity("pulse-choice", {
      type: "pulse-choice",
      resultsMode: "live",
      choiceRule: "majority",
      options: [
        { id: "11111111-1111-1111-1111-111111111111", label: "A" },
        { id: "22222222-2222-2222-2222-222222222222", label: "B" },
      ],
    });
    seedParticipants(3);

    submit({ type: "pulse-choice", optionId: "11111111-1111-1111-1111-111111111111" }, 0);
    submit({ type: "pulse-choice", optionId: "11111111-1111-1111-1111-111111111111" }, 1);
    submit({ type: "pulse-choice", optionId: "22222222-2222-2222-2222-222222222222" }, 2);

    const agg = aggregateActivity({
      id: activityId,
      type: "pulse-choice",
      state: "live",
      config: {
        type: "pulse-choice",
        resultsMode: "live",
        choiceRule: "majority",
        options: [
          { id: "11111111-1111-1111-1111-111111111111", label: "A" },
          { id: "22222222-2222-2222-2222-222222222222", label: "B" },
        ],
      },
    });

    expect(agg.type).toBe("pulse-choice");
    if (agg.type !== "pulse-choice") return;
    expect(agg.total).toBe(3);
    expect(agg.options[0].count).toBe(2);
    expect(agg.options[0].percentage).toBeCloseTo(66.7);
    expect(agg.options[1].percentage).toBeCloseTo(33.3);
  });

  test("rejects unknown option ids", () => {
    const config: ActivityConfig = {
      type: "pulse-choice",
      resultsMode: "live",
      choiceRule: "majority",
      options: [{ id: "11111111-1111-1111-1111-111111111111", label: "A" }],
    };
    const result = validateResponseFor(
      { type: "pulse-choice", config },
      { type: "pulse-choice", optionId: "99999999-9999-9999-9999-999999999999" },
    );
    expect(result.ok).toBe(false);
  });

  test("Minority Wins selects the least-popular non-empty option on reveal", () => {
    const first = "11111111-1111-1111-1111-111111111111";
    const second = "22222222-2222-2222-2222-222222222222";
    const empty = "33333333-3333-3333-3333-333333333333";
    const config = {
      type: "pulse-choice" as const,
      resultsMode: "blind" as const,
      choiceRule: "minority" as const,
      options: [
        { id: first, label: "Crowd" },
        { id: second, label: "Clever" },
        { id: empty, label: "Empty" },
      ],
    };
    seedActivity("pulse-choice", config);
    seedParticipants(5);
    submit({ type: "pulse-choice", optionId: first }, 0);
    submit({ type: "pulse-choice", optionId: first }, 1);
    submit({ type: "pulse-choice", optionId: first }, 2);
    submit({ type: "pulse-choice", optionId: second }, 3);
    submit({ type: "pulse-choice", optionId: second }, 4);

    const live = aggregateActivity({
      id: activityId,
      type: "pulse-choice",
      state: "live",
      config,
    });
    if (live.type !== "pulse-choice") return;
    expect(live.winnerOptionIds).toEqual([]);

    const revealed = aggregateActivity({
      id: activityId,
      type: "pulse-choice",
      state: "revealed",
      config,
    });
    if (revealed.type !== "pulse-choice") return;
    expect(revealed.winnerOptionIds).toEqual([second]);
  });
});

describe("spectrum mode", () => {
  test("median and polarization", () => {
    seedActivity("spectrum", {
      type: "spectrum",
      lowLabel: "No",
      highLabel: "Yes",
      resultsMode: "live",
    });
    seedParticipants(3);

    submit({ type: "spectrum", value: 100 }, 0);
    submit({ type: "spectrum", value: 500 }, 1);
    submit({ type: "spectrum", value: 900 }, 2);

    const agg = aggregateActivity({
      id: activityId,
      type: "spectrum",
      state: "locked",
      config: { type: "spectrum", lowLabel: "No", highLabel: "Yes", resultsMode: "live" },
    });

    expect(agg.type).toBe("spectrum");
    if (agg.type !== "spectrum") return;
    expect(agg.total).toBe(3);
    expect(agg.median).toBe(500);
    expect(agg.polarization).toBeGreaterThan(0.5);
  });

  test("rejects out-of-range values", () => {
    const result = validateResponseFor(
      { type: "spectrum", config: { type: "spectrum", lowLabel: "a", highLabel: "b", resultsMode: "live" } },
      { type: "spectrum", value: 1001 },
    );
    expect(result.ok).toBe(false);
  });
});

describe("prediction mode", () => {
  const config = {
    type: "prediction" as const,
    unit: "%",
    min: 0,
    max: 100,
    answer: 42,
    resultsMode: "live" as const,
  };

  test("hides truth before reveal, shows after", () => {
    seedActivity("prediction", config);
    seedParticipants(2);

    submit({ type: "prediction", value: 40 }, 0);
    submit({ type: "prediction", value: 80 }, 1);

    const locked = aggregateActivity({
      id: activityId,
      type: "prediction",
      state: "locked",
      config,
    });
    expect(locked.type).toBe("prediction");
    if (locked.type !== "prediction") return;
    expect(locked.answer).toBeNull();
    expect(locked.meanAbsoluteError).toBeNull();

    const revealed = aggregateActivity({
      id: activityId,
      type: "prediction",
      state: "revealed",
      config,
    });
    if (revealed.type !== "prediction") return;
    expect(revealed.answer).toBe(42);
    expect(revealed.meanAbsoluteError).toBeCloseTo((2 + 38) / 2);
    expect(revealed.winners.length).toBe(1);
    expect(revealed.winners[0].value).toBe(40);
  });

  test("rejects guesses outside bounds", () => {
    const result = validateResponseFor(
      { type: "prediction", config },
      { type: "prediction", value: 150 },
    );
    expect(result.ok).toBe(false);
  });
});

describe("append-only modes", () => {
  test("Word Bloom accepts repeated submissions from one participant", () => {
    const config = {
      type: "word-bloom" as const,
      maxChars: 24,
      resultsMode: "live" as const,
    };
    seedActivity("word-bloom", config);
    seedParticipants(1);
    append({ type: "word-bloom", text: "Build together" });
    append({ type: "word-bloom", text: "build   together" });

    const aggregate = aggregateActivity({
      id: activityId,
      type: "word-bloom",
      state: "live",
      config,
    });
    expect(aggregate.type).toBe("word-bloom");
    if (aggregate.type === "word-bloom") {
      expect(aggregate.total).toBe(2);
      expect(aggregate.terms).toEqual([
        { text: "build together", count: 2 },
      ]);
      expect(aggregate.chorusShare).toBe(100);
      expect(aggregate.phraseVariety).toBe(50);
      expect(aggregate.theme).toEqual({ text: "build", count: 2 });
    }
  });

  test("Crowd Meter retains repeated taps and reports a rolling rate", () => {
    const config = {
      type: "crowd-meter" as const,
      windowSeconds: 10,
      resultsMode: "live" as const,
    };
    seedActivity("crowd-meter", config);
    seedParticipants(1);
    append({ type: "crowd-meter" });
    append({ type: "crowd-meter" });

    const aggregate = aggregateActivity({
      id: activityId,
      type: "crowd-meter",
      state: "live",
      config,
    });
    expect(aggregate.type).toBe("crowd-meter");
    if (aggregate.type === "crowd-meter") {
      expect(aggregate.total).toBe(2);
      expect(aggregate.recent).toBe(2);
      expect(aggregate.intensity).toBe(0.2);
    }
  });
});

describe("expanded interaction families", () => {
  test("Rank Race validates permutations and aggregates the full order", () => {
    const options = ["A", "B", "C"].map((label) => ({ id: crypto.randomUUID(), label }));
    const config = { type: "rank-race" as const, options, resultsMode: "live" as const };
    seedActivity("rank-race", config);
    seedParticipants(2);
    submit({ type: "rank-race", ranks: options.map((option) => option.id) }, 0);
    submit({ type: "rank-race", ranks: [options[1].id, options[0].id, options[2].id] }, 1);

    const aggregate = aggregateActivity({ id: activityId, type: "rank-race", state: "live", config });
    expect(aggregate.type).toBe("rank-race");
    if (aggregate.type !== "rank-race") return;
    expect(aggregate.total).toBe(2);
    expect(aggregate.options.find((option) => option.id === options[0].id)?.averageRank).toBe(1.5);
    expect(aggregate.options.find((option) => option.id === options[2].id)?.averageRank).toBe(3);

    const invalid = validateResponseFor(
      { type: "rank-race", config },
      { type: "rank-race", ranks: [options[0].id, options[0].id, options[2].id] },
    );
    expect(invalid.ok).toBe(false);
  });

  test("Hot Take separates force from neutral positions", () => {
    const config = { type: "hot-take" as const, leftLabel: "Left", rightLabel: "Right", resultsMode: "live" as const };
    seedActivity("hot-take", config);
    seedParticipants(3);
    submit({ type: "hot-take", value: -1000 }, 0);
    submit({ type: "hot-take", value: 500 }, 1);
    submit({ type: "hot-take", value: 0 }, 2);
    const aggregate = aggregateActivity({ id: activityId, type: "hot-take", state: "live", config });
    expect(aggregate.type).toBe("hot-take");
    if (aggregate.type !== "hot-take") return;
    expect(aggregate.average).toBe(-167);
    expect(aggregate.leftWeight).toBe(67);
    expect(aggregate.rightWeight).toBe(33);
    expect(aggregate.centerShare).toBe(33);
  });

  test("Quadrant Drop reports centroid and quadrant shares", () => {
    const config = {
      type: "quadrant-drop" as const,
      xLowLabel: "Low effort",
      xHighLabel: "High effort",
      yLowLabel: "Low impact",
      yHighLabel: "High impact",
      resultsMode: "live" as const,
    };
    seedActivity("quadrant-drop", config);
    seedParticipants(4);
    [[100, 900], [900, 900], [900, 100], [100, 100]].forEach(([x, y], index) =>
      submit({ type: "quadrant-drop", x, y }, index),
    );
    const aggregate = aggregateActivity({ id: activityId, type: "quadrant-drop", state: "live", config });
    expect(aggregate.type).toBe("quadrant-drop");
    if (aggregate.type !== "quadrant-drop") return;
    expect(aggregate.centroid).toEqual({ x: 500, y: 500 });
    expect(aggregate.quadrantShares).toEqual([25, 25, 25, 25]);
  });

  test("Question Board deduplicates voter/question pairs and orders the queue", () => {
    const config = { type: "question-board" as const, maxChars: 140, resultsMode: "live" as const };
    seedActivity("question-board", config);
    seedParticipants(3);
    const first = append({ type: "question-board", action: "submit", question: "First question?" }, 0);
    append({ type: "question-board", action: "submit", question: "Answered question", answered: true }, 1);
    append({ type: "question-board", action: "upvote", questionId: first }, 2);
    append({ type: "question-board", action: "upvote", questionId: first }, 2);
    const aggregate = aggregateActivity({ id: activityId, type: "question-board", state: "live", config });
    expect(aggregate.type).toBe("question-board");
    if (aggregate.type !== "question-board") return;
    expect(aggregate.total).toBe(2);
    expect(aggregate.questions[0].id).toBe(first);
    expect(aggregate.questions[0].votes).toBe(1);
    expect(aggregate.questions[1].answered).toBe(true);
  });

  test("Before / After quantifies changed minds and convergence", () => {
    const config = { type: "before-after" as const, lowLabel: "No", highLabel: "Yes", resultsMode: "live" as const };
    seedActivity("before-after", config);
    seedParticipants(2);
    submit({ type: "before-after", before: 0, after: 500 }, 0);
    submit({ type: "before-after", before: 1000, after: 500 }, 1);
    const aggregate = aggregateActivity({ id: activityId, type: "before-after", state: "live", config });
    expect(aggregate.type).toBe("before-after");
    if (aggregate.type !== "before-after") return;
    expect(aggregate.beforeMedian).toBe(500);
    expect(aggregate.afterMedian).toBe(500);
    expect(aggregate.changedShare).toBe(100);
    expect(aggregate.convergence).toBe(100);
  });

  test("Signal / Noise reveals calibration without leaking truth early", () => {
    const config = {
      type: "signal-noise" as const,
      correctAnswer: "noise" as const,
      explanation: "The source is a decoy.",
      timeLimitSeconds: 20,
      resultsMode: "blind" as const,
    };
    seedActivity("signal-noise", config);
    seedParticipants(3);
    submit({ type: "signal-noise", choice: "noise", confidence: 90 }, 0);
    submit({ type: "signal-noise", choice: "signal", confidence: 80 }, 1);
    submit({ type: "signal-noise", choice: "noise", confidence: 60 }, 2);

    const hidden = aggregateActivity({
      id: activityId,
      type: "signal-noise",
      state: "locked",
      config,
    });
    expect(hidden.type).toBe("signal-noise");
    if (hidden.type !== "signal-noise") return;
    expect(hidden.correctAnswer).toBeNull();
    expect(hidden.signalCount).toBe(0);

    const revealed = aggregateActivity({
      id: activityId,
      type: "signal-noise",
      state: "revealed",
      config,
    });
    expect(revealed.type).toBe("signal-noise");
    if (revealed.type !== "signal-noise") return;
    expect(revealed.correctAnswer).toBe("noise");
    expect(revealed.accuracy).toBe(67);
    expect(revealed.averageConfidence).toBe(77);
    expect(revealed.calibrationGap).toBe(10);
    expect(revealed.highConfidenceWrongShare).toBe(33);

    expect(
      validateResponseFor(
        { type: "signal-noise", config },
        { type: "signal-noise", choice: "noise", confidence: 101 },
      ).ok,
    ).toBe(false);
  });

  test("Reality Bender measures the signed belief-about-belief gap", () => {
    const config = {
      type: "reality-bender" as const,
      lowLabel: "Disagree",
      highLabel: "Agree",
      resultsMode: "blind" as const,
    };
    seedActivity("reality-bender", config);
    seedParticipants(2);
    submit({ type: "reality-bender", personal: 400, roomEstimate: 800 }, 0);
    submit({ type: "reality-bender", personal: 600, roomEstimate: 800 }, 1);

    const aggregate = aggregateActivity({
      id: activityId,
      type: "reality-bender",
      state: "revealed",
      config,
    });
    expect(aggregate.type).toBe("reality-bender");
    if (aggregate.type !== "reality-bender") return;
    expect(aggregate.actualMean).toBe(500);
    expect(aggregate.expectedMean).toBe(800);
    expect(aggregate.perceptionGap).toBe(30);
    expect(aggregate.misreadShare).toBe(100);
    expect(aggregate.projectionCorrelation).toBeNull();
  });

  test("Living Consensus keeps survey geometry and confidence mathematically bounded", () => {
    const config = {
      type: "living-consensus" as const,
      lowLabel: "Contract",
      highLabel: "Expand",
      resultsMode: "live" as const,
    };
    seedActivity("living-consensus", config);
    seedParticipants(2);
    submit({ type: "living-consensus", value: 0, confidence: 80 }, 0);
    submit({ type: "living-consensus", value: 1000, confidence: 60 }, 1);

    const aggregate = aggregateActivity({
      id: activityId,
      type: "living-consensus",
      state: "live",
      config,
    });
    expect(aggregate.type).toBe("living-consensus");
    if (aggregate.type !== "living-consensus") return;
    expect(aggregate.mean).toBe(500);
    expect(aggregate.confidenceWeightedMean).toBe(429);
    expect(aggregate.confidence).toBe(70);
    expect(aggregate.polarization).toBe(1);
    expect(aggregate.consensus).toBe(0);
  });

  test("Future Fork records categorical migration after an evidence drop", () => {
    const first = "11111111-1111-1111-1111-111111111111";
    const second = "22222222-2222-2222-2222-222222222222";
    const config = {
      type: "future-fork" as const,
      branches: [
        { id: first, label: "Open access" },
        { id: second, label: "Tight controls" },
      ],
      evidenceDrop: "Retention fell after six months.",
      resultsMode: "blind" as const,
    };
    seedActivity("future-fork", config);
    seedParticipants(4);
    submit({ type: "future-fork", beforeBranchId: first, beforeLikelihood: 70, afterBranchId: second, afterLikelihood: 60 }, 0);
    submit({ type: "future-fork", beforeBranchId: first, beforeLikelihood: 80, afterBranchId: first, afterLikelihood: 80 }, 1);
    submit({ type: "future-fork", beforeBranchId: second, beforeLikelihood: 60, afterBranchId: first, afterLikelihood: 75 }, 2);
    submit({ type: "future-fork", beforeBranchId: second, beforeLikelihood: 55 }, 3);

    const aggregate = aggregateActivity({
      id: activityId,
      type: "future-fork",
      state: "revealed",
      config,
    });
    expect(aggregate.type).toBe("future-fork");
    if (aggregate.type !== "future-fork") return;
    expect(aggregate.total).toBe(4);
    expect(aggregate.revisedTotal).toBe(3);
    expect(aggregate.changedShare).toBe(67);
    expect(aggregate.confidenceShift).toBe(2);
    expect(aggregate.flows).toHaveLength(2);
  });

  test("Cipher Room seals the answer and scores a Caesar shift only on reveal", () => {
    const config = {
      type: "cipher-room" as const,
      ciphertext: "WKLV LV D WHVW",
      clue: "Rotate backward.",
      correctShift: 3,
      timeLimitSeconds: 45,
      resultsMode: "blind" as const,
    };
    seedActivity("cipher-room", config);
    seedParticipants(3);
    submit({ type: "cipher-room", shift: 3, confidence: 90 }, 0);
    submit({ type: "cipher-room", shift: 3, confidence: 80 }, 1);
    submit({ type: "cipher-room", shift: 5, confidence: 70 }, 2);

    const hidden = aggregateActivity({ id: activityId, type: "cipher-room", state: "locked", config });
    expect(hidden.type).toBe("cipher-room");
    if (hidden.type !== "cipher-room") return;
    expect(hidden.correctShift).toBeNull();
    expect(hidden.distribution.every((count) => count === 0)).toBe(true);

    const aggregate = aggregateActivity({ id: activityId, type: "cipher-room", state: "revealed", config });
    expect(aggregate.type).toBe("cipher-room");
    if (aggregate.type !== "cipher-room") return;
    expect(aggregate.correctShift).toBe(3);
    expect(aggregate.accuracy).toBe(67);
    expect(aggregate.averageConfidence).toBe(80);
    expect(aggregate.mostCommonShift).toBe(3);
  });

  test("Shadow Council enforces a three-point budget and reveals only after tribunal", () => {
    const vector = "11111111-1111-1111-1111-111111111111";
    const moth = "22222222-2222-2222-2222-222222222222";
    const tide = "33333333-3333-3333-3333-333333333333";
    const config = {
      type: "shadow-council" as const,
      aliases: [
        { id: vector, label: "Vector" },
        { id: moth, label: "Moth" },
        { id: tide, label: "Tide" },
      ],
      evidence: "One Shadow backed the Foundry.",
      shadowAliasId: moth,
      suspicionPoints: 3,
      timeLimitSeconds: 60,
      resultsMode: "blind" as const,
    };
    seedActivity("shadow-council", config);
    seedParticipants(3);
    submit({ type: "shadow-council", allocations: [{ aliasId: moth, points: 3 }], banishId: moth, confidence: 90 }, 0);
    submit({ type: "shadow-council", allocations: [{ aliasId: moth, points: 2 }, { aliasId: vector, points: 1 }], banishId: moth, confidence: 70 }, 1);
    submit({ type: "shadow-council", allocations: [{ aliasId: vector, points: 3 }], banishId: vector, confidence: 60 }, 2);

    const hidden = aggregateActivity({ id: activityId, type: "shadow-council", state: "locked", config });
    expect(hidden.type).toBe("shadow-council");
    if (hidden.type !== "shadow-council") return;
    expect(hidden.shadowAliasId).toBeNull();
    expect(hidden.aliases.every((alias) => alias.heat === 0)).toBe(true);

    const aggregate = aggregateActivity({ id: activityId, type: "shadow-council", state: "revealed", config });
    expect(aggregate.type).toBe("shadow-council");
    if (aggregate.type !== "shadow-council") return;
    expect(aggregate.shadowAliasId).toBe(moth);
    expect(aggregate.accuracy).toBe(67);
    expect(aggregate.aliases.find((alias) => alias.id === moth)?.suspicion).toBe(5);

    expect(
      validateResponseFor(
        { type: "shadow-council", config },
        {
          type: "shadow-council",
          allocations: [
            { aliasId: moth, points: 2 },
            { aliasId: moth, points: 1 },
          ],
          banishId: moth,
          confidence: 80,
        },
      ).ok,
    ).toBe(false);
  });
});
