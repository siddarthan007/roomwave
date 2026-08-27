// ---------------------------------------------------------------------------
// Activity mode registry.
//
// Adding a mode = adding one entry here + a host editor +
// one participant renderer + one stage renderer on the frontend.
// Nothing else in the API should branch on activity type.
// ---------------------------------------------------------------------------

import type {
  ActivityAggregate,
  ActivityConfig,
  ActivityType,
  PredictionAggregate,
  PulseChoiceAggregate,
  ResponsePayload,
  SpectrumAggregate,
} from "@roomwave/shared";

import {
  createPulseChoiceSchema,
  createSpectrumSchema,
  createPredictionSchema,
  createWordBloomSchema,
  createCrowdMeterSchema,
  createRankRaceSchema,
  createHotTakeSchema,
  createQuadrantDropSchema,
  createQuestionBoardSchema,
  createBeforeAfterSchema,
  createSignalNoiseSchema,
  createRealityBenderSchema,
  createLivingConsensusSchema,
  createFutureForkSchema,
  createCipherRoomSchema,
  createShadowCouncilSchema,
  createChipStackSchema,
  createOverUnderSchema,
  createFistFiveSchema,
  pulseChoiceResponseSchema,
  spectrumResponseSchema,
  predictionResponseSchema,
  wordBloomResponseSchema,
  crowdMeterResponseSchema,
  rankRaceResponseSchema,
  hotTakeResponseSchema,
  quadrantDropResponseSchema,
  questionBoardResponseSchema,
  beforeAfterResponseSchema,
  signalNoiseResponseSchema,
  realityBenderResponseSchema,
  livingConsensusResponseSchema,
  futureForkResponseSchema,
  cipherRoomResponseSchema,
  shadowCouncilResponseSchema,
  chipStackResponseSchema,
  overUnderResponseSchema,
  fistFiveResponseSchema,
} from "@roomwave/shared";

import { and, asc, count, eq, gte } from "drizzle-orm";

import { db } from "../db";
import { responses } from "../db/schema";
import {
  budgetConcentration,
  meanAbsoluteError,
  median,
  normalizedEntropy,
  polarization,
} from "./analytics";
import type { z } from "zod";

interface ModeDefinition<
  TType extends ActivityType,
  TCreate extends z.ZodTypeAny,
  TResponse extends z.ZodTypeAny,
> {
  type: TType;
  label: string;
  tagline: string;
  /**
   * true  = one live answer slot per participant (upsert semantics)
   * false = every submission appends (words, taps)
   */
  singleResponsePerParticipant: boolean;
  /** Host-facing config schema (discriminated on `type`). */
  createSchema: TCreate;
  /** Participant response schema for this mode. */
  responseSchema: TResponse;
  /** Build the stored config from validated host input. */
  buildConfig: (input: z.infer<TCreate>) => ActivityConfig;
  /** Extra server-side validation against the stored config. */
  validateResponse: (
    payload: ResponsePayload,
    config: ActivityConfig,
  ) => string | null;
  /**
   * Compute canonical aggregate from stored responses.
   * `revealed` lets modes decide when the truth becomes public
   * (prediction hides its answer until reveal).
   */
  aggregate: (
    activityId: string,
    config: ActivityConfig,
    state: string,
    revealed: boolean,
    responseRows?: { payload: ResponsePayload; updatedAt: string }[],
  ) => ActivityAggregate;
}

function loadResponses(
  activityId: string,
): {
  id: string;
  participantId: string;
  payload: ResponsePayload;
  createdAt: string;
  updatedAt: string;
}[] {
  const rows = db
    .select({
      id: responses.id,
      participantId: responses.participantId,
      payload: responses.payload,
      createdAt: responses.createdAt,
      updatedAt: responses.updatedAt,
    })
    .from(responses)
    .where(eq(responses.activityId, activityId))
    .orderBy(asc(responses.createdAt))
    .all();
  return rows;
}

const COMMON_THEME_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for",
  "from", "has", "have", "how", "i", "in", "is", "it", "of", "on",
  "or", "our", "that", "the", "this", "to", "was", "we", "what",
  "when", "where", "which", "who", "why", "will", "with", "you",
]);

/** Small, deterministic lexical signal. No model, sentiment guess, or profiling. */
export function meaningfulTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const tokens = [...segmenter.segment(normalized)]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment.trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        !COMMON_THEME_WORDS.has(token) &&
        !/^\p{N}+$/u.test(token),
    );
  return tokens;
}

function mean(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : covariance / denominator;
}

const pulseChoiceMode: ModeDefinition<
  "pulse-choice",
  typeof createPulseChoiceSchema,
  typeof pulseChoiceResponseSchema
> = {
  type: "pulse-choice",
  label: "Pulse Choice",
  tagline: "Options claim lanes as votes land",
  singleResponsePerParticipant: true,
  createSchema: createPulseChoiceSchema,
  responseSchema: pulseChoiceResponseSchema,
  buildConfig: (input) => ({
    type: "pulse-choice" as const,
    resultsMode: input.choiceRule === "minority" ? "blind" : input.resultsMode,
    choiceRule: input.choiceRule,
    options: input.options.map((label) => ({
      id: crypto.randomUUID(),
      label,
    })),
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "pulse-choice") return "Wrong mode.";
    if (config.type !== "pulse-choice") return "Wrong mode.";
    if (!config.options.some((option) => option.id === payload.optionId)) {
      return "This option does not exist.";
    }
    return null;
  },
  aggregate: (_id, config, _state, revealed): PulseChoiceAggregate => {
    if (config.type !== "pulse-choice") throw new Error("Config mismatch");
    const counts = new Map<string, number>();
    for (const option of config.options) counts.set(option.id, 0);

    let total = 0;
    for (const { payload } of loadResponses(_id)) {
      if (payload.type !== "pulse-choice") continue;
      const current = counts.get(payload.optionId);
      if (current === undefined) continue;
      counts.set(payload.optionId, current + 1);
      total += 1;
    }

    const populatedCounts = [...counts.values()].filter((value) => value > 0);
    const winningCount =
      populatedCounts.length === 0
        ? null
        : config.choiceRule === "minority"
          ? Math.min(...populatedCounts)
          : Math.max(...populatedCounts);

    return {
      type: "pulse-choice",
      total,
      options: config.options.map((option) => ({
        id: option.id,
        label: option.label,
        count: counts.get(option.id) ?? 0,
        percentage:
          total === 0
            ? 0
            : Math.round(((counts.get(option.id) ?? 0) / total) * 1000) / 10,
      })),
      consensus:
        total === 0
          ? null
          : Math.round(
              (1 - normalizedEntropy([...counts.values()])) * 100,
            ),
      winnerOptionIds:
        revealed && winningCount !== null
          ? config.options
              .filter((option) => counts.get(option.id) === winningCount)
              .map((option) => option.id)
          : [],
    };
  },
};

const spectrumMode: ModeDefinition<
  "spectrum",
  typeof createSpectrumSchema,
  typeof spectrumResponseSchema
> = {
  type: "spectrum",
  label: "Spectrum",
  tagline: "The room places itself on a rail",
  singleResponsePerParticipant: true,
  createSchema: createSpectrumSchema,
  responseSchema: spectrumResponseSchema,
  buildConfig: (input) => ({
    type: "spectrum" as const,
    lowLabel: input.lowLabel,
    highLabel: input.highLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "spectrum" ? null : "Wrong mode.",
  aggregate: (activityId, _config, _state): SpectrumAggregate => {
    const values = loadResponses(activityId)
      .map((row) => row.payload)
      .filter((payload): payload is Extract<ResponsePayload, { type: "spectrum" }> =>
        payload.type === "spectrum",
      )
      .map((payload) => Math.max(0, Math.min(1000, payload.value)));

    const spread = polarization(values);

    return {
      type: "spectrum",
      total: values.length,
      // Cap the sample sent to clients; distribution shape is preserved well
      // enough at this size and keeps SSE payloads bounded.
      values: values.slice(-400),
      median: median(values) ?? 0,
      polarization: spread,
      consensus:
        values.length === 0 ? null : Math.round((1 - spread) * 100),
    };
  },
};

const predictionMode: ModeDefinition<
  "prediction",
  typeof createPredictionSchema,
  typeof predictionResponseSchema
> = {
  type: "prediction",
  label: "Prediction Battle",
  tagline: "Guess before the truth lands",
  singleResponsePerParticipant: true,
  createSchema: createPredictionSchema,
  responseSchema: predictionResponseSchema,
  buildConfig: (input) => ({
    type: "prediction" as const,
    unit: input.unit,
    min: input.min,
    max: input.max,
    answer: input.answer,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "prediction") return "Wrong mode.";
    if (config.type !== "prediction") return "Wrong mode.";
    if (payload.value < config.min || payload.value > config.max) {
      return `Guess must be between ${config.min} and ${config.max}.`;
    }
    return null;
  },
  aggregate: (
    activityId,
    config,
    state,
    revealed,
  ): PredictionAggregate => {
    if (config.type !== "prediction") throw new Error("Config mismatch");
    const values = loadResponses(activityId)
      .map((row) => row.payload)
      .filter((payload): payload is Extract<ResponsePayload, { type: "prediction" }> =>
        payload.type === "prediction",
      )
      .map((payload) => payload.value);

    const answer = config.answer;
    const showTruth =
      revealed && answer !== null;

    let winners: { value: number }[] = [];
    if (showTruth && values.length > 0 && answer !== null) {
      const bestError = Math.min(
        ...values.map((value) => Math.abs(value - answer)),
      );
      winners = values
        .filter((value) => Math.abs(value - answer) === bestError)
        .slice(-10)
        .map((value) => ({ value }));
    }

    return {
      type: "prediction",
      total: values.length,
      min: config.min,
      max: config.max,
      median: median(values) ?? 0,
      meanAbsoluteError:
        showTruth && answer !== null ? meanAbsoluteError(values, answer) : null,
      answer: showTruth ? answer : null,
      winners,
      values: values.slice(-400),
    };
  },
};

const wordBloomMode: ModeDefinition<
  "word-bloom",
  typeof createWordBloomSchema,
  typeof wordBloomResponseSchema
> = {
  type: "word-bloom",
  label: "Word Bloom",
  tagline: "Short answers grow into a living field",
  singleResponsePerParticipant: false,
  createSchema: createWordBloomSchema,
  responseSchema: wordBloomResponseSchema,
  buildConfig: (input) => ({
    type: "word-bloom" as const,
    maxChars: input.maxChars,
    resultsMode: input.resultsMode,
    moderationMode: input.moderationMode,
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "word-bloom") return "Wrong mode.";
    if (config.type !== "word-bloom") return "Wrong mode.";
    if (payload.text.length > config.maxChars) {
      return `Keep it under ${config.maxChars} characters.`;
    }
    return null;
  },
  aggregate: (activityId, _config, _state): ActivityAggregate => {
    // Normalize terms: lowercase, collapse whitespace. Count duplicates.
    const counts = new Map<string, number>();
    const tokens = new Map<string, number>();
    let total = 0;

    for (const row of loadResponses(activityId)) {
      const payload = row.payload;
      if (
        payload.type !== "word-bloom" ||
        payload.moderation === "pending" ||
        payload.moderation === "hidden"
      ) continue;
      const normalized = payload.text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      for (const token of meaningfulTokens(normalized)) {
        tokens.set(token, (tokens.get(token) ?? 0) + 1);
      }
      total += 1;
    }

    // Top terms only, keeping the field legible and the long tail bounded.
    const terms = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([text, count]) => ({ text, count }));

    const leadingPhraseCount = terms[0]?.count ?? 0;
    const leadingToken = [...tokens.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    return {
      type: "word-bloom",
      total,
      terms,
      chorusShare:
        total === 0 ? 0 : Math.round((leadingPhraseCount / total) * 100),
      phraseVariety:
        total === 0 ? 0 : Math.round((counts.size / total) * 100),
      theme: leadingToken
        ? { text: leadingToken[0], count: leadingToken[1] }
        : null,
    };
  },
};

const crowdMeterMode: ModeDefinition<
  "crowd-meter",
  typeof createCrowdMeterSchema,
  typeof crowdMeterResponseSchema
> = {
  type: "crowd-meter",
  label: "Crowd Meter",
  tagline: "Tap-tap-tap. Applause as data",
  singleResponsePerParticipant: false,
  createSchema: createCrowdMeterSchema,
  responseSchema: crowdMeterResponseSchema,
  buildConfig: (input) => ({
    type: "crowd-meter" as const,
    windowSeconds: input.windowSeconds,
    resultsMode: "live" as const,
  }),
  validateResponse: (payload) =>
    payload.type === "crowd-meter" ? null : "Wrong mode.",
  aggregate: (activityId, config): ActivityAggregate => {
    if (config.type !== "crowd-meter") throw new Error("Config mismatch");

    const cutoff = new Date(
      Date.now() - config.windowSeconds * 1000,
    ).toISOString();
    const total = db
      .select({ value: count() })
      .from(responses)
      .where(eq(responses.activityId, activityId))
      .get()?.value ?? 0;
    const recent = db
      .select({ value: count() })
      .from(responses)
      .where(
        and(
          eq(responses.activityId, activityId),
          gte(responses.updatedAt, cutoff),
        ),
      )
      .get()?.value ?? 0;

    return {
      type: "crowd-meter",
      recent,
      intensity: Math.round((recent / config.windowSeconds) * 10) / 10,
      total,
    };
  },
};

const rankRaceMode: ModeDefinition<
  "rank-race",
  typeof createRankRaceSchema,
  typeof rankRaceResponseSchema
> = {
  type: "rank-race",
  label: "Rank Race",
  tagline: "Drag priorities into a room-wide race",
  singleResponsePerParticipant: true,
  createSchema: createRankRaceSchema,
  responseSchema: rankRaceResponseSchema,
  buildConfig: (input) => ({
    type: "rank-race" as const,
    resultsMode: input.resultsMode,
    options: input.options.map((label) => ({ id: crypto.randomUUID(), label })),
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "rank-race" || config.type !== "rank-race") {
      return "Wrong mode.";
    }
    const expected = new Set(config.options.map((option) => option.id));
    const received = new Set(payload.ranks);
    if (
      received.size !== expected.size ||
      payload.ranks.length !== expected.size ||
      payload.ranks.some((id) => !expected.has(id))
    ) {
      return "Ranking must contain every option exactly once.";
    }
    return null;
  },
  aggregate: (activityId, config): ActivityAggregate => {
    if (config.type !== "rank-race") throw new Error("Config mismatch");
    const optionIds = new Set(config.options.map((option) => option.id));
    const rankings = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "rank-race" }> =>
          payload.type === "rank-race" &&
          payload.ranks.length === optionIds.size &&
          new Set(payload.ranks).size === optionIds.size &&
          payload.ranks.every((id) => optionIds.has(id)),
      );
    const total = rankings.length;
    const size = config.options.length;
    return {
      type: "rank-race",
      total,
      options: config.options
        .map((option) => {
          let rankSum = 0;
          let first = 0;
          let borda = 0;
          for (const ranking of rankings) {
            const index = ranking.ranks.indexOf(option.id);
            rankSum += index + 1;
            if (index === 0) first += 1;
            borda += size - index;
          }
          return {
            id: option.id,
            label: option.label,
            averageRank: total === 0 ? 0 : Math.round((rankSum / total) * 100) / 100,
            firstPlaceShare: total === 0 ? 0 : Math.round((first / total) * 1000) / 10,
            score: total === 0 ? 0 : Math.round((borda / (total * size)) * 1000) / 10,
          };
        })
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)),
    };
  },
};

const hotTakeMode: ModeDefinition<
  "hot-take",
  typeof createHotTakeSchema,
  typeof hotTakeResponseSchema
> = {
  type: "hot-take",
  label: "Hot Take Duel",
  tagline: "Pull the room toward one side",
  singleResponsePerParticipant: true,
  createSchema: createHotTakeSchema,
  responseSchema: hotTakeResponseSchema,
  buildConfig: (input) => ({
    type: "hot-take" as const,
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "hot-take" ? null : "Wrong mode.",
  aggregate: (activityId): ActivityAggregate => {
    const values = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "hot-take" }> =>
          payload.type === "hot-take",
      )
      .map((payload) => payload.value);
    const total = values.length;
    const average = total === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / total;
    const leftForce = values.reduce((sum, value) => sum + Math.max(0, -value), 0);
    const rightForce = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    const force = leftForce + rightForce;
    return {
      type: "hot-take",
      total,
      values: values.slice(-400),
      average: Math.round(average),
      leftWeight: force === 0 ? 0 : Math.round((leftForce / force) * 100),
      rightWeight: force === 0 ? 0 : Math.round((rightForce / force) * 100),
      centerShare:
        total === 0
          ? 0
          : Math.round((values.filter((value) => Math.abs(value) <= 100).length / total) * 100),
      spread: polarization(values.map((value) => (value + 1000) / 2)),
    };
  },
};

const quadrantDropMode: ModeDefinition<
  "quadrant-drop",
  typeof createQuadrantDropSchema,
  typeof quadrantDropResponseSchema
> = {
  type: "quadrant-drop",
  label: "Quadrant Drop",
  tagline: "Place the room on two dimensions",
  singleResponsePerParticipant: true,
  createSchema: createQuadrantDropSchema,
  responseSchema: quadrantDropResponseSchema,
  buildConfig: (input) => ({
    type: "quadrant-drop" as const,
    xLowLabel: input.xLowLabel,
    xHighLabel: input.xHighLabel,
    yLowLabel: input.yLowLabel,
    yHighLabel: input.yHighLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "quadrant-drop" ? null : "Wrong mode.",
  aggregate: (activityId): ActivityAggregate => {
    const points = loadResponses(activityId)
      .filter(
        (row): row is typeof row & { payload: Extract<ResponsePayload, { type: "quadrant-drop" }> } =>
          row.payload.type === "quadrant-drop",
      )
      .map((row) => ({ id: row.id, x: row.payload.x, y: row.payload.y }));
    const total = points.length;
    const centroid =
      total === 0
        ? null
        : {
            x: Math.round(points.reduce((sum, point) => sum + point.x, 0) / total),
            y: Math.round(points.reduce((sum, point) => sum + point.y, 0) / total),
          };
    const quadrants: [number, number, number, number] = [0, 0, 0, 0];
    for (const point of points) {
      const index = point.y >= 500 ? (point.x < 500 ? 0 : 1) : point.x >= 500 ? 2 : 3;
      quadrants[index] += 1;
    }
    const distances = centroid
      ? points.map((point) => Math.hypot(point.x - centroid.x, point.y - centroid.y))
      : [];
    const meanDistance =
      distances.length === 0
        ? 0
        : distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const distanceSpread =
      distances.length <= 1
        ? 0
        : Math.sqrt(
            distances.reduce((sum, value) => sum + (value - meanDistance) ** 2, 0) /
              distances.length,
          );
    return {
      type: "quadrant-drop",
      total,
      points: points.slice(-400),
      centroid,
      quadrantShares: quadrants.map((value) =>
        total === 0 ? 0 : Math.round((value / total) * 100),
      ) as [number, number, number, number],
      outlierCount: distances.filter((value) => value > meanDistance + distanceSpread * 2).length,
    };
  },
};

const questionBoardMode: ModeDefinition<
  "question-board",
  typeof createQuestionBoardSchema,
  typeof questionBoardResponseSchema
> = {
  type: "question-board",
  label: "Question Board",
  tagline: "Questions become a live stage queue",
  singleResponsePerParticipant: false,
  createSchema: createQuestionBoardSchema,
  responseSchema: questionBoardResponseSchema,
  buildConfig: (input) => ({
    type: "question-board" as const,
    maxChars: input.maxChars,
    // Raising and ordering questions requires a shared live queue.
    resultsMode: "live" as const,
    moderationMode: input.moderationMode,
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "question-board" || config.type !== "question-board") {
      return "Wrong mode.";
    }
    if (payload.action === "submit" && payload.question.length > config.maxChars) {
      return `Keep the question under ${config.maxChars} characters.`;
    }
    return null;
  },
  aggregate: (activityId): ActivityAggregate => {
    const rows = loadResponses(activityId);
    const questions = rows.filter(
      (row): row is typeof row & {
        payload: Extract<ResponsePayload, { type: "question-board"; action: "submit" }>;
      } =>
        row.payload.type === "question-board" &&
        row.payload.action === "submit" &&
        row.payload.moderation !== "pending" &&
        row.payload.moderation !== "hidden",
    );
    const questionIds = new Set(questions.map((row) => row.id));
    const voterKeys = new Set<string>();
    const votes = new Map<string, number>();
    for (const row of rows) {
      const payload = row.payload;
      if (
        payload.type !== "question-board" ||
        payload.action !== "upvote" ||
        !questionIds.has(payload.questionId)
      ) continue;
      const key = `${row.participantId}:${payload.questionId}`;
      if (voterKeys.has(key)) continue;
      voterKeys.add(key);
      votes.set(payload.questionId, (votes.get(payload.questionId) ?? 0) + 1);
    }
    return {
      type: "question-board",
      total: questions.length,
      questions: questions
        .map((row) => ({
          id: row.id,
          text: row.payload.question,
          votes: votes.get(row.id) ?? 0,
          answered: row.payload.answered === true,
          createdAt: row.createdAt,
        }))
        .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))
        .slice(0, 30),
    };
  },
};

const beforeAfterMode: ModeDefinition<
  "before-after",
  typeof createBeforeAfterSchema,
  typeof beforeAfterResponseSchema
> = {
  type: "before-after",
  label: "Before / After",
  tagline: "Make changed minds visible",
  singleResponsePerParticipant: true,
  createSchema: createBeforeAfterSchema,
  responseSchema: beforeAfterResponseSchema,
  buildConfig: (input) => ({
    type: "before-after" as const,
    lowLabel: input.lowLabel,
    highLabel: input.highLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "before-after" ? null : "Wrong mode.",
  aggregate: (activityId): ActivityAggregate => {
    const movements = loadResponses(activityId)
      .filter(
        (row): row is typeof row & { payload: Extract<ResponsePayload, { type: "before-after" }> } =>
          row.payload.type === "before-after",
      )
      .map((row) => ({ id: row.id, before: row.payload.before, after: row.payload.after }));
    const before = movements.map((movement) => movement.before);
    const after = movements.map((movement) => movement.after);
    return {
      type: "before-after",
      total: movements.length,
      movements: movements.slice(-300),
      beforeMedian: median(before) ?? 0,
      afterMedian: median(after) ?? 0,
      changedShare:
        movements.length === 0
          ? 0
          : Math.round(
              (movements.filter((movement) => Math.abs(movement.after - movement.before) >= 50).length /
                movements.length) *
                100,
            ),
      convergence: Math.round((polarization(before) - polarization(after)) * 100),
    };
  },
};

const signalNoiseMode: ModeDefinition<
  "signal-noise",
  typeof createSignalNoiseSchema,
  typeof signalNoiseResponseSchema
> = {
  type: "signal-noise",
  label: "Signal / Noise",
  tagline: "Read the claim, back your instinct, beat the clock",
  singleResponsePerParticipant: true,
  createSchema: createSignalNoiseSchema,
  responseSchema: signalNoiseResponseSchema,
  buildConfig: (input) => ({
    type: "signal-noise" as const,
    correctAnswer: input.correctAnswer,
    explanation: input.explanation,
    timeLimitSeconds: input.timeLimitSeconds,
    resultsMode: "blind" as const,
  }),
  validateResponse: (payload) =>
    payload.type === "signal-noise" ? null : "Wrong mode.",
  aggregate: (activityId, config, _state, revealed): ActivityAggregate => {
    if (config.type !== "signal-noise") throw new Error("Config mismatch");
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "signal-noise" }> =>
          payload.type === "signal-noise",
      );
    const total = answers.length;
    const signalCount = answers.filter((answer) => answer.choice === "signal").length;
    const noiseCount = total - signalCount;
    const averageConfidence =
      total === 0
        ? 0
        : Math.round(
            answers.reduce((sum, answer) => sum + answer.confidence, 0) / total,
          );
    if (!revealed || config.correctAnswer === null) {
      return {
        type: "signal-noise",
        total,
        correctAnswer: null,
        signalCount: 0,
        noiseCount: 0,
        accuracy: null,
        averageConfidence,
        calibrationGap: null,
        brierScore: null,
        highConfidenceWrongShare: null,
      };
    }

    const correct = answers.filter((answer) => answer.choice === config.correctAnswer).length;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    const outcome = config.correctAnswer === "signal" ? 1 : 0;
    const brierScore =
      total === 0
        ? 0
        : Math.round(
            (answers.reduce((sum, answer) => {
              const signalProbability =
                answer.choice === "signal"
                  ? answer.confidence / 100
                  : 1 - answer.confidence / 100;
              return sum + (signalProbability - outcome) ** 2;
            }, 0) /
              total) *
              100,
          );
    const highConfidenceWrong = answers.filter(
      (answer) => answer.confidence >= 80 && answer.choice !== config.correctAnswer,
    ).length;

    return {
      type: "signal-noise",
      total,
      correctAnswer: config.correctAnswer,
      signalCount,
      noiseCount,
      accuracy,
      averageConfidence,
      calibrationGap: Math.abs(averageConfidence - accuracy),
      brierScore,
      highConfidenceWrongShare:
        total === 0 ? 0 : Math.round((highConfidenceWrong / total) * 100),
    };
  },
};

const realityBenderMode: ModeDefinition<
  "reality-bender",
  typeof createRealityBenderSchema,
  typeof realityBenderResponseSchema
> = {
  type: "reality-bender",
  label: "Reality Bender",
  tagline: "Measure the gap between private belief and room belief",
  singleResponsePerParticipant: true,
  createSchema: createRealityBenderSchema,
  responseSchema: realityBenderResponseSchema,
  buildConfig: (input) => ({
    type: "reality-bender" as const,
    lowLabel: input.lowLabel,
    highLabel: input.highLabel,
    resultsMode: "blind" as const,
  }),
  validateResponse: (payload) =>
    payload.type === "reality-bender" ? null : "Wrong mode.",
  aggregate: (activityId): ActivityAggregate => {
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "reality-bender" }> =>
          payload.type === "reality-bender",
      );
    const personal = answers.map((answer) => answer.personal);
    const estimates = answers.map((answer) => answer.roomEstimate);
    const actualMean = mean(personal);
    const expectedMean = mean(estimates);
    const correlation = pearsonCorrelation(personal, estimates);
    return {
      type: "reality-bender",
      total: answers.length,
      personalValues: personal.slice(-400),
      estimateValues: estimates.slice(-400),
      actualMean: Math.round(actualMean),
      expectedMean: Math.round(expectedMean),
      perceptionGap: Math.round((expectedMean - actualMean) / 10),
      misreadShare:
        answers.length === 0
          ? 0
          : Math.round(
              (answers.filter((answer) => Math.abs(answer.roomEstimate - actualMean) >= 200)
                .length /
                answers.length) *
                100,
            ),
      projectionCorrelation:
        correlation === null ? null : Math.round(correlation * 100),
    };
  },
};

const livingConsensusMode: ModeDefinition<
  "living-consensus",
  typeof createLivingConsensusSchema,
  typeof livingConsensusResponseSchema
> = {
  type: "living-consensus",
  label: "Living Consensus",
  tagline: "Turn survey structure into a room-made organism",
  singleResponsePerParticipant: true,
  createSchema: createLivingConsensusSchema,
  responseSchema: livingConsensusResponseSchema,
  buildConfig: (input) => ({
    type: "living-consensus" as const,
    lowLabel: input.lowLabel,
    highLabel: input.highLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "living-consensus" ? null : "Wrong mode.",
  aggregate: (activityId): ActivityAggregate => {
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "living-consensus" }> =>
          payload.type === "living-consensus",
      );
    const values = answers.map((answer) => answer.value);
    const spread = polarization(values);
    const totalConfidence = answers.reduce(
      (sum, answer) => sum + answer.confidence,
      0,
    );
    const confidenceWeightedMean =
      totalConfidence === 0
        ? mean(values)
        : answers.reduce(
            (sum, answer) => sum + answer.value * answer.confidence,
            0,
          ) / totalConfidence;
    return {
      type: "living-consensus",
      total: answers.length,
      values: values.slice(-400),
      mean: Math.round(mean(values)),
      confidenceWeightedMean: Math.round(confidenceWeightedMean),
      confidence: Math.round(mean(answers.map((answer) => answer.confidence))),
      polarization: spread,
      consensus: answers.length === 0 ? null : Math.round((1 - spread) * 100),
    };
  },
};

const futureForkMode: ModeDefinition<
  "future-fork",
  typeof createFutureForkSchema,
  typeof futureForkResponseSchema
> = {
  type: "future-fork",
  label: "Future Fork",
  tagline: "Watch new evidence reorganize the room's forecast",
  singleResponsePerParticipant: true,
  createSchema: createFutureForkSchema,
  responseSchema: futureForkResponseSchema,
  buildConfig: (input) => ({
    type: "future-fork" as const,
    branches: input.branches.map((label) => ({ id: crypto.randomUUID(), label })),
    evidenceDrop: input.evidenceDrop,
    resultsMode: "blind" as const,
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "future-fork" || config.type !== "future-fork") {
      return "Wrong mode.";
    }
    const ids = new Set(config.branches.map((branch) => branch.id));
    if (
      !ids.has(payload.beforeBranchId) ||
      (payload.afterBranchId !== undefined && !ids.has(payload.afterBranchId))
    ) {
      return "That future is not part of this scenario.";
    }
    return null;
  },
  aggregate: (activityId, config): ActivityAggregate => {
    if (config.type !== "future-fork") throw new Error("Config mismatch");
    const ids = new Set(config.branches.map((branch) => branch.id));
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "future-fork" }> =>
          payload.type === "future-fork" &&
          ids.has(payload.beforeBranchId) &&
          (payload.afterBranchId === undefined || ids.has(payload.afterBranchId)),
      );
    const total = answers.length;
    const revised = answers.filter(
      (answer): answer is typeof answer & {
        afterBranchId: string;
        afterLikelihood: number;
      } =>
        answer.afterBranchId !== undefined &&
        answer.afterLikelihood !== undefined,
    );
    const flows = new Map<string, number>();
    for (const answer of revised) {
      if (answer.beforeBranchId === answer.afterBranchId) continue;
      const key = `${answer.beforeBranchId}:${answer.afterBranchId}`;
      flows.set(key, (flows.get(key) ?? 0) + 1);
    }
    return {
      type: "future-fork",
      total,
      revisedTotal: revised.length,
      branches: config.branches.map((branch) => {
        const before = answers.filter((answer) => answer.beforeBranchId === branch.id);
        const after = revised.filter((answer) => answer.afterBranchId === branch.id);
        return {
          id: branch.id,
          label: branch.label,
          beforeShare: total === 0 ? 0 : Math.round((before.length / total) * 100),
          afterShare:
            revised.length === 0
              ? 0
              : Math.round((after.length / revised.length) * 100),
          beforeLikelihood: Math.round(mean(before.map((answer) => answer.beforeLikelihood))),
          afterLikelihood: Math.round(mean(after.map((answer) => answer.afterLikelihood))),
        };
      }),
      flows: [...flows.entries()]
        .map(([key, count]) => {
          const [fromId, toId] = key.split(":");
          return { fromId, toId, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 16),
      changedShare:
        revised.length === 0
          ? 0
          : Math.round(
              (revised.filter((answer) => answer.beforeBranchId !== answer.afterBranchId).length /
                revised.length) *
                100,
            ),
      confidenceShift:
        revised.length === 0
          ? 0
          : Math.round(
              mean(
                revised.map(
                  (answer) => answer.afterLikelihood - answer.beforeLikelihood,
                ),
              ),
            ),
    };
  },
};

const cipherRoomMode: ModeDefinition<
  "cipher-room",
  typeof createCipherRoomSchema,
  typeof cipherRoomResponseSchema
> = {
  type: "cipher-room",
  label: "Cipher Room",
  tagline: "A real Caesar-shift puzzle with a mechanical reveal",
  singleResponsePerParticipant: true,
  createSchema: createCipherRoomSchema,
  responseSchema: cipherRoomResponseSchema,
  buildConfig: (input) => ({
    type: "cipher-room" as const,
    ciphertext: input.ciphertext,
    clue: input.clue,
    correctShift: input.correctShift,
    timeLimitSeconds: input.timeLimitSeconds,
    resultsMode: "blind" as const,
  }),
  validateResponse: (payload) =>
    payload.type === "cipher-room" ? null : "Wrong mode.",
  aggregate: (activityId, config, _state, revealed): ActivityAggregate => {
    if (config.type !== "cipher-room") throw new Error("Config mismatch");
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "cipher-room" }> =>
          payload.type === "cipher-room",
      );
    const distribution = Array.from({ length: 26 }, () => 0);
    for (const answer of answers) distribution[answer.shift] += 1;
    const maximum = Math.max(0, ...distribution);
    const mostCommonShift =
      answers.length === 0 ? null : distribution.findIndex((count) => count === maximum);
    const averageConfidence = Math.round(mean(answers.map((answer) => answer.confidence)));
    if (!revealed || config.correctShift === null) {
      return {
        type: "cipher-room",
        total: answers.length,
        distribution: Array.from({ length: 26 }, () => 0),
        correctShift: null,
        accuracy: null,
        averageConfidence,
        mostCommonShift: null,
        consensus: null,
      };
    }
    return {
      type: "cipher-room",
      total: answers.length,
      distribution,
      correctShift: config.correctShift,
      accuracy:
        answers.length === 0
          ? 0
          : Math.round(
              (answers.filter((answer) => answer.shift === config.correctShift).length /
                answers.length) *
                100,
            ),
      averageConfidence,
      mostCommonShift,
      consensus:
        answers.length === 0
          ? null
          : Math.round((1 - normalizedEntropy(distribution)) * 100),
    };
  },
};

const shadowCouncilMode: ModeDefinition<
  "shadow-council",
  typeof createShadowCouncilSchema,
  typeof shadowCouncilResponseSchema
> = {
  type: "shadow-council",
  label: "Shadow Council",
  tagline: "Allocate suspicion, seal a tribunal, reveal the hidden alias",
  singleResponsePerParticipant: true,
  createSchema: createShadowCouncilSchema,
  responseSchema: shadowCouncilResponseSchema,
  buildConfig: (input) => {
    const aliases = input.aliases.map((label) => ({ id: crypto.randomUUID(), label }));
    return {
      type: "shadow-council" as const,
      aliases,
      evidence: input.evidence,
      shadowAliasId: aliases[input.shadowAliasIndex]?.id ?? null,
      suspicionPoints: 3,
      timeLimitSeconds: input.timeLimitSeconds,
      resultsMode: "blind" as const,
    };
  },
  validateResponse: (payload, config) => {
    if (payload.type !== "shadow-council" || config.type !== "shadow-council") {
      return "Wrong mode.";
    }
    const ids = new Set(config.aliases.map((alias) => alias.id));
    const allocatedIds = new Set(payload.allocations.map((allocation) => allocation.aliasId));
    const totalPoints = payload.allocations.reduce(
      (sum, allocation) => sum + allocation.points,
      0,
    );
    if (
      allocatedIds.size !== payload.allocations.length ||
      payload.allocations.some((allocation) => !ids.has(allocation.aliasId)) ||
      totalPoints !== config.suspicionPoints
    ) {
      return `Allocate exactly ${config.suspicionPoints} suspicion points across valid aliases.`;
    }
    if (!ids.has(payload.banishId)) return "Choose a valid tribunal target.";
    return null;
  },
  aggregate: (activityId, config, _state, revealed): ActivityAggregate => {
    if (config.type !== "shadow-council") throw new Error("Config mismatch");
    const ids = new Set(config.aliases.map((alias) => alias.id));
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "shadow-council" }> =>
          payload.type === "shadow-council" && ids.has(payload.banishId),
      );
    const suspicion = new Map(config.aliases.map((alias) => [alias.id, 0]));
    const banish = new Map(config.aliases.map((alias) => [alias.id, 0]));
    for (const answer of answers) {
      for (const allocation of answer.allocations) {
        if (!ids.has(allocation.aliasId)) continue;
        suspicion.set(
          allocation.aliasId,
          (suspicion.get(allocation.aliasId) ?? 0) + allocation.points,
        );
      }
      banish.set(answer.banishId, (banish.get(answer.banishId) ?? 0) + 1);
    }
    const aliases = config.aliases.map((alias) => ({
      id: alias.id,
      label: alias.label,
      suspicion: revealed ? suspicion.get(alias.id) ?? 0 : 0,
      banishVotes: revealed ? banish.get(alias.id) ?? 0 : 0,
      heat:
        !revealed || answers.length === 0
          ? 0
          : Math.round(
              ((suspicion.get(alias.id) ?? 0) /
                (answers.length * config.suspicionPoints)) *
                100,
            ),
    }));
    return {
      type: "shadow-council",
      total: answers.length,
      aliases,
      shadowAliasId: revealed ? config.shadowAliasId : null,
      accuracy:
        !revealed || config.shadowAliasId === null
          ? null
          : answers.length === 0
            ? 0
            : Math.round(
                (answers.filter((answer) => answer.banishId === config.shadowAliasId).length /
                  answers.length) *
                  100,
              ),
      averageConfidence: Math.round(mean(answers.map((answer) => answer.confidence))),
      tribunalConsensus:
        !revealed || answers.length === 0
          ? null
          : Math.round(
              (1 - normalizedEntropy(config.aliases.map((alias) => banish.get(alias.id) ?? 0))) *
                100,
            ),
    };
  },
};

const chipStackMode: ModeDefinition<
  "chip-stack",
  typeof createChipStackSchema,
  typeof chipStackResponseSchema
> = {
  type: "chip-stack",
  label: "Chip Stack",
  tagline: "Spend a fixed chip budget across the options",
  singleResponsePerParticipant: true,
  createSchema: createChipStackSchema,
  responseSchema: chipStackResponseSchema,
  buildConfig: (input) => ({
    type: "chip-stack" as const,
    resultsMode: input.resultsMode,
    chipsPerPerson: input.chipsPerPerson,
    options: input.options.map((label) => ({
      id: crypto.randomUUID(),
      label,
    })),
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "chip-stack") return "Wrong mode.";
    if (config.type !== "chip-stack") return "Wrong mode.";
    const ids = new Set(config.options.map((option) => option.id));
    if (payload.allocations.length !== config.options.length) {
      return "Score every option, even if you spend zero chips on it.";
    }
    const seen = new Set<string>();
    let total = 0;
    for (const allocation of payload.allocations) {
      if (!ids.has(allocation.optionId) || seen.has(allocation.optionId)) {
        return "Each option can appear once.";
      }
      seen.add(allocation.optionId);
      total += allocation.chips;
    }
    if (total !== config.chipsPerPerson) {
      return `Spend exactly ${config.chipsPerPerson} chips.`;
    }
    return null;
  },
  aggregate: (activityId, config): ActivityAggregate => {
    if (config.type !== "chip-stack") throw new Error("Config mismatch");
    const chips = new Map(config.options.map((option) => [option.id, 0]));
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "chip-stack" }> =>
          payload.type === "chip-stack",
      );
    for (const answer of answers) {
      for (const allocation of answer.allocations) {
        if (!chips.has(allocation.optionId)) continue;
        chips.set(allocation.optionId, (chips.get(allocation.optionId) ?? 0) + allocation.chips);
      }
    }
    const totalChips = [...chips.values()].reduce((sum, value) => sum + value, 0);
    const options = config.options.map((option) => {
      const count = chips.get(option.id) ?? 0;
      return {
        id: option.id,
        label: option.label,
        chips: count,
        share: totalChips === 0 ? 0 : Math.round((count / totalChips) * 1000) / 10,
        average: answers.length === 0 ? 0 : Math.round((count / answers.length) * 10) / 10,
      };
    });
    const maxChips = Math.max(0, ...options.map((option) => option.chips));
    return {
      type: "chip-stack",
      total: answers.length,
      options,
      concentration: budgetConcentration(options.map((option) => option.chips)),
      leaderIds:
        maxChips <= 0
          ? []
          : options.filter((option) => option.chips === maxChips).map((option) => option.id),
    };
  },
};

const overUnderMode: ModeDefinition<
  "over-under",
  typeof createOverUnderSchema,
  typeof overUnderResponseSchema
> = {
  type: "over-under",
  label: "Over / Under",
  tagline: "Bet the room against a published line",
  singleResponsePerParticipant: true,
  createSchema: createOverUnderSchema,
  responseSchema: overUnderResponseSchema,
  buildConfig: (input) => ({
    type: "over-under" as const,
    unit: input.unit,
    line: input.line,
    actual: input.actual,
    timeLimitSeconds: input.timeLimitSeconds,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload, config) => {
    if (payload.type !== "over-under") return "Wrong mode.";
    if (config.type !== "over-under") return "Wrong mode.";
    return null;
  },
  aggregate: (activityId, config, _state, revealed): ActivityAggregate => {
    if (config.type !== "over-under") throw new Error("Config mismatch");
    const answers = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "over-under" }> =>
          payload.type === "over-under",
      );
    const overCount = answers.filter((answer) => answer.side === "over").length;
    const underCount = answers.length - overCount;
    const actual = revealed ? config.actual : null;
    const overWins =
      actual === null ? null : actual > config.line;
    const accuracy =
      overWins === null || answers.length === 0
        ? null
        : Math.round(
            (answers.filter((answer) => (overWins ? answer.side === "over" : answer.side === "under")).length /
              answers.length) *
              100,
          );
    return {
      type: "over-under",
      total: answers.length,
      line: config.line,
      overCount: revealed || config.resultsMode === "live" ? overCount : 0,
      underCount: revealed || config.resultsMode === "live" ? underCount : 0,
      overShare:
        answers.length === 0 || (!revealed && config.resultsMode === "blind")
          ? 0
          : Math.round((overCount / answers.length) * 1000) / 10,
      averageConfidence: Math.round(mean(answers.map((answer) => answer.confidence))),
      actual,
      overWins,
      accuracy,
    };
  },
};

const fistFiveMode: ModeDefinition<
  "fist-five",
  typeof createFistFiveSchema,
  typeof fistFiveResponseSchema
> = {
  type: "fist-five",
  label: "Fist Five",
  tagline: "Hold up a number. The room shows its hands.",
  singleResponsePerParticipant: true,
  createSchema: createFistFiveSchema,
  responseSchema: fistFiveResponseSchema,
  buildConfig: (input) => ({
    type: "fist-five" as const,
    lowLabel: input.lowLabel,
    highLabel: input.highLabel,
    resultsMode: input.resultsMode,
  }),
  validateResponse: (payload) =>
    payload.type === "fist-five" ? null : "Wrong mode.",
  aggregate: (activityId, config): ActivityAggregate => {
    if (config.type !== "fist-five") throw new Error("Config mismatch");
    const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    const values = loadResponses(activityId)
      .map((row) => row.payload)
      .filter(
        (payload): payload is Extract<ResponsePayload, { type: "fist-five" }> =>
          payload.type === "fist-five",
      )
      .map((payload) => Math.max(0, Math.min(5, payload.value)));
    for (const value of values) counts[value] += 1;
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      type: "fist-five",
      total: values.length,
      counts,
      median: median(values),
      mean: values.length === 0 ? null : Math.round((sum / values.length) * 10) / 10,
    };
  },
};

const modes: Record<ActivityType, ModeDefinition<any, any, any>> = {
  "pulse-choice": pulseChoiceMode,
  spectrum: spectrumMode,
  prediction: predictionMode,
  "word-bloom": wordBloomMode,
  "crowd-meter": crowdMeterMode,
  "rank-race": rankRaceMode,
  "hot-take": hotTakeMode,
  "quadrant-drop": quadrantDropMode,
  "question-board": questionBoardMode,
  "before-after": beforeAfterMode,
  "signal-noise": signalNoiseMode,
  "reality-bender": realityBenderMode,
  "living-consensus": livingConsensusMode,
  "future-fork": futureForkMode,
  "cipher-room": cipherRoomMode,
  "shadow-council": shadowCouncilMode,
  "chip-stack": chipStackMode,
  "over-under": overUnderMode,
  "fist-five": fistFiveMode,
};

export function getMode(type: ActivityType) {
  return modes[type] ?? null;
}

export function listModes() {
  return Object.values(modes).map((mode) => ({
    type: mode.type,
    label: mode.label,
    tagline: mode.tagline,
  }));
}

/** Validate a participant response against the mode's schema + config. */
export function validateResponseFor(
  activity: { type: ActivityType; config: ActivityConfig },
  json: unknown,
):
  | { ok: true; payload: ResponsePayload }
  | { ok: false; message: string } {
  const mode = getMode(activity.type);
  if (!mode) return { ok: false, message: "Unknown activity mode." };

  const parsed = mode.responseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid response.",
    };
  }

  const problem = mode.validateResponse(parsed.data, activity.config);
  if (problem) return { ok: false, message: problem };

  return { ok: true, payload: parsed.data };
}

/** Canonical aggregate for an activity; prediction truth gated by reveal. */
export function aggregateActivity(activity: {
  id: string;
  type: ActivityType;
  config: ActivityConfig;
  state: string;
}): ActivityAggregate {
  const mode = getMode(activity.type);
  if (!mode) throw new Error(`No mode registered for ${activity.type}`);
  return mode.aggregate(
    activity.id,
    activity.config,
    activity.state,
    activity.state === "revealed",
  );
}

/** Build stored config from validated host input. */
export function buildActivityConfig(input: {
  type: ActivityType;
}): ActivityConfig {
  const mode = getMode(input.type);
  if (!mode) throw new Error(`No mode registered for ${input.type}`);
  return mode.buildConfig(input);
}
