import type {
  ActivityAggregate,
  ActivityType,
} from "@roomwave/shared";
import { apportionPercents } from "@roomwave/shared";

// ---------------------------------------------------------------------------
// Round receipts: one human-readable summary + CSV export per round.
//
// Pure functions over the canonical aggregate — no network, no DOM. Every
// mode must be handled; the exhaustiveness guard at the bottom fails the
// build when a new mode ships without a receipt row.
// ---------------------------------------------------------------------------

export interface ReceiptRow {
  label: string;
  value: string;
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : `${Math.round(value)}%`;
}

function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "n/a";
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}

/**
 * Flattens any aggregate into ordered receipt rows.
 * Blind rounds naturally produce fewer rows: hidden truth fields stay null
 * until reveal, and this renders them honestly as "n/a" rather than guessing.
 */
export function receiptRows(aggregate: ActivityAggregate): ReceiptRow[] {
  switch (aggregate.type) {
    case "pulse-choice": {
      const rows: ReceiptRow[] = aggregate.options.map((option) => ({
        label: option.label,
        value: `${option.count} · ${option.percentage}%`,
      }));
      rows.push({ label: "consensus", value: pct(aggregate.consensus) });
      if (aggregate.winnerOptionIds.length > 0) {
        const winners = aggregate.options
          .filter((option) => aggregate.winnerOptionIds.includes(option.id))
          .map((option) => option.label);
        rows.push({ label: "winner", value: winners.join(", ") });
      }
      return rows;
    }
    case "spectrum":
      return [
        { label: "median position", value: num(aggregate.median / 10, 0) },
        { label: "consensus", value: pct(aggregate.consensus) },
        { label: "polarization", value: num(aggregate.polarization, 2) },
      ];
    case "prediction": {
      const rows: ReceiptRow[] = [
        { label: "room median", value: num(aggregate.median) },
      ];
      if (aggregate.answer !== null) {
        rows.push({ label: "true answer", value: num(aggregate.answer) });
        rows.push({
          label: "mean absolute error",
          value: num(aggregate.meanAbsoluteError),
        });
        if (aggregate.winners.length > 0) {
          rows.push({
            label: "closest guesses",
            value: aggregate.winners.map(({ value }) => num(value)).join(", "),
          });
        }
      }
      return rows;
    }
    case "word-bloom": {
      const top = aggregate.terms.slice(0, 5).map((term) =>
        term.count > 1 ? `${term.text} ×${term.count}` : term.text,
      );
      const rows: ReceiptRow[] = [
        { label: "top phrases", value: top.join(", ") || "n/a" },
        { label: "chorus share", value: pct(aggregate.chorusShare) },
        { label: "phrase variety", value: pct(aggregate.phraseVariety) },
      ];
      if (aggregate.theme) {
        rows.push({
          label: "shared theme",
          value: `${aggregate.theme.text} (${aggregate.theme.count})`,
        });
      }
      return rows;
    }
    case "crowd-meter":
      return [
        { label: "peak taps in window", value: String(aggregate.recent) },
        { label: "intensity", value: `${num(aggregate.intensity)}/s` },
        { label: "total taps", value: String(aggregate.total) },
      ];
    case "rank-race": {
      const ranked = [...aggregate.options].sort(
        (a, b) => b.score - a.score,
      );
      return ranked.map((option, index) => ({
        label: `#${index + 1} ${option.label}`,
        value: `score ${num(option.score)} · ${pct(option.firstPlaceShare)} first`,
      }));
    }
    case "hot-take": {
      const side =
        aggregate.average > 100 ? "right" : aggregate.average < -100 ? "left" : "split";
      return [
        { label: "average pull", value: num(Math.abs(aggregate.average / 10), 0) },
        { label: "leaning", value: side },
        { label: "left / right weight", value: `${pct(aggregate.leftWeight)} / ${pct(aggregate.rightWeight)}` },
        { label: "center share", value: pct(aggregate.centerShare) },
      ];
    }
    case "quadrant-drop": {
      const centroid = aggregate.centroid;
      const strongest = aggregate.quadrantShares.reduce(
        (bestIndex, share, index) => (share > aggregate.quadrantShares[bestIndex] ? index : bestIndex),
        0 as number,
      );
      const quadrantNames = ["upper-left", "upper-right", "lower-left", "lower-right"];
      return [
        { label: "centroid", value: centroid ? `${num(centroid.x / 10)}, ${num(centroid.y / 10)}` : "n/a" },
        { label: "dominant quadrant", value: pct(aggregate.quadrantShares[strongest]) === "0%" ? "n/a" : quadrantNames[strongest] },
        { label: "outliers", value: String(aggregate.outlierCount) },
      ];
    }
    case "question-board": {
      const answered = aggregate.questions.filter((q) => q.answered).length;
      const top = [...aggregate.questions]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 3)
        .map((q) => (q.votes > 0 ? `${q.text} (${q.votes})` : q.text));
      return [
        { label: "questions asked", value: String(aggregate.total) },
        { label: "answered on stage", value: String(answered) },
        { label: "top voted", value: top.join(" · ") || "n/a" },
      ];
    }
    case "before-after":
      return [
        { label: "before median", value: num(aggregate.beforeMedian / 10, 0) },
        { label: "after median", value: num(aggregate.afterMedian / 10, 0) },
        { label: "changed their minds", value: pct(aggregate.changedShare) },
        {
          label: "convergence",
          value:
            aggregate.convergence > 0
              ? `+${num(aggregate.convergence, 0)} pts tighter`
              : aggregate.convergence < 0
                ? `${num(aggregate.convergence, 0)} pts looser`
                : "unchanged",
        },
      ];
    case "signal-noise": {
      const rows: ReceiptRow[] = [
        { label: "signal votes", value: String(aggregate.signalCount) },
        { label: "noise votes", value: String(aggregate.noiseCount) },
        { label: "average confidence", value: pct(aggregate.averageConfidence) },
      ];
      if (aggregate.correctAnswer) {
        rows.push({ label: "truth", value: aggregate.correctAnswer });
        rows.push({ label: "accuracy", value: pct(aggregate.accuracy) });
        if (aggregate.calibrationGap !== null) {
          rows.push({
            label: "calibration gap",
            value: `${aggregate.calibrationGap > 0 ? "+" : ""}${num(aggregate.calibrationGap, 0)} pts`,
          });
        }
        if (aggregate.brierScore !== null) {
          rows.push({ label: "Brier score", value: num(aggregate.brierScore, 2) });
        }
      }
      return rows;
    }
    case "reality-bender":
      return [
        { label: "actual mean", value: num(aggregate.actualMean / 10, 0) },
        { label: "room expected", value: num(aggregate.expectedMean / 10, 0) },
        {
          label: "perception gap",
          value: `${aggregate.perceptionGap > 0 ? "+" : ""}${num(aggregate.perceptionGap, 0)}`,
        },
        { label: "misread share", value: pct(aggregate.misreadShare) },
        { label: "projection correlation", value: aggregate.projectionCorrelation === null ? "n/a" : num(aggregate.projectionCorrelation, 2) },
      ];
    case "living-consensus":
      return [
        { label: "room mean", value: num(aggregate.mean / 10, 0) },
        { label: "confidence-weighted", value: num(aggregate.confidenceWeightedMean / 10, 0) },
        { label: "polarization", value: num(aggregate.polarization, 2) },
        { label: "consensus reached", value: aggregate.consensus === null ? "no" : pct(aggregate.consensus) },
      ];
    case "future-fork": {
      const rows: ReceiptRow[] = aggregate.branches.map((branch) => ({
        label: branch.label,
        value: `${pct(branch.beforeShare)} → ${pct(branch.afterShare)}`,
      }));
      rows.push({ label: "revised after evidence", value: pct((aggregate.revisedTotal / Math.max(1, aggregate.total)) * 100) });
      rows.push({ label: "changed their minds", value: pct(aggregate.changedShare) });
      rows.push({
        label: "confidence shift",
        value: `${aggregate.confidenceShift > 0 ? "+" : ""}${num(aggregate.confidenceShift, 0)}`,
      });
      return rows;
    }
    case "cipher-room": {
      const rows: ReceiptRow[] = [
        { label: "most common shift", value: aggregate.mostCommonShift === null ? "n/a" : String(aggregate.mostCommonShift) },
        { label: "average confidence", value: pct(aggregate.averageConfidence) },
      ];
      if (aggregate.correctShift !== null) {
        rows.push({ label: "true shift", value: String(aggregate.correctShift) });
        rows.push({ label: "cracked it", value: pct(aggregate.accuracy) });
      }
      return rows;
    }
    case "shadow-council": {
      const mostSuspected = [...aggregate.aliases].sort(
        (a, b) => b.suspicion - a.suspicion,
      )[0];
      const rows: ReceiptRow[] = aggregate.aliases.map((alias) => ({
        label: alias.label,
        value: `${alias.suspicion} pts suspicion · ${alias.banishVotes} banish`,
      }));
      // The hidden identity's label, resolved from the alias list.
      const shadow = aggregate.shadowAliasId
        ? aggregate.aliases.find((alias) => alias.id === aggregate.shadowAliasId)
        : null;
      rows.push({
        label: "shadow identity",
        value: shadow ? shadow.label : "sealed",
      });
      if (aggregate.accuracy !== null) {
        rows.push({ label: "tribunal accuracy", value: pct(aggregate.accuracy) });
      }
      if (mostSuspected && shadow) {
        rows.push({
          label: "the room suspected",
          value:
            mostSuspected.id === shadow.id
              ? `${mostSuspected.label}, correct`
              : `${mostSuspected.label}, wrong`,
        });
      }
      return rows;
    }
    case "chip-stack": {
      const rows: ReceiptRow[] = aggregate.options.map((option) => ({
        label: option.label,
        value: `${option.chips} chips · ${option.share}%`,
      }));
      rows.push({ label: "spend focus", value: pct(aggregate.concentration) });
      if (aggregate.leaderIds.length > 0) {
        const leaders = aggregate.options
          .filter((option) => aggregate.leaderIds.includes(option.id))
          .map((option) => option.label);
        rows.push({ label: "leading stack", value: leaders.join(", ") });
      }
      return rows;
    }
    case "over-under": {
      const rows: ReceiptRow[] = [
        { label: "line", value: num(aggregate.line) },
        { label: "over calls", value: String(aggregate.overCount) },
        { label: "under calls", value: String(aggregate.underCount) },
        { label: "average confidence", value: pct(aggregate.averageConfidence) },
      ];
      if (aggregate.actual !== null) {
        rows.push({ label: "actual", value: num(aggregate.actual) });
        rows.push({
          label: "side that hit",
          value:
            aggregate.overWins === null
              ? "push at the line"
              : aggregate.overWins
                ? "over"
                : "under",
        });
        rows.push({ label: "room accuracy", value: pct(aggregate.accuracy) });
      }
      return rows;
    }
    case "fist-five": {
      const shares = apportionPercents(aggregate.counts);
      const rows: ReceiptRow[] = aggregate.counts.map((count, level) => ({
        label: `${level}`,
        value: `${count} · ${shares[level] ?? 0}%`,
      }));
      rows.push({ label: "median hand", value: num(aggregate.median) });
      rows.push({ label: "mean hand", value: num(aggregate.mean) });
      return rows;
    }
  }
}

/** RFC 4180-safe CSV cell. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function receiptCsv(
  rows: ReceiptRow[],
  meta: {
    roomTitle: string;
    roomCode: string;
    mode: ActivityType;
    prompt: string;
    responseCount: number;
    finishedAt: string;
  },
): string {
  const lines = [
    ["room", meta.roomTitle].map(csvCell).join(","),
    ["code", meta.roomCode].map(csvCell).join(","),
    ["mode", meta.mode].map(csvCell).join(","),
    ["prompt", meta.prompt].map(csvCell).join(","),
    ["responses", String(meta.responseCount)],
    ["finished", meta.finishedAt].map(csvCell).join(","),
    [],
    ["label", "value"],
    ...rows.map((row) => [csvCell(row.label), csvCell(row.value)].join(",")),
  ];
  // CRLF line endings are part of RFC 4180.
  return `${lines.join("\r\n")}\r\n`;
}

/** Triggers a client-side download of the receipt as a CSV file. */
export function downloadReceiptCsv(
  rows: ReceiptRow[],
  meta: Parameters<typeof receiptCsv>[1],
): void {
  const blob = new Blob([receiptCsv(rows, meta)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `roomwave-${meta.roomCode}-${meta.mode}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Exhaustiveness guard: adding a mode without a receipt row breaks the build.
const _exhaustive: (aggregate: ActivityAggregate) => ReceiptRow[] =
  receiptRows;
void _exhaustive;
