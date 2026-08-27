import { z } from "zod";

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const roomSettingsSchema = z.object({
  theme: z.enum(["paper", "signal", "arcade", "field", "midnight"]).default("paper"),
  lobbyMessage: z.string().trim().max(100).default("Find your square. The next round starts here."),
  allowReactions: z.boolean().default(true),
  allowLateJoin: z.boolean().default(true),
  showPresence: z.boolean().default(true),
  showResponseCount: z.boolean().default(true),
  participantNames: z.enum(["chosen", "generated"]).default("chosen"),
  maxParticipants: z.number().int().min(2).max(10_000).default(500),
  soundMode: z.enum(["off", "soft", "arcade"]).default("soft"),
});

const defaultRoomSettings = roomSettingsSchema.parse({});

export const createRoomSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Room title is required")
    .max(100, "Room title is too long"),
  settings: roomSettingsSchema.default(defaultRoomSettings),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * PATCH input: every field optional. Built from a defaults-free shape so
 * absent keys stay absent (Zod v4 keeps applying .default() through
 * .partial()); the route merges parsed fields over stored settings.
 */
export const updateRoomSettingsSchema = z.object({
  theme: z.enum(["paper", "signal", "arcade", "field", "midnight"]).optional(),
  lobbyMessage: z.string().trim().max(100).optional(),
  allowReactions: z.boolean().optional(),
  allowLateJoin: z.boolean().optional(),
  showPresence: z.boolean().optional(),
  showResponseCount: z.boolean().optional(),
  participantNames: z.enum(["chosen", "generated"]).optional(),
  maxParticipants: z.number().int().min(2).max(10_000).optional(),
  soundMode: z.enum(["off", "soft", "arcade"]).optional(),
});

export const joinRoomSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .refine(
      (value) => /^[\p{L}\p{N}][\p{L}\p{N} ._'\-]*$/u.test(value),
      "Use letters, numbers, spaces, apostrophes, dots, or hyphens.",
    )
    .optional(),
  avatarSeed: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
});

// ---------------------------------------------------------------------------
// Activities use one schema per mode, discriminated on `type`.
// ---------------------------------------------------------------------------

const resultsModeSchema = z.enum(["live", "blind"]).default("live");

export const createPulseChoiceSchema = z.object({
  type: z.literal("pulse-choice"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  options: z
    .array(z.string().trim().min(1, "Option cannot be empty").max(80))
    .min(2, "At least two options are required")
    .max(6, "Maximum six options"),
  resultsMode: resultsModeSchema,
  choiceRule: z.enum(["majority", "minority"]).default("majority"),
});

export const createSpectrumSchema = z.object({
  type: z.literal("spectrum"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  lowLabel: z.string().trim().min(1).max(40),
  highLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

// Guessable numeric range: keeps rendering and MAE math sane when a host
// typo would otherwise allow magnitudes near 1e308.
const PREDICTION_VALUE_LIMIT = 1_000_000_000;
const boundedPredictionValue = z.number().finite().min(-PREDICTION_VALUE_LIMIT).max(PREDICTION_VALUE_LIMIT);

export const createPredictionSchema = z
  .object({
    type: z.literal("prediction"),
    prompt: z.string().trim().min(1, "Question is required").max(160),
    unit: z.string().trim().min(1, "Unit is required").max(12),
    min: boundedPredictionValue,
    max: boundedPredictionValue,
    answer: boundedPredictionValue.nullable(),
    resultsMode: resultsModeSchema,
  })
  .refine((data) => data.max > data.min, {
    message: "Max must be greater than min.",
    path: ["max"],
  });

export const createWordBloomSchema = z.object({
  type: z.literal("word-bloom"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  maxChars: z.number().int().min(3).max(60).default(24),
  resultsMode: resultsModeSchema,
  moderationMode: z.enum(["live", "review"]).default("review"),
});

export const createCrowdMeterSchema = z.object({
  type: z.literal("crowd-meter"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  windowSeconds: z.number().int().min(5).max(120).default(15),
  resultsMode: z.literal("live").default("live"),
});

export const createRankRaceSchema = z.object({
  type: z.literal("rank-race"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  options: z
    .array(z.string().trim().min(1, "Option cannot be empty").max(80))
    .min(3, "At least three options are required")
    .max(8, "Maximum eight options"),
  resultsMode: resultsModeSchema,
});

export const createHotTakeSchema = z.object({
  type: z.literal("hot-take"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  leftLabel: z.string().trim().min(1).max(40),
  rightLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

export const createQuadrantDropSchema = z.object({
  type: z.literal("quadrant-drop"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  xLowLabel: z.string().trim().min(1).max(40),
  xHighLabel: z.string().trim().min(1).max(40),
  yLowLabel: z.string().trim().min(1).max(40),
  yHighLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

export const createQuestionBoardSchema = z.object({
  type: z.literal("question-board"),
  prompt: z.string().trim().min(1, "Board prompt is required").max(160),
  maxChars: z.number().int().min(20).max(240).default(140),
  resultsMode: z.literal("live").default("live"),
  moderationMode: z.enum(["live", "review"]).default("review"),
});

export const createBeforeAfterSchema = z.object({
  type: z.literal("before-after"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  lowLabel: z.string().trim().min(1).max(40),
  highLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

export const createSignalNoiseSchema = z.object({
  type: z.literal("signal-noise"),
  prompt: z.string().trim().min(1, "Statement is required").max(160),
  correctAnswer: z.enum(["signal", "noise"]),
  explanation: z.string().trim().max(180).default(""),
  timeLimitSeconds: z.number().int().min(5).max(120).default(20),
  resultsMode: z.literal("blind").default("blind"),
});

export const createRealityBenderSchema = z.object({
  type: z.literal("reality-bender"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  lowLabel: z.string().trim().min(1).max(40),
  highLabel: z.string().trim().min(1).max(40),
  resultsMode: z.literal("blind").default("blind"),
});

export const createLivingConsensusSchema = z.object({
  type: z.literal("living-consensus"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  lowLabel: z.string().trim().min(1).max(40),
  highLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

export const createFutureForkSchema = z.object({
  type: z.literal("future-fork"),
  prompt: z.string().trim().min(1, "Scenario is required").max(160),
  branches: z
    .array(z.string().trim().min(1, "Branch cannot be empty").max(60))
    .min(2, "At least two futures are required")
    .max(6, "Maximum six futures"),
  evidenceDrop: z.string().trim().min(1, "New information is required").max(200),
  resultsMode: z.literal("blind").default("blind"),
});

export const createCipherRoomSchema = z.object({
  type: z.literal("cipher-room"),
  prompt: z.string().trim().min(1, "Challenge prompt is required").max(160),
  ciphertext: z.string().trim().min(1, "Ciphertext is required").max(160),
  clue: z.string().trim().max(160).default(""),
  correctShift: z.number().int().min(0).max(25),
  timeLimitSeconds: z.number().int().min(10).max(180).default(45),
  resultsMode: z.literal("blind").default("blind"),
});

export const createShadowCouncilSchema = z
  .object({
    type: z.literal("shadow-council"),
    prompt: z.string().trim().min(1, "Tribunal prompt is required").max(160),
    aliases: z
      .array(z.string().trim().min(1, "Alias cannot be empty").max(24))
      .min(3, "At least three aliases are required")
      .max(6, "Maximum six aliases"),
    shadowAliasIndex: z.number().int().min(0),
    evidence: z.string().trim().min(1, "Evidence is required").max(200),
    timeLimitSeconds: z.number().int().min(10).max(180).default(60),
    resultsMode: z.literal("blind").default("blind"),
  })
  .superRefine((data, ctx) => {
    if (data.shadowAliasIndex >= data.aliases.length) {
      ctx.addIssue({
        code: "custom",
        message: "The hidden identity must match one of the aliases.",
        path: ["shadowAliasIndex"],
      });
    }
    if (new Set(data.aliases.map((alias) => alias.toLocaleLowerCase())).size !== data.aliases.length) {
      ctx.addIssue({
        code: "custom",
        message: "Aliases must be unique.",
        path: ["aliases"],
      });
    }
  });

export const CHIP_STACK_BUDGET_MIN = 1;
export const CHIP_STACK_BUDGET_MAX = 9_999;

export const createChipStackSchema = z.object({
  type: z.literal("chip-stack"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  options: z
    .array(z.string().trim().min(1, "Option cannot be empty").max(80))
    .min(2, "At least two options are required")
    .max(6, "Maximum six options"),
  chipsPerPerson: z
    .number()
    .int()
    .min(CHIP_STACK_BUDGET_MIN)
    .max(CHIP_STACK_BUDGET_MAX)
    .default(10),
  resultsMode: resultsModeSchema,
});

export const createOverUnderSchema = z.object({
  type: z.literal("over-under"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  unit: z.string().trim().min(1, "Unit is required").max(12),
  line: boundedPredictionValue,
  actual: boundedPredictionValue.nullable(),
  timeLimitSeconds: z.number().int().min(0).max(180).default(30),
  resultsMode: resultsModeSchema,
});

export const createFistFiveSchema = z.object({
  type: z.literal("fist-five"),
  prompt: z.string().trim().min(1, "Question is required").max(160),
  lowLabel: z.string().trim().min(1).max(40),
  highLabel: z.string().trim().min(1).max(40),
  resultsMode: resultsModeSchema,
});

export const createActivitySchema = z.discriminatedUnion("type", [
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
]);

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export function validateCreateActivity(json: unknown) {
  return createActivitySchema.safeParse(json);
}

// ---------------------------------------------------------------------------
// Responses are validated against the activity's own mode on the server.
// ---------------------------------------------------------------------------

export const pulseChoiceResponseSchema = z.object({
  type: z.literal("pulse-choice"),
  optionId: z.string().uuid(),
});

/** Normalized integer 0..1000 so storage stays resolution-stable. */
const normalizedValue = z
  .number()
  .int("Value must be an integer")
  .min(0)
  .max(1000);

export const spectrumResponseSchema = z.object({
  type: z.literal("spectrum"),
  value: normalizedValue,
});

export const predictionResponseSchema = z.object({
  type: z.literal("prediction"),
  value: z.number().finite(),
});

export const wordBloomResponseSchema = z.object({
  type: z.literal("word-bloom"),
  text: z
    .string()
    .trim()
    .min(1)
    .max(60)
    // Strip control characters that would poison the bloom layout.
    .refine(
      (text) => !/[\u0000-\u001f\u007f]/.test(text),
      "Control characters are not allowed.",
    )
    .refine(
      (text) => !/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/i.test(text),
      "Hidden formatting characters are not allowed.",
    ),
});

/** Crowd meter taps carry no payload; the tap itself is the response. */
export const crowdMeterResponseSchema = z.object({
  type: z.literal("crowd-meter"),
});

export const rankRaceResponseSchema = z.object({
  type: z.literal("rank-race"),
  ranks: z.array(z.string().uuid()).min(3).max(8),
});

export const hotTakeResponseSchema = z.object({
  type: z.literal("hot-take"),
  value: z.number().int().min(-1000).max(1000),
});

export const quadrantDropResponseSchema = z.object({
  type: z.literal("quadrant-drop"),
  x: normalizedValue,
  y: normalizedValue,
});

const safePublicText = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (text) => !/[\u0000-\u001f\u007f]/.test(text),
    "Control characters are not allowed.",
  )
  .refine(
    (text) => !/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/i.test(text),
    "Hidden formatting characters are not allowed.",
  );

export const questionBoardResponseSchema = z.discriminatedUnion("action", [
  z.object({
    type: z.literal("question-board"),
    action: z.literal("submit"),
    question: safePublicText,
  }),
  z.object({
    type: z.literal("question-board"),
    action: z.literal("upvote"),
    questionId: z.string().uuid(),
  }),
]);

export const beforeAfterResponseSchema = z.object({
  type: z.literal("before-after"),
  before: normalizedValue,
  after: normalizedValue,
});

export const signalNoiseResponseSchema = z.object({
  type: z.literal("signal-noise"),
  choice: z.enum(["signal", "noise"]),
  confidence: z.number().int().min(50).max(100),
});

export const realityBenderResponseSchema = z.object({
  type: z.literal("reality-bender"),
  personal: normalizedValue,
  roomEstimate: normalizedValue,
});

export const livingConsensusResponseSchema = z.object({
  type: z.literal("living-consensus"),
  value: normalizedValue,
  confidence: z.number().int().min(0).max(100),
});

const likelihoodValue = z.number().int().min(0).max(100);

export const futureForkResponseSchema = z
  .object({
    type: z.literal("future-fork"),
    beforeBranchId: z.string().uuid(),
    beforeLikelihood: likelihoodValue,
    afterBranchId: z.string().uuid().optional(),
    afterLikelihood: likelihoodValue.optional(),
  })
  .refine(
    (data) =>
      (data.afterBranchId === undefined) ===
      (data.afterLikelihood === undefined),
    {
      message: "A revised branch and likelihood must be submitted together.",
      path: ["afterBranchId"],
    },
  );

export const cipherRoomResponseSchema = z.object({
  type: z.literal("cipher-room"),
  shift: z.number().int().min(0).max(25),
  confidence: z.number().int().min(0).max(100),
});

export const shadowCouncilResponseSchema = z.object({
  type: z.literal("shadow-council"),
  allocations: z
    .array(
      z.object({
        aliasId: z.string().uuid(),
        points: z.number().int().min(1).max(3),
      }),
    )
    .min(1)
    .max(3),
  banishId: z.string().uuid(),
  confidence: z.number().int().min(50).max(100),
});

export const chipStackResponseSchema = z.object({
  type: z.literal("chip-stack"),
  allocations: z
    .array(
      z.object({
        optionId: z.string().uuid(),
        chips: z.number().int().min(0).max(CHIP_STACK_BUDGET_MAX),
      }),
    )
    .min(2)
    .max(6),
});

export const overUnderResponseSchema = z.object({
  type: z.literal("over-under"),
  side: z.enum(["over", "under"]),
  confidence: z.number().int().min(50).max(100),
});

export const fistFiveResponseSchema = z.object({
  type: z.literal("fist-five"),
  value: z.number().int().min(0).max(5),
});

export const submitResponseSchema = z.discriminatedUnion("type", [
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
]);

// ---------------------------------------------------------------------------
// Reactions (ephemeral, rate-limited server-side)
// ---------------------------------------------------------------------------

export const reactionKinds = [
  "spark",
  "flame",
  "clap",
  "wave",
  "bolt",
] as const;

export const sendReactionSchema = z.object({
  kind: z.enum(reactionKinds),
});
