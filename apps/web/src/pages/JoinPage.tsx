import { useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { joinRoom } from "../lib/api";
import {
  getParticipantSessionForCode,
  saveParticipantSession,
} from "../lib/storage";
import {
  BlockButton,
  ErrorNote,
  Field,
  Headline,
  Kicker,
} from "../components/ui";
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

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarSeed, setAvatarSeed] = useState(randomAvatarSeed);

  async function join() {
    if (!code) return;
    const existing = getParticipantSessionForCode(code);
    if (existing) {
      navigate(`/room/${existing.roomId}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await joinRoom(code, {
        displayName: displayName.trim() || undefined,
        avatarSeed,
      });
      saveParticipantSession(result.room.id, {
        participantId: result.participant.id,
        token: result.token,
        displayName: result.participant.displayName,
        avatarSeed: result.participant.avatarSeed,
      }, result.room.code);
      navigate(`/room/${result.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="safe-page safe-gutters mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 sm:px-6">
      <Kicker color="var(--red)">room code</Kicker>
      <Headline size="lg">{code}</Headline>
      <p className="mt-5 text-lg text-[var(--ink-soft)]">
        Pick a room name and a tiny character. No account required.
      </p>

      <div className="mt-8 grid grid-cols-[auto_1fr] items-end gap-4">
        <button
          type="button"
          onClick={() => {
            navigator.vibrate?.(10);
            setAvatarSeed(randomAvatarSeed());
          }}
          className="group text-left transition-transform
            active:translate-y-[2px] active:scale-[0.97]"
          aria-label="Shuffle character"
        >
          <PixelAvatar seed={avatarSeed} size={66} />
          <span className="mono-tag mt-2 block text-[var(--blue)] group-active:translate-y-px">
            shuffle
          </span>
        </button>
        <Field
          label="your room name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Bright Fox"
          maxLength={24}
          autoComplete="nickname"
        />
      </div>

      <div className="mt-8">
        <BlockButton onClick={join} disabled={loading} wide color="var(--yellow)">
          {loading ? "joining…" : "enter the lobby →"}
        </BlockButton>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      )}
    </main>
  );
}
