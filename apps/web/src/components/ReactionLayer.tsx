import type { ReactionBurst, ReactionKind } from "@roomwave/shared";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { REACTION_COLORS } from "../lib/reactions";
import { ReactionStamp } from "./ReactionStamp";

/* oxlint-disable react-hooks/exhaustive-deps -- ingest is a render-local burst helper */

/**
 * Bounded live-reaction swarm.
 *
 * Hard limits (per ARCHITECTURE-ESSENTIALS §13):
 *  - max 18 DOM particles alive at once; excess bursts collapse into a
 *    "+N" counter pulse instead of more nodes;
 *  - every particle self-removes via animationend;
 *  - nothing renders when the tab is hidden.
 */

const MAX_PARTICLES = 18;

interface Particle {
  id: number;
  kind: ReactionKind;
  x: number;
  drift: number;
}

interface Pulse {
  id: number;
  kind: ReactionKind;
  extra: number;
}

let nextId = 1;

export function ReactionLayer({
  burst,
  localBurst,
}: {
  burst: ReactionBurst | null;
  /** Instant particle from the sender's own tap, before the SSE bucket lands. */
  localBurst?: ReactionBurst | null;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const seenBursts = useRef<string[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastLocal = useRef<{ kind: ReactionKind; at: number } | null>(null);
  const shouldReduceMotion = useReducedMotion();

  function ingest(next: ReactionBurst | null, source: "server" | "local") {
    if (!next) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const burstKey = `${next.bucket}:${next.kind}:${source}`;
    if (seenBursts.current.includes(burstKey)) return;
    seenBursts.current = [...seenBursts.current.slice(-63), burstKey];

    if (source === "local") {
      lastLocal.current = { kind: next.kind, at: Date.now() };
    } else if (
      lastLocal.current &&
      lastLocal.current.kind === next.kind &&
      Date.now() - lastLocal.current.at < 1400
    ) {
      lastLocal.current = null;
      return;
    }

    if (shouldReduceMotion) {
      // oxlint-disable-next-line react/set-state-in-effect -- prop-driven visual event
      setPulse({ id: nextId++, kind: next.kind, extra: next.count });
      return;
    }

    const room = MAX_PARTICLES - particlesRef.current.length;
    const spawn = Math.min(next.count, Math.max(0, room));
    const fresh: Particle[] = Array.from({ length: spawn }, () => ({
      id: nextId++,
      kind: next.kind,
      x: 8 + Math.random() * 84,
      drift: -30 + Math.random() * 60,
    }));

    const stacked = [
      ...particlesRef.current.slice(-(MAX_PARTICLES - fresh.length)),
      ...fresh,
    ];
    particlesRef.current = stacked;
    setParticles(stacked);

    if (spawn < next.count) {
      setPulse({
        id: nextId++,
        kind: next.kind,
        extra: next.count - spawn,
      });
    }
  }

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- ingest is a render-local helper
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- local tap is an external visual event
    ingest(localBurst ?? null, "local");
  }, [localBurst, shouldReduceMotion]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- ingest is a render-local helper
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- SSE burst is an external visual event
    ingest(burst, "server");
  }, [burst, shouldReduceMotion]);

  function removeParticle(id: number) {
    const stacked = particlesRef.current.filter((candidate) => candidate.id !== id);
    particlesRef.current = stacked;
    setParticles(stacked);
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {particles.map((particle) => (
        <span
          key={particle.id}
          onAnimationEnd={() => removeParticle(particle.id)}
          className="absolute bottom-6 text-3xl"
          style={{
            left: `${particle.x}%`,
            color: REACTION_COLORS[particle.kind],
            animation: "rw-rise 2.2s ease-out forwards",
            ["--rw-drift" as string]: `${particle.drift}px`,
          }}
        >
          <ReactionStamp kind={particle.kind} size={36} />
        </span>
      ))}

      {pulse && (
        <span
          key={pulse.id}
          onAnimationEnd={() => setPulse(null)}
          className={`display absolute bottom-10 right-8 border-2
            border-[var(--ink)] bg-[var(--paper)] px-3 py-1 block-shadow-sm ${
              pulse.extra >= 12 ? "text-3xl" : "text-xl"
            }`}
          style={{
            color: REACTION_COLORS[pulse.kind],
            animation: "rw-pulse 1.4s ease-out forwards",
          }}
        >
          +{pulse.extra}
          {pulse.extra >= 12 && (
            <span className="mono-tag ml-2 text-[var(--ink)]">combo!</span>
          )}
        </span>
      )}

      <style>{`
        @keyframes rw-rise {
          0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
          12%  { opacity: 1; transform: translate(calc(var(--rw-drift) * 0.2), -8vh) scale(1.15); }
          100% { transform: translate(var(--rw-drift), -72vh) scale(0.9); opacity: 0; }
        }
        @keyframes rw-pulse {
          0%   { transform: scale(0.7); opacity: 0; }
          20%  { transform: scale(1.05); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
