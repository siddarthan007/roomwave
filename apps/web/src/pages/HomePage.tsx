import type { FormEvent } from "react";

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ROOM_THEMES, type RoomTheme } from "@roomwave/shared";

import { createRoom } from "../lib/api";
import { getLastJoinCode, listHostRooms, rememberHostRoom, rememberLastJoinCode } from "../lib/storage";
import {
  BlockButton,
  ErrorNote,
  Field,
  Kicker,
} from "../components/ui";
import { RoomwaveMark } from "../components/RoomwaveMark";

export function HomePage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState(getLastJoinCode);
  const [theme, setTheme] = useState<RoomTheme>("paper");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hostRooms = listHostRooms();

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await createRoom(title, { theme });
      rememberHostRoom(result.room.id, result.hostToken, {
        title: result.room.title,
        code: result.room.code,
      });
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
    rememberLastJoinCode(code);
    navigate(`/join/${code}`);
  }

  return (
    <main id="roomwave-main" className="relative min-h-dvh overflow-x-clip">
      <div aria-hidden="true" className="halftone absolute inset-0" />
      <div aria-hidden="true" className="paper-grain" />

      <div className="safe-page safe-gutters safe-top page-pad relative mx-auto max-w-5xl">
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
            Live audience energy for classrooms, club nights, town halls, and surveys.
            Scan, tap, and watch the room move. No accounts, no setup.
          </p>
        </header>

        <div className="mt-10 flex flex-col-reverse gap-8 md:mt-16 md:grid md:grid-cols-[1.2fr_1fr] md:gap-14">
          <form onSubmit={handleCreate}>
            <Kicker>host a room</Kicker>
            <div className="mt-4 border-2 border-[var(--ink)] bg-white p-5 paper-stack sm:p-7">
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
                  {ROOM_THEMES.map((candidate) => (
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
              <div className="mt-6">
                <BlockButton type="submit" wide disabled={loading || !title.trim()} color="var(--red)">
                  {loading ? "creating…" : "open the room"}
                </BlockButton>
              </div>
            </div>
          </form>

          <form onSubmit={handleJoin}>
            <Kicker>join a room</Kicker>
            <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-5 paper-stack-red sm:p-7">
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

        {hostRooms.length > 0 && (
          <section className="mt-12 border-2 border-[var(--ink)] bg-white p-5 block-shadow-sm">
            <Kicker>your rooms on this device</Kicker>
            <ul className="mt-4 space-y-2">
              {hostRooms.map((room) => (
                <li key={room.roomId}>
                  <Link
                    to={`/host/${room.roomId}`}
                    className="press-plate flex min-h-12 items-center justify-between gap-3 border-2 border-[var(--ink)] px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-black">{room.title}</span>
                    <span className="mono-tag shrink-0">{room.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <div className="mt-8 max-w-md">
            <ErrorNote message={error} />
          </div>
        )}

        <footer className="mt-14 border-t-4 border-[var(--ink)] pt-5 sm:mt-20">
          <p className="mono-tag text-[var(--ink-soft)]">built for the room in front of you</p>
          <p className="mt-3 max-w-xl text-sm font-black uppercase leading-relaxed tracking-wide text-[var(--ink)]">
            Lecture check-ins, festival polls, public Q&A, opinion lines. One code on the wall, phones out.
          </p>
          <p className="mono-tag mt-6 text-[var(--ink-soft)]">what the projector plays</p>
          <p className="mt-3 max-w-xl text-sm font-black uppercase leading-relaxed tracking-wide text-[var(--ink)]">
            Pulse, spectrum, fist five, chip stack, over / under, plus the sealed games.
          </p>
        </footer>
      </div>
    </main>
  );
}
