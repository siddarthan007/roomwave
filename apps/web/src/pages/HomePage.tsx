import type { FormEvent } from "react";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createRoom } from "../lib/api";
import { saveHostToken } from "../lib/storage";
import {
  BlockButton,
  ErrorNote,
  Field,
  Kicker,
} from "../components/ui";
import { RoomwaveMark } from "../components/RoomwaveMark";
import type { RoomTheme } from "@roomwave/shared";

export function HomePage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [theme, setTheme] = useState<RoomTheme>("paper");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await createRoom(title, { theme });
      saveHostToken(result.room.id, result.hostToken);
      navigate(`/host/${result.room.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    navigate(`/join/${code}`);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="halftone absolute inset-0" />

      <div className="safe-page safe-gutters safe-top relative mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-16 md:py-20">
        {/* Poster masthead */}
        <header>
          <RoomwaveMark />

          <h1 className="home-hero display mt-5 max-w-[11ch]">
            <span className="block">Make the room</span>
            <span className="mt-[0.14em] block w-fit bg-[var(--yellow)] px-[0.12em] pb-[0.04em]">
              visible.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[clamp(1.05rem,2.8vw,1.35rem)] leading-relaxed text-[var(--ink-soft)]">
            Live audience energy for classrooms, clubs, and stages.
            Scan, tap, and watch the room move. No accounts, no setup.
          </p>
        </header>

        {/* Two dominant paths, asymmetric poster composition */}
        <div className="mt-16 grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-14">
          <form onSubmit={handleCreate}>
            <Kicker>host a room</Kicker>
            <div className="mt-4 border-2 border-[var(--ink)] bg-white p-7 block-shadow">
              <Field
                label="give it a name"
                value={title}
                onChange={setTitle}
                placeholder="CS Club Demo · Lecture Hall B"
                maxLength={100}
              />
              <fieldset className="mt-5">
                <legend className="mono-tag text-[var(--ink-soft)]">starter palette</legend>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {(["paper", "signal", "midnight", "field"] as const).map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      aria-label={`${candidate} palette`}
                      aria-pressed={theme === candidate}
                      onClick={() => setTheme(candidate)}
                      className={`theme-swatch h-11 border-2 border-[var(--ink)] ${theme === candidate ? "block-shadow-sm is-active" : ""}`}
                      data-preview-theme={candidate}
                    />
                  ))}
                </div>
              </fieldset>
              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="block-shadow-sm mt-6 w-full border-2 border-[var(--ink)]
                  bg-[var(--red)] py-4 text-xl font-black uppercase tracking-wide
                  text-[var(--on-red)] transition-transform active:translate-x-[3px]
                  active:translate-y-[3px] active:shadow-none disabled:opacity-40"
              >
                {loading ? "creating…" : "open the room →"}
              </button>
            </div>
          </form>

          <form onSubmit={handleJoin}>
            <Kicker>join a room</Kicker>
            <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-7 block-shadow-red">
              <Field
                label="room code"
                value={joinCode}
                onChange={(value) => setJoinCode(value.toUpperCase())}
                placeholder="F7KD3P"
                maxLength={6}
                autoComplete="off"
              />
              <div className="mt-6">
                <BlockButton type="submit" wide color="var(--blue)">
                  join
                </BlockButton>
              </div>
              <p className="mono-tag mt-5 text-center text-[var(--ink-soft)]">
                or scan the projector's QR
              </p>
            </div>
          </form>
        </div>

        {error && (
          <div className="mt-8 max-w-md">
            <ErrorNote message={error} />
          </div>
        )}

        {/* Mode strip shows the product range without a long explanation. */}
        <footer className="mono-tag mt-20 flex flex-wrap gap-x-8 gap-y-2 text-[var(--ink-soft)]">
          <span>pulse choice</span>
          <span>spectrum</span>
          <span>prediction battle</span>
          <span>rank race</span>
          <span>hot take duel</span>
          <span>quadrant drop</span>
          <span>word bloom</span>
          <span>question board</span>
          <span>crowd meter</span>
          <span>before / after</span>
          <span className="text-[var(--red)]">signal / noise game</span>
          <span className="text-[var(--violet)]">reality bender</span>
          <span>living consensus</span>
          <span>future fork</span>
          <span className="text-[var(--red)]">cipher room</span>
          <span className="text-[var(--red)]">shadow council</span>
        </footer>
      </div>
    </main>
  );
}
