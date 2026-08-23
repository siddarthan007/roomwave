import type { ActivityState, ActivityType, RoomSettings } from "@roomwave/shared";
import { activityRequiresReveal } from "@roomwave/shared";

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { motion } from "motion/react";

import { useRoom } from "../hooks/use-room";
import {
  activityAction,
  createActivity,
  getModerationQueue,
  getRoomState,
  setModerationStatus,
  setQuestionAnswered,
  updateRoomSettings,
  type CreateActivityPayload,
  type ModerationItem,
} from "../lib/api";
import { getHostToken } from "../lib/storage";
import {
  BlockButton,
  ErrorNote,
  Field,
  Kicker,
} from "../components/ui";
import { onSurface } from "../components/surface-color";
import { PixelAvatar } from "../components/PixelAvatar";
import { RoundClock } from "../components/RoundClock";
import { SoundToggle } from "../components/SoundToggle";
import { playRoomSound } from "../lib/sound";

type DraftType = ActivityType;

const MODES: {
  type: DraftType;
  label: string;
  tagline: string;
  color: string;
}[] = [
  {
    type: "pulse-choice",
    label: "Pulse Choice",
    tagline: "Options claim lanes as votes land",
    color: "var(--red)",
  },
  {
    type: "spectrum",
    label: "Spectrum",
    tagline: "The room places itself on a rail",
    color: "var(--blue)",
  },
  {
    type: "prediction",
    label: "Prediction Battle",
    tagline: "Guess before the truth lands",
    color: "var(--violet)",
  },
  {
    type: "word-bloom",
    label: "Word Bloom",
    tagline: "A shared typographic field grows live",
    color: "var(--orange)",
  },
  {
    type: "crowd-meter",
    label: "Crowd Meter",
    tagline: "Turn rapid taps into room pressure",
    color: "var(--green)",
  },
  {
    type: "rank-race",
    label: "Rank Race",
    tagline: "Drag priorities into a room-wide race",
    color: "var(--yellow)",
  },
  {
    type: "hot-take",
    label: "Hot Take Duel",
    tagline: "Pull the room toward one side",
    color: "var(--pink)",
  },
  {
    type: "quadrant-drop",
    label: "Quadrant Drop",
    tagline: "Place the room on two dimensions",
    color: "var(--blue)",
  },
  {
    type: "question-board",
    label: "Question Board",
    tagline: "Questions become a live stage queue",
    color: "var(--orange)",
  },
  {
    type: "before-after",
    label: "Before / After",
    tagline: "Make changed minds visible",
    color: "var(--violet)",
  },
  {
    type: "signal-noise",
    label: "Signal / Noise",
    tagline: "Back your instinct before the clock closes",
    color: "var(--red)",
  },
  {
    type: "reality-bender",
    label: "Reality Bender",
    tagline: "Expose the gap between belief and belief-about-belief",
    color: "var(--violet)",
  },
  {
    type: "living-consensus",
    label: "Living Consensus",
    tagline: "Build a room-made data organism",
    color: "var(--green)",
  },
  {
    type: "future-fork",
    label: "Future Fork",
    tagline: "Let one new fact reroute the room",
    color: "var(--blue)",
  },
  {
    type: "cipher-room",
    label: "Cipher Room",
    tagline: "Crack a real Caesar shift together",
    color: "var(--yellow)",
  },
  {
    type: "shadow-council",
    label: "Shadow Council",
    tagline: "Allocate suspicion and seal a tribunal",
    color: "var(--red)",
  },
];

const GAME_TYPES = new Set<ActivityType>([
  "signal-noise",
  "cipher-room",
  "shadow-council",
]);

const FORCED_BLIND_TYPES = new Set<ActivityType>([
  "signal-noise",
  "reality-bender",
  "future-fork",
  "cipher-room",
  "shadow-council",
]);

const ALWAYS_LIVE_TYPES = new Set<ActivityType>([
  "crowd-meter",
  "question-board",
]);

function lockActionLabel(type: ActivityType) {
  if (type === "crowd-meter") return "stop the meter";
  if (type === "question-board") return "close the board";
  if (type === "word-bloom") return "close the bloom";
  if (type === "future-fork") return "close forecasts";
  if (type === "shadow-council") return "close tribunal";
  if (type === "cipher-room") return "close guesses";
  return "lock answers";
}

function revealActionLabel(type: ActivityType) {
  if (type === "prediction") return "show the truth";
  if (type === "signal-noise") return "reveal the signal";
  if (type === "reality-bender") return "bend reality";
  if (type === "future-fork") return "show the fork";
  if (type === "cipher-room") return "turn the wheel";
  if (type === "shadow-council") return "break the seal";
  return "reveal results";
}

function reopenActionLabel(type: ActivityType) {
  if (type === "crowd-meter") return "resume meter";
  if (type === "question-board") return "reopen board";
  if (GAME_TYPES.has(type)) return "restart clock";
  return "reopen answers";
}

/** Host-side counter with the same arrival kick as the stage. */
function HostCounter({ value }: { value: number }) {
  return (
    <motion.p
      key={value}
      initial={value === 0 ? false : { scale: 1.2, color: "var(--red)" }}
      animate={{ scale: 1, color: "var(--ink)" }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="display shrink-0 text-6xl tabular-nums"
    >
      {value}
    </motion.p>
  );
}

export function HostPage() {
  const { roomId } = useParams();
  const { state, setState, error: roomError } = useRoom(roomId ?? "");
  const arrival = state?.responseCount ?? 0;

  const [mode, setMode] = useState<DraftType>("pulse-choice");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const [choiceRule, setChoiceRule] = useState<"majority" | "minority">(
    "majority",
  );
  const [lowLabel, setLowLabel] = useState("");
  const [highLabel, setHighLabel] = useState("");
  const [unit, setUnit] = useState("%");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("100");
  const [answer, setAnswer] = useState("");
  const [maxChars, setMaxChars] = useState("28");
  const [questionMaxChars, setQuestionMaxChars] = useState("140");
  const [windowSeconds, setWindowSeconds] = useState("15");
  const [xLowLabel, setXLowLabel] = useState("Low effort");
  const [xHighLabel, setXHighLabel] = useState("High effort");
  const [yLowLabel, setYLowLabel] = useState("Low impact");
  const [yHighLabel, setYHighLabel] = useState("High impact");
  const [resultsMode, setResultsMode] = useState<"live" | "blind">("live");
  const [reviewPublicText, setReviewPublicText] = useState(true);
  const [correctAnswer, setCorrectAnswer] = useState<"signal" | "noise">("signal");
  const [explanation, setExplanation] = useState("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("20");
  const [evidenceDrop, setEvidenceDrop] = useState("");
  const [ciphertext, setCiphertext] = useState("WKLV LV D WHVW");
  const [cipherClue, setCipherClue] = useState("Rotate the alphabet backward.");
  const [cipherShift, setCipherShift] = useState("3");
  const [shadowAliasIndex, setShadowAliasIndex] = useState("0");
  const [settingsDraft, setSettingsDraft] = useState<RoomSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moderationItems, setModerationItems] = useState<ModerationItem[]>([]);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const roomCode = state?.room.code;
  const moderationActivityId =
    state?.activity &&
    (state.activity.type === "word-bloom" ||
      state.activity.type === "question-board")
      ? state.activity.id
      : null;
  const cleanedOptions = options.map((option) => option.trim()).filter(Boolean);
  const numericMin = Number(min);
  const numericMax = Number(max);
  const numericAnswer = answer.trim() === "" ? null : Number(answer);
  const isFinitePrediction =
    Number.isFinite(numericMin) &&
    Number.isFinite(numericMax) &&
    numericMax > numericMin &&
    (numericAnswer === null || Number.isFinite(numericAnswer));
  const hasAxisLabels = [lowLabel, highLabel].every((label) => label.trim());
  const numericTimeLimit = Number(timeLimitSeconds);
  const validTimedRound =
    Number.isInteger(numericTimeLimit) && numericTimeLimit >= 10 && numericTimeLimit <= 180;
  const numericCipherShift = Number(cipherShift);
  const hasQuadrantLabels = [
    xLowLabel,
    xHighLabel,
    yLowLabel,
    yHighLabel,
  ].every((label) => label.trim());
  const launchReady =
    Boolean(prompt.trim()) &&
    (mode !== "pulse-choice" || cleanedOptions.length >= 2) &&
    (mode !== "rank-race" || cleanedOptions.length >= 3) &&
    (mode !== "future-fork" ||
      (cleanedOptions.length >= 2 && Boolean(evidenceDrop.trim()))) &&
    (mode !== "shadow-council" ||
      (cleanedOptions.length >= 3 &&
        Number.isInteger(Number(shadowAliasIndex)) &&
        Number(shadowAliasIndex) >= 0 &&
        Number(shadowAliasIndex) < cleanedOptions.length &&
        Boolean(evidenceDrop.trim()) &&
        validTimedRound)) &&
    (!(mode === "spectrum" ||
      mode === "hot-take" ||
      mode === "before-after" ||
      mode === "reality-bender" ||
      mode === "living-consensus") ||
      hasAxisLabels) &&
    (mode !== "prediction" || (Boolean(unit.trim()) && isFinitePrediction)) &&
    (mode !== "quadrant-drop" || hasQuadrantLabels) &&
    (mode !== "word-bloom" ||
      (Number.isInteger(Number(maxChars)) && Number(maxChars) >= 3 && Number(maxChars) <= 60)) &&
    (mode !== "question-board" ||
      (Number.isInteger(Number(questionMaxChars)) && Number(questionMaxChars) >= 20 && Number(questionMaxChars) <= 240)) &&
    (mode !== "crowd-meter" ||
      (Number.isInteger(Number(windowSeconds)) && Number(windowSeconds) >= 5 && Number(windowSeconds) <= 120)) &&
    (mode !== "signal-noise" ||
      (Number.isInteger(Number(timeLimitSeconds)) &&
        Number(timeLimitSeconds) >= 5 &&
        Number(timeLimitSeconds) <= 120)) &&
    (mode !== "cipher-room" ||
      (Boolean(ciphertext.trim()) &&
        Number.isInteger(numericCipherShift) &&
        numericCipherShift >= 0 &&
        numericCipherShift <= 25 &&
        validTimedRound));

  if (!roomId) throw new Error("Room ID missing");

  useEffect(() => {
    if (!roomCode) return;
    const base =
      (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(
        /\/$/,
        "",
      ) ?? window.location.origin;
    void QRCode.toDataURL(`${base}/join/${roomCode}`, {
      width: 200,
      margin: 1,
      color: { dark: "#17150f", light: "#f4efe3" },
    }).then(setQr).catch(() => setQr(""));
  }, [roomCode]);

  useEffect(() => {
    if (!moderationActivityId) return;
    const hostToken = getHostToken(roomId);
    if (!hostToken) return;
    let active = true;
    const load = async () => {
      try {
        const queue = await getModerationQueue(moderationActivityId, hostToken);
        if (active) setModerationItems(queue.items);
      } catch {
        // Canonical room controls stay usable if the review poll misses a beat.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 1_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [moderationActivityId, roomId]);

  async function launch() {
    const hostToken = getHostToken(roomId!);
    if (!hostToken || !state) {
      setError("Host access is missing on this device. Create a new room here.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      let payload: CreateActivityPayload;
      if (mode === "pulse-choice") {
        payload = {
          type: mode,
          prompt,
          options: options.map((o) => o.trim()).filter(Boolean),
          resultsMode,
          choiceRule,
        };
      } else if (mode === "spectrum") {
        payload = { type: mode, prompt, lowLabel, highLabel, resultsMode };
      } else if (mode === "prediction") {
        payload = {
          type: mode,
          prompt,
          unit,
          min: numericMin,
          max: numericMax,
          answer: numericAnswer,
          resultsMode,
        };
      } else if (mode === "word-bloom") {
        payload = {
          type: mode,
          prompt,
          maxChars: Number(maxChars),
          resultsMode,
          moderationMode: reviewPublicText ? "review" : "live",
        };
      } else if (mode === "crowd-meter") {
        payload = {
          type: mode,
          prompt,
          windowSeconds: Number(windowSeconds),
          resultsMode: "live",
        };
      } else if (mode === "rank-race") {
        payload = {
          type: mode,
          prompt,
          options: options.map((option) => option.trim()).filter(Boolean),
          resultsMode,
        };
      } else if (mode === "hot-take") {
        payload = {
          type: mode,
          prompt,
          leftLabel: lowLabel,
          rightLabel: highLabel,
          resultsMode,
        };
      } else if (mode === "quadrant-drop") {
        payload = {
          type: mode,
          prompt,
          xLowLabel,
          xHighLabel,
          yLowLabel,
          yHighLabel,
          resultsMode,
        };
      } else if (mode === "question-board") {
        payload = {
          type: mode,
          prompt,
          maxChars: Number(questionMaxChars),
          resultsMode: "live",
          moderationMode: reviewPublicText ? "review" : "live",
        };
      } else if (mode === "signal-noise") {
        payload = {
          type: mode,
          prompt,
          correctAnswer,
          explanation,
          timeLimitSeconds: Number(timeLimitSeconds),
          resultsMode: "blind",
        };
      } else if (mode === "reality-bender") {
        payload = {
          type: mode,
          prompt,
          lowLabel,
          highLabel,
          resultsMode: "blind",
        };
      } else if (mode === "living-consensus") {
        payload = {
          type: mode,
          prompt,
          lowLabel,
          highLabel,
          resultsMode,
        };
      } else if (mode === "future-fork") {
        payload = {
          type: mode,
          prompt,
          branches: cleanedOptions,
          evidenceDrop,
          resultsMode: "blind",
        };
      } else if (mode === "cipher-room") {
        payload = {
          type: mode,
          prompt,
          ciphertext,
          clue: cipherClue,
          correctShift: numericCipherShift,
          timeLimitSeconds: numericTimeLimit,
          resultsMode: "blind",
        };
      } else if (mode === "shadow-council") {
        payload = {
          type: mode,
          prompt,
          aliases: cleanedOptions,
          shadowAliasIndex: Number(shadowAliasIndex),
          evidence: evidenceDrop,
          timeLimitSeconds: numericTimeLimit,
          resultsMode: "blind",
        };
      } else {
        payload = {
          type: mode,
          prompt,
          lowLabel,
          highLabel,
          resultsMode,
        };
      }

      const activity = await createActivity(roomId!, hostToken, payload);
      await activityAction(activity.id, "start", hostToken);
      playRoomSound(state.room.settings.soundMode, "ready");
      setState(await getRoomState(roomId!));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: "lock" | "reopen" | "reveal" | "reset" | "end",
  ) {
    const hostToken = getHostToken(roomId ?? "");
    const activityId = state?.activity?.id;
    if (!hostToken || !activityId) {
      setError("Host access is missing or the round is no longer active.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await activityAction(activityId, action, hostToken);
      playRoomSound(
        state?.room.settings.soundMode ?? "off",
        action === "reveal" ? "reveal" : action === "lock" ? "lock" : "ready",
      );
      setState(await getRoomState(roomId ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    const hostToken = getHostToken(roomId ?? "");
    if (!hostToken || !settingsDraft) return;
    setBusy(true);
    setError("");
    try {
      await updateRoomSettings(roomId!, hostToken, settingsDraft);
      setState(await getRoomState(roomId!));
      setSettingsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Room settings did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function copyJoinLink() {
    if (!state) return;
    const url = `${window.location.origin}/join/${state.room.code}`;
    try {
      await navigator.clipboard.writeText(
        `Join ${state.room.title} on Roomwave: ${url}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the invite. Copy the room code instead.");
    }
  }

  async function toggleQuestion(questionId: string, answered: boolean) {
    const hostToken = getHostToken(roomId ?? "");
    const activityId = state?.activity?.id;
    if (!hostToken || !activityId) return;
    setBusy(true);
    setError("");
    try {
      await setQuestionAnswered(activityId, questionId, answered, hostToken);
      setState(await getRoomState(roomId ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Question update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function moderateText(
    responseId: string,
    status: "visible" | "hidden",
  ) {
    const hostToken = getHostToken(roomId ?? "");
    const activityId = state?.activity?.id;
    if (!hostToken || !activityId) return;
    setBusy(true);
    setError("");
    try {
      await setModerationStatus(activityId, responseId, status, hostToken);
      const queue = await getModerationQueue(activityId, hostToken);
      setModerationItems(queue.items);
      setState(await getRoomState(roomId ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Text review failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        {roomError ? (
          <div className="max-w-md space-y-5">
            <ErrorNote message={roomError} />
            <Link to="/" className="display sweep-underline inline-block text-3xl">
              Back home
            </Link>
          </div>
        ) : (
          <p className="mono-tag">loading studio…</p>
        )}
      </main>
    );
  }

  const activity = state.activity;
  const phase: ActivityState | null = activity?.state ?? null;
  const revealRequired = activity
    ? activityRequiresReveal(activity.config)
    : false;

  return (
    <main
      className="safe-page safe-gutters safe-top mx-auto min-h-screen max-w-5xl px-5 py-10"
      data-room-theme={state.room.settings.theme}
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Kicker color="var(--red)">host studio · {state.room.title}</Kicker>
          <Link
            to={`/stage/${state.room.id}`}
            className="display sweep-underline mt-2 inline-block text-4xl"
            data-active="true"
          >
            Open Stage ↗
          </Link>
          <p className="mono-tag mt-3">
            code {state.room.code} · {state.participantCount} joined · {state.onlineCount} online
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={() => void copyJoinLink()}
              className="mono-tag sweep-underline text-[var(--blue)]"
            >
              {copied ? "invite copied" : "copy participant invite"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsDraft(state.room.settings);
                setSettingsOpen((open) => !open);
              }}
              className="mono-tag sweep-underline text-[var(--red)]"
            >
              {settingsOpen ? "close room rules" : "room rules"}
            </button>
          </div>
          {state.presence.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Players online">
              {state.presence.slice(0, 12).map((participant) => (
                <div key={participant.id} title={participant.displayName} className="-mr-1">
                  <PixelAvatar seed={participant.avatarSeed} size={34} />
                </div>
              ))}
              {state.onlineCount > 12 && (
                <span className="mono-tag ml-2">+{state.onlineCount - 12}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-4">
          <SoundToggle mode={state.room.settings.soundMode} />
          {qr && (
            <img
              src={qr}
              alt="Join room QR code"
              className="h-28 w-28 border-2 border-[var(--ink)] block-shadow-sm"
            />
          )}
        </div>
      </header>

      {(error || roomError) && (
        <div className="mt-6">
          <ErrorNote message={error || roomError} />
        </div>
      )}

      {settingsOpen && settingsDraft && (
        <section className="mt-8 border-3 border-[var(--ink)] bg-white p-5 block-shadow sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Kicker color="var(--red)">room rules</Kicker>
              <h2 className="display mt-2 text-3xl">Set the room's behavior</h2>
            </div>
            <p className="max-w-xs text-sm text-[var(--ink-soft)]">
              Curated choices keep the stage legible. Changes reach every connected screen.
            </p>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field
              label="lobby line"
              value={settingsDraft.lobbyMessage}
              maxLength={100}
              onChange={(lobbyMessage) => setSettingsDraft({ ...settingsDraft, lobbyMessage })}
            />
            <Field
              label="room capacity"
              type="number"
              value={String(settingsDraft.maxParticipants)}
              onChange={(value) =>
                setSettingsDraft({
                  ...settingsDraft,
                  maxParticipants: Math.max(2, Math.min(10_000, Number(value) || 2)),
                })
              }
            />
          </div>

          <fieldset className="mt-6">
            <legend className="mono-tag text-[var(--ink-soft)]">stage palette</legend>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["paper", "signal", "midnight", "field"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setSettingsDraft({ ...settingsDraft, theme })}
                  className={`theme-chip min-h-16 border-2 border-[var(--ink)] px-3 text-left font-black uppercase block-shadow-sm ${settingsDraft.theme === theme ? "is-active" : ""}`}
                  data-preview-theme={theme}
                >
                  {theme}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {([
              ["allowReactions", "Reaction dock", "Let players send the live symbol swarm."],
              ["allowLateJoin", "Late arrivals", "Let people enter while a round is already live."],
              ["showPresence", "Player parade", "Show room names and characters on host and stage."],
              ["showResponseCount", "Live answer count", "Show how many answers have landed before reveal."],
            ] as const).map(([key, label, copy]) => (
              <label key={key} className="flex cursor-pointer gap-3 border-2 border-[var(--ink)] bg-[var(--paper)] p-4">
                <input
                  type="checkbox"
                  checked={settingsDraft[key]}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, [key]: event.target.checked })}
                  className="mt-1 h-5 w-5 accent-[var(--ink)]"
                />
                <span>
                  <span className="block font-black">{label}</span>
                  <span className="mt-1 block text-sm text-[var(--ink-soft)]">{copy}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mono-tag mb-2 block text-[var(--ink-soft)]">player names</span>
              <select
                value={settingsDraft.participantNames}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, participantNames: event.target.value as RoomSettings["participantNames"] })}
                className="min-h-12 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-4 font-bold"
              >
                <option value="chosen">Players choose</option>
                <option value="generated">Room generates</option>
              </select>
            </label>
            <label>
              <span className="mono-tag mb-2 block text-[var(--ink-soft)]">sound character</span>
              <select
                value={settingsDraft.soundMode}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, soundMode: event.target.value as RoomSettings["soundMode"] })}
                className="min-h-12 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-4 font-bold"
              >
                <option value="off">Off</option>
                <option value="soft">Soft ticks</option>
                <option value="arcade">Arcade punch</option>
              </select>
            </label>
          </div>
          <div className="mt-6">
            <BlockButton wide disabled={busy} onClick={() => void saveSettings()} color="var(--red)">
              {busy ? "saving…" : "save room rules"}
            </BlockButton>
          </div>
        </section>
      )}

      {!activity || phase === "ended" ? (
        /* ---------------- CREATE ---------------- */
        <section className="mt-12">
          <Kicker>room modes</Kicker>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MODES.filter((candidate) => !GAME_TYPES.has(candidate.type)).map((candidate) => (
              <button
                key={candidate.type}
                onClick={() => {
                  setMode(candidate.type);
                  if (ALWAYS_LIVE_TYPES.has(candidate.type)) setResultsMode("live");
                  if (FORCED_BLIND_TYPES.has(candidate.type)) setResultsMode("blind");
                }}
                className={`block-shadow-sm border-2 border-[var(--ink)] p-4 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${mode === candidate.type ? "" : "opacity-60"}`}
                style={{
                  background:
                    mode === candidate.type ? candidate.color : "var(--paper)",
                  color:
                    mode !== candidate.type
                      ? "var(--ink)"
                      : onSurface(candidate.color),
                }}
              >
                <p className="text-lg font-black uppercase">{candidate.label}</p>
                <p className="mt-1 text-xs opacity-90">{candidate.tagline}</p>
              </button>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap items-end justify-between gap-3 border-t-4 border-[var(--ink)] pt-5">
            <div>
              <Kicker color="var(--red)">games</Kicker>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">Timed rounds with a real scoring model and a server-owned finish.</p>
            </div>
            <span className="mono-tag text-[var(--ink-soft)]">fair play / sealed truth</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MODES.filter((candidate) => GAME_TYPES.has(candidate.type)).map((candidate) => (
              <button
                key={candidate.type}
                onClick={() => {
                  setMode(candidate.type);
                  setResultsMode("blind");
                  setTimeLimitSeconds(
                    candidate.type === "cipher-room"
                      ? "45"
                      : candidate.type === "shadow-council"
                        ? "60"
                        : "20",
                  );
                }}
                className={`block-shadow-sm border-2 border-[var(--ink)] p-4 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${mode === candidate.type ? "" : "opacity-60"}`}
                style={{
                  background: mode === candidate.type ? candidate.color : "var(--paper)",
                  color:
                    mode !== candidate.type
                      ? "var(--ink)"
                      : onSurface(candidate.color),
                }}
              >
                <p className="text-lg font-black uppercase">{candidate.label}</p>
                <p className="mt-1 text-xs opacity-90">{candidate.tagline}</p>
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-5">
            <Field
              label="question"
              value={prompt}
              onChange={setPrompt}
              placeholder="What should we ask the room?"
            />

            {(mode === "pulse-choice" ||
              mode === "rank-race" ||
              mode === "future-fork" ||
              mode === "shadow-council") && (
              <>
                {options.map((option, index) => (
                  <Field
                    key={index}
                    label={`${mode === "future-fork" ? "future" : mode === "shadow-council" ? "alias" : "option"} ${String.fromCharCode(65 + index)}`}
                    value={option}
                    placeholder={`${mode === "future-fork" ? "Future" : mode === "shadow-council" ? "Alias" : "Option"} ${String.fromCharCode(65 + index)}`}
                    onChange={(value) =>
                      setOptions((current) =>
                        current.map((v, i) => (i === index ? value : v)),
                      )
                    }
                  />
                ))}
                {options.length < (mode === "rank-race" ? 8 : 6) && (
                  <BlockButton onClick={() => setOptions((c) => [...c, ""])}>
                    + option
                  </BlockButton>
                )}
                {mode === "pulse-choice" && (
                <fieldset className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-4">
                  <legend className="mono-tag px-2">crowd rule</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["majority", "minority"] as const).map((candidate) => (
                      <label
                        key={candidate}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 border-2 border-[var(--ink)] px-4 py-3 font-bold ${
                          choiceRule === candidate
                            ? "bg-[var(--red)] text-[var(--on-red)]"
                            : "bg-[var(--paper)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="choice-rule"
                          checked={choiceRule === candidate}
                          onChange={() => {
                            setChoiceRule(candidate);
                            if (candidate === "minority") setResultsMode("blind");
                          }}
                        />
                        {candidate === "majority"
                          ? "Most votes wins"
                          : "Minority wins"}
                      </label>
                    ))}
                  </div>
                  {choiceRule === "minority" && (
                    <p className="mono-tag mt-3 text-[var(--ink-soft)]">
                      least-popular non-empty answer wins · results stay blind
                    </p>
                  )}
                </fieldset>
                )}
              </>
            )}

            {(mode === "spectrum" ||
              mode === "hot-take" ||
              mode === "before-after" ||
              mode === "reality-bender" ||
              mode === "living-consensus") && (
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label={mode === "hot-take" ? "left side" : "left end"}
                  value={lowLabel}
                  onChange={setLowLabel}
                  placeholder="Not confident"
                />
                <Field
                  label={mode === "hot-take" ? "right side" : "right end"}
                  value={highLabel}
                  onChange={setHighLabel}
                  placeholder="Very confident"
                />
              </div>
            )}

            {mode === "quadrant-drop" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="horizontal · left" value={xLowLabel} onChange={setXLowLabel} />
                <Field label="horizontal · right" value={xHighLabel} onChange={setXHighLabel} />
                <Field label="vertical · bottom" value={yLowLabel} onChange={setYLowLabel} />
                <Field label="vertical · top" value={yHighLabel} onChange={setYHighLabel} />
              </div>
            )}

            {mode === "prediction" && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="unit" value={unit} onChange={setUnit} />
                  <Field label="min" value={min} onChange={setMin} />
                  <Field label="max" value={max} onChange={setMax} />
                </div>
                <Field
                  label="true answer (kept secret until reveal)"
                  value={answer}
                  onChange={setAnswer}
                  placeholder="optional; leave blank to reveal verbally"
                />
              </div>
            )}

            {mode === "word-bloom" && (
              <Field
                label="maximum characters per phrase"
                value={maxChars}
                onChange={setMaxChars}
                type="number"
              />
            )}

            {mode === "question-board" && (
              <Field
                label="maximum characters per question"
                value={questionMaxChars}
                onChange={setQuestionMaxChars}
                type="number"
              />
            )}

            {(mode === "word-bloom" || mode === "question-board") && (
              <label className="flex cursor-pointer items-start gap-3 border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-4">
                <input
                  type="checkbox"
                  checked={reviewPublicText}
                  onChange={(event) => setReviewPublicText(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--ink)]"
                />
                <span>
                  <span className="block font-black">Screen public text</span>
                  <span className="mt-1 block text-sm text-[var(--ink-soft)]">
                    New entries wait in the host queue before they reach the stage.
                  </span>
                </span>
              </label>
            )}

            {mode === "crowd-meter" && (
              <Field
                label="rolling energy window (seconds)"
                value={windowSeconds}
                onChange={setWindowSeconds}
                type="number"
              />
            )}

            {mode === "signal-noise" && (
              <div className="space-y-5 border-3 border-[var(--ink)] bg-[var(--paper-deep)] p-5">
                <fieldset>
                  <legend className="mono-tag text-[var(--ink-soft)]">sealed answer</legend>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["signal", "noise"] as const).map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => setCorrectAnswer(candidate)}
                        className="min-h-14 border-2 border-[var(--ink)] px-4 text-left font-black uppercase block-shadow-sm"
                        style={{
                          background:
                            correctAnswer === candidate
                              ? candidate === "signal"
                                ? "var(--green)"
                                : "var(--violet)"
                              : "var(--paper)",
                          color:
                            correctAnswer === candidate
                              ? onSurface(candidate === "signal" ? "var(--green)" : "var(--violet)")
                              : "var(--ink)",
                        }}
                      >
                        {candidate}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Field
                  label="reveal note"
                  value={explanation}
                  maxLength={180}
                  onChange={setExplanation}
                  placeholder="One clean line that explains the tell"
                />
                <Field
                  label="round clock in seconds"
                  type="number"
                  value={timeLimitSeconds}
                  onChange={setTimeLimitSeconds}
                />
              </div>
            )}

            {mode === "future-fork" && (
              <div className="border-3 border-[var(--ink)] bg-[var(--paper-deep)] p-5">
                <Field
                  label="information shock"
                  value={evidenceDrop}
                  maxLength={200}
                  onChange={setEvidenceDrop}
                  placeholder="One new fact participants see after their first forecast"
                />
                <p className="mono-tag mt-3 text-[var(--ink-soft)]">
                  each phone records a before path, reveals this fact, then records the revised path
                </p>
              </div>
            )}

            {mode === "cipher-room" && (
              <div className="space-y-5 border-3 border-[var(--ink)] bg-[var(--paper-deep)] p-5">
                <Field
                  label="ciphertext"
                  value={ciphertext}
                  maxLength={160}
                  onChange={(value) => setCiphertext(value.toUpperCase())}
                  placeholder="WKLV LV D WHVW"
                />
                <Field
                  label="teaching clue"
                  value={cipherClue}
                  maxLength={160}
                  onChange={setCipherClue}
                  placeholder="Rotate the alphabet backward"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="correct Caesar shift · 0 to 25"
                    type="number"
                    value={cipherShift}
                    onChange={setCipherShift}
                  />
                  <Field
                    label="round clock in seconds"
                    type="number"
                    value={timeLimitSeconds}
                    onChange={setTimeLimitSeconds}
                  />
                </div>
                <p className="mono-tag text-[var(--ink-soft)]">
                  educational Caesar cipher only · never used for passwords or secure secrets
                </p>
              </div>
            )}

            {mode === "shadow-council" && (
              <div className="space-y-5 border-3 border-[var(--ink)] bg-[var(--paper-deep)] p-5">
                <Field
                  label="evidence drop"
                  value={evidenceDrop}
                  maxLength={200}
                  onChange={setEvidenceDrop}
                  placeholder="One Shadow backed the Foundry"
                />
                <label>
                  <span className="mono-tag mb-2 block text-[var(--ink-soft)]">
                    sealed Shadow identity
                  </span>
                  <select
                    value={shadowAliasIndex}
                    onChange={(event) => setShadowAliasIndex(event.target.value)}
                    className="min-h-12 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-4 font-bold"
                  >
                    {cleanedOptions.map((alias, index) => (
                      <option key={`${alias}-${index}`} value={index}>
                        {alias}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="tribunal clock in seconds"
                  type="number"
                  value={timeLimitSeconds}
                  onChange={setTimeLimitSeconds}
                />
                <p className="mono-tag text-[var(--ink-soft)]">
                  aliases stay fictional · observed votes and hidden truth are labeled separately
                </p>
              </div>
            )}

            {!ALWAYS_LIVE_TYPES.has(mode) && (
            <fieldset className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-4">
              <legend className="mono-tag px-2">result timing</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["live", "blind"] as const).map((candidate) => (
                  <label
                    key={candidate}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 border-2 border-[var(--ink)] px-4 py-3 font-bold ${
                      resultsMode === candidate
                        ? "bg-[var(--ink)] text-[var(--on-ink)]"
                        : "bg-[var(--paper)]"
                    } ${
                      ((mode === "pulse-choice" && choiceRule === "minority" && candidate === "live") ||
                        (FORCED_BLIND_TYPES.has(mode) && candidate === "live"))
                        ? "cursor-not-allowed opacity-35"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="results-mode"
                      value={candidate}
                      checked={resultsMode === candidate}
                      disabled={
                          (mode === "pulse-choice" &&
                            choiceRule === "minority" &&
                            candidate === "live") ||
                          (FORCED_BLIND_TYPES.has(mode) && candidate === "live")
                      }
                      onChange={() => setResultsMode(candidate)}
                    />
                    {candidate === "live"
                      ? mode === "prediction"
                        ? "Live guesses, sealed truth"
                        : "Live results"
                      : mode === "prediction"
                        ? "Hide guesses until truth"
                        : "Blind until reveal"}
                  </label>
                ))}
              </div>
            </fieldset>
            )}

            <BlockButton
              onClick={() => void launch()}
              disabled={busy || !launchReady}
              wide
            >
              {busy ? "launching…" : "launch to room"}
            </BlockButton>
          </div>
        </section>
      ) : (
        /* ---------------- CONTROL ---------------- */
        <section className="mt-12">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span
                className="inline-block border-2 border-[var(--ink)] px-3 py-1
                  text-sm font-black uppercase tracking-widest"
                style={{
                  background:
                    phase === "live"
                      ? "var(--green)"
                      : phase === "revealed"
                        ? "var(--red)"
                        : "var(--ink-soft)",
                  color:
                    phase === "live"
                      ? "var(--on-green)"
                      : phase === "revealed"
                        ? "var(--on-red)"
                        : "var(--paper)",
                }}
              >
                {phase}
              </span>
              <h2 className="mt-4 max-w-xl text-2xl font-black leading-snug md:text-3xl">
                {activity.prompt}
              </h2>
              {activity.deadlineAt && (
                <div className="mt-5 max-w-sm">
                  <RoundClock
                    deadlineAt={activity.deadlineAt}
                    serverNow={state.serverNow}
                    durationSeconds={
                      activity.config.type === "signal-noise" ||
                      activity.config.type === "cipher-room" ||
                      activity.config.type === "shadow-council"
                        ? activity.config.timeLimitSeconds
                        : undefined
                    }
                    compact
                  />
                </div>
              )}
            </div>
            <HostCounter value={arrival} />
          </div>

          {/* Progressive disclosure: only the next valid actions show */}
          <div className="mt-8 flex flex-wrap gap-4">
            {phase === "live" && (
              <BlockButton
                color="var(--yellow)"
                disabled={busy}
                onClick={() => act("lock")}
              >
                {lockActionLabel(activity.type)}
              </BlockButton>
            )}
            {phase === "locked" && revealRequired && (
              <BlockButton
                color="var(--red)"
                disabled={busy}
                onClick={() => act("reveal")}
              >
                {revealActionLabel(activity.type)}
              </BlockButton>
            )}
            {phase === "locked" && (
              <BlockButton
                color="var(--paper-deep)"
                disabled={busy}
                onClick={() => act("reopen")}
              >
                {reopenActionLabel(activity.type)}
              </BlockButton>
            )}
            {(phase === "live" || phase === "locked" || phase === "revealed") && (
              <BlockButton
                color="var(--paper-deep)"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Reset this round and erase every response?")) {
                    void act("reset");
                  }
                }}
              >
                reset round
              </BlockButton>
            )}
            {phase !== null && (
              <BlockButton
                color="var(--ink)"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("End this round and return the room to its lobby?")) {
                    void act("end");
                  }
                }}
              >
                end round
              </BlockButton>
            )}
          </div>

          {(activity.type === "word-bloom" ||
            activity.type === "question-board") && (
            <div className="mt-10 border-t-4 border-[var(--ink)] pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Kicker>public text desk</Kicker>
                <p className="mono-tag text-[var(--ink-soft)]">
                  {moderationItems.filter((item) => item.status === "pending").length} waiting
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {moderationItems.length === 0 ? (
                  <p className="text-[var(--ink-soft)]">New entries appear here for review.</p>
                ) : (
                  moderationItems.slice(0, 20).map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 border-2 border-[var(--ink)] bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-bold">{item.text}</p>
                        <p className="mono-tag mt-1 text-[var(--ink-soft)]">{item.status}</p>
                      </div>
                      <div className="flex gap-2">
                        {item.status !== "visible" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void moderateText(item.id, "visible")}
                            className="mono-tag min-h-11 border-2 border-[var(--ink)] bg-[var(--green)] px-3 text-[var(--on-green)]"
                          >
                            show
                          </button>
                        )}
                        {item.status !== "hidden" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void moderateText(item.id, "hidden")}
                            className="mono-tag min-h-11 border-2 border-[var(--ink)] bg-[var(--red)] px-3 text-[var(--on-red)]"
                          >
                            hide
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activity.type === "prediction" && phase === "locked" && (
            <p className="mono-tag mt-4 text-[var(--ink-soft)]">
              revealing publishes the true answer and crowns the closest guesses.
            </p>
          )}

          {activity.type === "question-board" &&
            state.aggregate?.type === "question-board" && (
              <div className="mt-10 border-t-4 border-[var(--ink)] pt-5">
                <Kicker>live question queue</Kicker>
                <div className="mt-4 space-y-3">
                  {state.aggregate.questions.length === 0 ? (
                    <p className="text-[var(--ink-soft)]">Questions will arrive here for triage.</p>
                  ) : (
                    state.aggregate.questions.map((question, index) => (
                      <div
                        key={question.id}
                        className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-2 border-[var(--ink)] p-3 ${
                          question.answered ? "bg-[var(--paper-deep)] opacity-60" : "bg-white"
                        }`}
                      >
                        <span className="display text-2xl tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <p className={question.answered ? "line-through" : "font-bold"}>{question.text}</p>
                          <p className="mono-tag mt-1 text-[var(--ink-soft)]">{question.votes} room votes</p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleQuestion(question.id, !question.answered)}
                          className="mono-tag min-h-11 border-2 border-[var(--ink)] bg-[var(--yellow)] px-3"
                        >
                          {question.answered ? "restore" : "mark answered"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
        </section>
      )}
    </main>
  );
}
