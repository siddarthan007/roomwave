import { describe, expect, test } from "bun:test";

import {
  activityHasFinalResult,
  activityRequiresReveal,
  type ActivityConfig,
} from "../packages/shared/src";

const id = "11111111-1111-1111-1111-111111111111";

const liveConfigs: ActivityConfig[] = [
  { type: "pulse-choice", options: [{ id, label: "A" }], choiceRule: "majority", resultsMode: "live" },
  { type: "spectrum", lowLabel: "Low", highLabel: "High", resultsMode: "live" },
  { type: "word-bloom", maxChars: 24, resultsMode: "live" },
  { type: "crowd-meter", windowSeconds: 15, resultsMode: "live" },
  { type: "rank-race", options: [{ id, label: "A" }], resultsMode: "live" },
  { type: "hot-take", leftLabel: "Left", rightLabel: "Right", resultsMode: "live" },
  { type: "quadrant-drop", xLowLabel: "Low", xHighLabel: "High", yLowLabel: "Low", yHighLabel: "High", resultsMode: "live" },
  { type: "question-board", maxChars: 140, resultsMode: "live" },
  { type: "before-after", lowLabel: "Low", highLabel: "High", resultsMode: "live" },
  { type: "living-consensus", lowLabel: "Low", highLabel: "High", resultsMode: "live" },
  { type: "chip-stack", options: [{ id, label: "A" }, { id: "22222222-2222-2222-2222-222222222222", label: "B" }], chipsPerPerson: 10, resultsMode: "live" },
  { type: "fist-five", lowLabel: "Not yet", highLabel: "Could teach it", resultsMode: "live" },
];

const revealConfigs: ActivityConfig[] = [
  { type: "pulse-choice", options: [{ id, label: "A" }], choiceRule: "minority", resultsMode: "blind" },
  { type: "spectrum", lowLabel: "Low", highLabel: "High", resultsMode: "blind" },
  { type: "prediction", unit: "%", min: 0, max: 100, answer: null, resultsMode: "live" },
  { type: "word-bloom", maxChars: 24, resultsMode: "blind" },
  { type: "rank-race", options: [{ id, label: "A" }], resultsMode: "blind" },
  { type: "hot-take", leftLabel: "Left", rightLabel: "Right", resultsMode: "blind" },
  { type: "quadrant-drop", xLowLabel: "Low", xHighLabel: "High", yLowLabel: "Low", yHighLabel: "High", resultsMode: "blind" },
  { type: "before-after", lowLabel: "Low", highLabel: "High", resultsMode: "blind" },
  { type: "signal-noise", correctAnswer: null, explanation: "", timeLimitSeconds: 20, resultsMode: "blind" },
  { type: "reality-bender", lowLabel: "Low", highLabel: "High", resultsMode: "blind" },
  { type: "living-consensus", lowLabel: "Low", highLabel: "High", resultsMode: "blind" },
  { type: "future-fork", branches: [{ id, label: "A" }], evidenceDrop: "Evidence", resultsMode: "blind" },
  { type: "cipher-room", ciphertext: "B", clue: "", correctShift: null, timeLimitSeconds: 45, resultsMode: "blind" },
  { type: "shadow-council", aliases: [{ id, label: "A" }], evidence: "Evidence", shadowAliasId: null, suspicionPoints: 3, timeLimitSeconds: 60, resultsMode: "blind" },
  { type: "over-under", unit: "%", line: 50, actual: null, timeLimitSeconds: 30, resultsMode: "live" },
  { type: "chip-stack", options: [{ id, label: "A" }], chipsPerPerson: 10, resultsMode: "blind" },
  { type: "fist-five", lowLabel: "Not yet", highLabel: "Could teach it", resultsMode: "blind" },
];

describe("activity reveal policy", () => {
  test("all live-result modes finish when locked without a redundant reveal", () => {
    for (const config of liveConfigs) {
      expect(activityRequiresReveal(config), config.type).toBe(false);
      expect(activityHasFinalResult(config, "locked"), config.type).toBe(true);
    }
  });

  test("blind results and truth games keep an explicit reveal boundary", () => {
    for (const config of revealConfigs) {
      expect(activityRequiresReveal(config), config.type).toBe(true);
      expect(activityHasFinalResult(config, "locked"), config.type).toBe(false);
      expect(activityHasFinalResult(config, "revealed"), config.type).toBe(true);
    }
  });
});
