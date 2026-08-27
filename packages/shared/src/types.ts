// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

export type RoomStatus = "lobby" | "live" | "ended";

export type RoomTheme = "paper" | "signal" | "arcade" | "field" | "midnight";
export const ROOM_THEMES = ["paper", "signal", "arcade", "field"] as const;
export type ParticipantNameMode = "chosen" | "generated";
export type RoomSoundMode = "off" | "soft" | "arcade";

export interface RoomSettings {
  theme: RoomTheme;
  lobbyMessage: string;
  allowReactions: boolean;
  allowLateJoin: boolean;
  showPresence: boolean;
  showResponseCount: boolean;
  participantNames: ParticipantNameMode;
  maxParticipants: number;
  soundMode: RoomSoundMode;
}

export interface PublicParticipant {
  id: string;
  displayName: string;
  avatarSeed: string;
}

export type ActivityState =
  | "draft"
  | "live"
  | "locked"
  | "revealed"
  | "ended";

export interface PublicRoom {
  id: string;
  code: string;
  title: string;
  status: RoomStatus;
  activeActivityId: string | null;
  settings: RoomSettings;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Activity modes
//
// Each mode owns:
//   - a config shape        (what the host defines)
//   - a response payload    (what a participant submits)
//   - an aggregate shape    (canonical server-side result)
// Adding a mode touches: this file, the API mode registry,
// one participant renderer, one stage renderer, one host editor.
// ---------------------------------------------------------------------------

export type ActivityType =
  | "pulse-choice"
  | "spectrum"
  | "prediction"
  | "word-bloom"
  | "crowd-meter"
  | "rank-race"
  | "hot-take"
  | "quadrant-drop"
  | "question-board"
  | "before-after"
  | "signal-noise"
  | "reality-bender"
  | "living-consensus"
  | "future-fork"
  | "cipher-room"
  | "shadow-council"
  | "chip-stack"
  | "over-under"
  | "fist-five";

export type ResultsMode = "live" | "blind";
export type PublicTextModerationMode = "live" | "review";
export type PublicTextStatus = "pending" | "visible" | "hidden";

export interface PulseChoiceOption {
  id: string;
  label: string;
}

export interface PulseChoiceConfig {
  options: PulseChoiceOption[];
  resultsMode: ResultsMode;
  choiceRule: "majority" | "minority";
}

export interface SpectrumConfig {
  lowLabel: string;
  highLabel: string;
  resultsMode: ResultsMode;
}

export interface PredictionConfig {
  unit: string;
  min: number;
  max: number;
  /** Host's hidden true answer; never sent to participants before reveal. */
  answer: number | null;
  resultsMode: ResultsMode;
}

export interface WordBloomConfig {
  maxChars: number;
  resultsMode: ResultsMode;
  moderationMode?: PublicTextModerationMode;
}

/** A term and its aggregate weight in the bloom. */
export interface WordBloomTerm {
  text: string;
  count: number;
}

export interface WordBloomAggregate {
  type: "word-bloom";
  total: number;
  terms: WordBloomTerm[];
  /** Share of entries matching the most repeated complete phrase. */
  chorusShare: number;
  /** Unique normalized phrases divided by visible entries. */
  phraseVariety: number;
  /** Most frequent meaningful token, when one exists. */
  theme: { text: string; count: number } | null;
}

export interface CrowdMeterConfig {
  /** Seconds of rolling window used for intensity. */
  windowSeconds: number;
  resultsMode: "live";
}

export interface RankRaceConfig {
  options: PulseChoiceOption[];
  resultsMode: ResultsMode;
}

export interface HotTakeConfig {
  leftLabel: string;
  rightLabel: string;
  resultsMode: ResultsMode;
}

export interface QuadrantDropConfig {
  xLowLabel: string;
  xHighLabel: string;
  yLowLabel: string;
  yHighLabel: string;
  resultsMode: ResultsMode;
}

export interface QuestionBoardConfig {
  maxChars: number;
  resultsMode: "live";
  moderationMode?: PublicTextModerationMode;
}

export interface BeforeAfterConfig {
  lowLabel: string;
  highLabel: string;
  resultsMode: ResultsMode;
}

export interface SignalNoiseConfig {
  /** Redacted until reveal. */
  correctAnswer: "signal" | "noise" | null;
  explanation: string;
  timeLimitSeconds: number;
  resultsMode: "blind";
}

export interface RealityBenderConfig {
  lowLabel: string;
  highLabel: string;
  resultsMode: "blind";
}

export interface LivingConsensusConfig {
  lowLabel: string;
  highLabel: string;
  resultsMode: ResultsMode;
}

export interface FutureForkConfig {
  branches: PulseChoiceOption[];
  evidenceDrop: string;
  resultsMode: "blind";
}

export interface CipherRoomConfig {
  ciphertext: string;
  clue: string;
  /** Caesar shift. Redacted until reveal. */
  correctShift: number | null;
  timeLimitSeconds: number;
  resultsMode: "blind";
}

export interface ShadowCouncilConfig {
  aliases: PulseChoiceOption[];
  evidence: string;
  /** Hidden identity for this tribunal slice. Redacted until reveal. */
  shadowAliasId: string | null;
  suspicionPoints: number;
  timeLimitSeconds: number;
  resultsMode: "blind";
}

export interface ChipStackConfig {
  options: PulseChoiceOption[];
  /** Exact chip budget each person must spend. */
  chipsPerPerson: number;
  resultsMode: ResultsMode;
}

export interface OverUnderConfig {
  unit: string;
  /** Public number the room bets against. */
  line: number;
  /** Host-sealed outcome. Redacted until reveal. */
  actual: number | null;
  /** 0 means no server clock. */
  timeLimitSeconds: number;
  resultsMode: ResultsMode;
}

export type ActivityConfig =
  | ({ type: "pulse-choice" } & PulseChoiceConfig)
  | ({ type: "spectrum" } & SpectrumConfig)
  | ({ type: "prediction" } & PredictionConfig)
  | ({ type: "word-bloom" } & WordBloomConfig)
  | ({ type: "crowd-meter" } & CrowdMeterConfig)
  | ({ type: "rank-race" } & RankRaceConfig)
  | ({ type: "hot-take" } & HotTakeConfig)
  | ({ type: "quadrant-drop" } & QuadrantDropConfig)
  | ({ type: "question-board" } & QuestionBoardConfig)
  | ({ type: "before-after" } & BeforeAfterConfig)
  | ({ type: "signal-noise" } & SignalNoiseConfig)
  | ({ type: "reality-bender" } & RealityBenderConfig)
  | ({ type: "living-consensus" } & LivingConsensusConfig)
  | ({ type: "future-fork" } & FutureForkConfig)
  | ({ type: "cipher-room" } & CipherRoomConfig)
  | ({ type: "shadow-council" } & ShadowCouncilConfig)
  | ({ type: "chip-stack" } & ChipStackConfig)
  | ({ type: "over-under" } & OverUnderConfig)
  | ({ type: "fist-five" } & FistFiveConfig);

export type ResponsePayload =
  | { type: "pulse-choice"; optionId: string }
  | { type: "spectrum"; value: number } // normalized 0..1000
  | { type: "prediction"; value: number }
  | { type: "word-bloom"; text: string; moderation?: PublicTextStatus }
  // Crowd meter taps carry no payload; the tap itself is the response.
  | { type: "crowd-meter" }
  | { type: "rank-race"; ranks: string[] }
  | { type: "hot-take"; value: number }
  | { type: "quadrant-drop"; x: number; y: number }
  | {
      type: "question-board";
      action: "submit";
      question: string;
      answered?: boolean;
      moderation?: PublicTextStatus;
    }
  | { type: "question-board"; action: "upvote"; questionId: string }
  | { type: "before-after"; before: number; after: number }
  | {
      type: "signal-noise";
      choice: "signal" | "noise";
      confidence: number;
    }
  | { type: "reality-bender"; personal: number; roomEstimate: number }
  | { type: "living-consensus"; value: number; confidence: number }
  | {
      type: "future-fork";
      beforeBranchId: string;
      beforeLikelihood: number;
      afterBranchId?: string;
      afterLikelihood?: number;
    }
  | { type: "cipher-room"; shift: number; confidence: number }
  | {
      type: "shadow-council";
      allocations: Array<{ aliasId: string; points: number }>;
      banishId: string;
      confidence: number;
    }
  | {
      type: "chip-stack";
      allocations: Array<{ optionId: string; chips: number }>;
    }
  | {
      type: "over-under";
      side: "over" | "under";
      confidence: number;
    }
  | { type: "fist-five"; value: number };

export interface Activity {
  id: string;
  roomId: string;
  type: ActivityType;
  prompt: string;
  state: ActivityState;
  config: ActivityConfig;
  deadlineAt: string | null;
  createdAt: string;
}

/** Prediction activity as seen by participants: truth hidden until revealed. */
export type PublicActivity = Omit<Activity, "config"> & {
  config: ActivityConfig;
};

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface PulseChoiceOptionAggregate {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PulseChoiceAggregate {
  type: "pulse-choice";
  total: number;
  options: PulseChoiceOptionAggregate[];
  /** 0 = fully mixed, 100 = all votes agree. Null until the first vote. */
  consensus: number | null;
  /** Populated only after reveal so game-theory rounds cannot be inferred. */
  winnerOptionIds: string[];
}

export interface SpectrumAggregate {
  type: "spectrum";
  total: number;
  /** Normalized 0..1000 values, capped sample for distribution rendering. */
  values: number[];
  median: number;
  /** Normalized population standard deviation. 0 = same position, 1 = max spread. */
  polarization: number;
  /** Inverse of normalized spread, expressed as 0..100. */
  consensus: number | null;
}

export interface PredictionGuess {
  value: number;
}

export interface PredictionAggregate {
  type: "prediction";
  total: number;
  min: number;
  max: number;
  median: number;
  meanAbsoluteError: number | null;
  /** Set only once the activity is revealed and the host supplied an answer. */
  answer: number | null;
  winners: { value: number }[];
  values: number[];
}

export interface CrowdMeterAggregate {
  type: "crowd-meter";
  /** Taps inside the rolling window. */
  recent: number;
  /** Taps per second over the window, rounded. */
  intensity: number;
  total: number;
}

export interface RankRaceAggregate {
  type: "rank-race";
  total: number;
  options: Array<{
    id: string;
    label: string;
    averageRank: number;
    firstPlaceShare: number;
    score: number;
  }>;
}

export interface HotTakeAggregate {
  type: "hot-take";
  total: number;
  /** Sampled signed positions from -1000 (left) to 1000 (right). */
  values: number[];
  average: number;
  leftWeight: number;
  rightWeight: number;
  centerShare: number;
  spread: number;
}

export interface QuadrantDropAggregate {
  type: "quadrant-drop";
  total: number;
  points: Array<{ id: string; x: number; y: number }>;
  centroid: { x: number; y: number } | null;
  quadrantShares: [number, number, number, number];
  outlierCount: number;
}

export interface QuestionBoardAggregate {
  type: "question-board";
  total: number;
  questions: Array<{
    id: string;
    text: string;
    votes: number;
    answered: boolean;
    createdAt: string;
  }>;
}

export interface BeforeAfterAggregate {
  type: "before-after";
  total: number;
  movements: Array<{ id: string; before: number; after: number }>;
  beforeMedian: number;
  afterMedian: number;
  changedShare: number;
  /** Positive means the room became more tightly grouped. */
  convergence: number;
}

export interface SignalNoiseAggregate {
  type: "signal-noise";
  total: number;
  correctAnswer: "signal" | "noise" | null;
  signalCount: number;
  noiseCount: number;
  accuracy: number | null;
  averageConfidence: number;
  calibrationGap: number | null;
  brierScore: number | null;
  highConfidenceWrongShare: number | null;
}

export interface RealityBenderAggregate {
  type: "reality-bender";
  total: number;
  personalValues: number[];
  estimateValues: number[];
  actualMean: number;
  expectedMean: number;
  /** Signed percentage-point error. Positive means the room expected a higher result. */
  perceptionGap: number;
  /** Share whose estimate missed the actual mean by at least 20 points. */
  misreadShare: number;
  /** Pearson correlation between personal belief and room estimate, -100..100. */
  projectionCorrelation: number | null;
}

export interface LivingConsensusAggregate {
  type: "living-consensus";
  total: number;
  values: number[];
  /** Unweighted room position on the normalized 0..1000 scale. */
  mean: number;
  /** Position weighted by each response's stated confidence. */
  confidenceWeightedMean: number;
  confidence: number;
  polarization: number;
  consensus: number | null;
}

export interface FutureForkAggregate {
  type: "future-fork";
  /** Participants who sealed an initial forecast. */
  total: number;
  /** Participants who also completed the post-evidence revision. */
  revisedTotal: number;
  branches: Array<{
    id: string;
    label: string;
    beforeShare: number;
    afterShare: number;
    beforeLikelihood: number;
    afterLikelihood: number;
  }>;
  flows: Array<{ fromId: string; toId: string; count: number }>;
  changedShare: number;
  confidenceShift: number;
}

export interface CipherRoomAggregate {
  type: "cipher-room";
  total: number;
  distribution: number[];
  correctShift: number | null;
  accuracy: number | null;
  averageConfidence: number;
  mostCommonShift: number | null;
  consensus: number | null;
}

export interface ShadowCouncilAggregate {
  type: "shadow-council";
  total: number;
  aliases: Array<{
    id: string;
    label: string;
    suspicion: number;
    banishVotes: number;
    heat: number;
  }>;
  shadowAliasId: string | null;
  accuracy: number | null;
  averageConfidence: number;
  tribunalConsensus: number | null;
}

export interface ChipStackAggregate {
  type: "chip-stack";
  total: number;
  options: Array<{
    id: string;
    label: string;
    chips: number;
    share: number;
    average: number;
  }>;
  /** 0 = even spend, 100 = every chip on one option. Null until chips land. */
  concentration: number | null;
  leaderIds: string[];
}

export interface OverUnderAggregate {
  type: "over-under";
  total: number;
  line: number;
  overCount: number;
  underCount: number;
  overShare: number;
  averageConfidence: number;
  actual: number | null;
  /** True when the sealed outcome finished strictly above the line. */
  overWins: boolean | null;
  accuracy: number | null;
}

export interface FistFiveConfig {
  lowLabel: string;
  highLabel: string;
  resultsMode: ResultsMode;
}

export interface FistFiveAggregate {
  type: "fist-five";
  total: number;
  counts: [number, number, number, number, number, number];
  median: number | null;
  mean: number | null;
}

export type ActivityAggregate =
  | PulseChoiceAggregate
  | SpectrumAggregate
  | PredictionAggregate
  | WordBloomAggregate
  | CrowdMeterAggregate
  | RankRaceAggregate
  | HotTakeAggregate
  | QuadrantDropAggregate
  | QuestionBoardAggregate
  | BeforeAfterAggregate
  | SignalNoiseAggregate
  | RealityBenderAggregate
  | LivingConsensusAggregate
  | FutureForkAggregate
  | CipherRoomAggregate
  | ShadowCouncilAggregate
  | ChipStackAggregate
  | OverUnderAggregate
  | FistFiveAggregate;

export interface RoomMomentum {
  /** Responses per second in the latest five-second window. */
  recentRate: number;
  /** Responses per second in the preceding five-second window. */
  previousRate: number;
  delta: number;
  trend: "building" | "steady" | "cooling";
}

// ---------------------------------------------------------------------------
// Room snapshot + realtime events
// ---------------------------------------------------------------------------

export interface RoomState {
  room: PublicRoom;
  activity: PublicActivity | null;
  aggregate: ActivityAggregate | null;
  participantCount: number;
  onlineCount: number;
  presence: PublicParticipant[];
  responseCount: number;
  momentum: RoomMomentum;
  serverNow: string;
}

export type ReactionKind = "spark" | "flame" | "clap" | "wave" | "bolt";

export interface ReactionBurst {
  kind: ReactionKind;
  count: number;
  /** Server-assigned bucket id so clients can dedupe sampled bursts. */
  bucket: number;
}

export type RoomEvent =
  | { type: "room.snapshot"; state: RoomState }
  | { type: "activity.started"; roomId: string; activityId: string }
  | {
      type: "activity.state";
      roomId: string;
      activityId: string;
      state: Exclude<ActivityState, "draft">;
    }
  | {
      type: "response.created";
      roomId: string;
      activityId: string;
      /** Row count after this write. Omitted for question-board (votes are not voices). */
      responseCount?: number;
    }
  | {
      type: "aggregate.updated";
      roomId: string;
      activityId: string;
      aggregate: ActivityAggregate | null;
      responseCount: number;
      momentum: RoomMomentum;
    }
  | {
      type: "participant.count";
      roomId: string;
      count: number;
    }
  | {
      type: "presence.changed";
      roomId: string;
      onlineCount: number;
      participants: PublicParticipant[];
    }
  | {
      type: "reactions";
      roomId: string;
      burst: ReactionBurst;
    };
