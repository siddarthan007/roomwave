import { generatedRoomName } from "@roomwave/shared";

import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { joinRoom, touchPresence } from "../lib/api";
import {
  clearParticipantSession,
  getJoinDraft,
  getParticipantSessionForCode,
  rememberJoinDraft,
  rememberLastJoinCode,
  saveParticipantSession,
  type ParticipantSession,
} from "../lib/storage";
import {
  BlockButton,
  ErrorNote,
  Field,
  Kicker,
} from "../components/ui";
import { CodeStamp } from "../components/CodeStamp";
import { PixelAvatar } from "../components/PixelAvatar";

/**
 * crypto.randomUUID() only exists in secure contexts (https:// or
 * localhost). Plain-HTTP LAN deployments would throw here and blank the
 * join page, so fall back to a random-hex seed.
 */
function randomAvatarSeed(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value;
}

function initialJoin() {
  const draft = getJoinDraft();
  const avatarSeed = draft?.avatarSeed ?? randomAvatarSeed();
  const savedName = draft?.displayName?.trim() ?? "";
  const nameTouched = draft?.nameTouched === true;
  return {
    avatarSeed,
    displayName: savedName || generatedRoomName(avatarSeed),
    nameTouched,
  };
}

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [ticket] = useState(initialJoin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState(ticket.displayName);
  const [avatarSeed, setAvatarSeed] = useState(ticket.avatarSeed);
  const [nameTouched, setNameTouched] = useState(ticket.nameTouched);
  const [existing] = useState<ParticipantSession | null>(() =>
    code ? (getParticipantSessionForCode(code)?.session ?? null) : null,
  );
  const [freshTicket, setFreshTicket] = useState(false);

  useEffect(() => {
    if (code) rememberLastJoinCode(code);
  }, [code]);

  useEffect(() => {
    rememberJoinDraft({ avatarSeed, displayName, nameTouched });
  }, [avatarSeed, displayName, nameTouched]);

  function shuffleCharacter() {
    navigator.vibrate?.(10);
    const next = randomAvatarSeed();
    setAvatarSeed(next);
    if (!nameTouched) setDisplayName(generatedRoomName(next));
  }

  async function continueExisting() {
    if (!code) return;
    const found = getParticipantSessionForCode(code);
    if (!found) return;
    try {
      await touchPresence(found.roomId, found.session.token);
      navigate(`/room/${found.roomId}`);
    } catch {
      clearParticipantSession(found.roomId, code);
      setFreshTicket(true);
      setError("That seat expired. Grab a new ticket.");
    }
  }

  async function join() {
    if (!code) return;
    if (existing && !freshTicket) {
      await continueExisting();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await joinRoom(code, {
        displayName: displayName.trim() || generatedRoomName(avatarSeed),
        avatarSeed,
      });
      saveParticipantSession(result.room.id, {
        participantId: result.participant.id,
        token: result.token,
        displayName: result.participant.displayName,
        avatarSeed: result.participant.avatarSeed,
      }, result.room.code);
      rememberLastJoinCode(result.room.code);
      navigate(`/room/${result.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setLoading(false);
    }
  }

  const showContinue = Boolean(existing) && !freshTicket;

  return (
    <main id="roomwave-main" className="safe-page safe-gutters page-pad mx-auto flex min-h-dvh max-w-md flex-col justify-center">
      <Kicker color="var(--red)">room code</Kicker>
      {code ? (
        <>
          <h1 className="sr-only">Join room {code}</h1>
          <CodeStamp code={code} />
        </>
      ) : null}
      <p className="mt-5 text-lg text-[var(--ink-soft)]">
        {showContinue
          ? "This device already has a seat in the room."
          : "Pick a room name and a tiny character. No account required."}
      </p>

      {showContinue && existing ? (
        <div className="mt-8 border-2 border-[var(--ink)] bg-white p-5 paper-stack">
          <div className="flex items-center gap-4">
            <PixelAvatar seed={existing.avatarSeed} size={66} />
            <div className="min-w-0">
              <p className="mono-tag text-[var(--ink-soft)]">your ticket</p>
              <p className="mt-1 truncate text-xl font-black">{existing.displayName}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 border-2 border-[var(--ink)] bg-white p-5 paper-stack">
          <div className="grid grid-cols-[auto_1fr] items-end gap-4">
            <button
              type="button"
              onClick={shuffleCharacter}
              className="group text-left"
              aria-label="Shuffle character"
            >
              <PixelAvatar seed={avatarSeed} size={66} />
              <span className="mono-tag mt-2 block text-[var(--blue)]">
                shuffle
              </span>
            </button>
            <Field
              label="your room name"
              value={displayName}
              onChange={(value) => {
                setNameTouched(true);
                setDisplayName(value);
              }}
              placeholder={generatedRoomName(avatarSeed)}
              maxLength={24}
              autoComplete="nickname"
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <BlockButton onClick={showContinue ? continueExisting : join} disabled={loading} wide color="var(--yellow)">
          {loading ? "joining…" : showContinue ? "continue into the room" : "enter the lobby"}
        </BlockButton>
      </div>
      {showContinue && (
        <button
          type="button"
          onClick={() => setFreshTicket(true)}
          className="mono-tag mt-4 text-[var(--ink-soft)] underline underline-offset-4"
        >
          this isn't me
        </button>
      )}

      {error && (
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      )}
    </main>
  );
}
