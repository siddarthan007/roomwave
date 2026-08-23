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

export function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarSeed, setAvatarSeed] = useState(() => crypto.randomUUID());

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
          onClick={() => setAvatarSeed(crypto.randomUUID())}
          className="group text-left"
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
