import type { ReactionBurst, ReactionKind } from "@roomwave/shared";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { REACTION_COLORS } from "../lib/reactions";
import { ReactionStamp } from "./ReactionStamp";

/* oxlint-disable react-hooks/exhaustive-deps -- ingest is a render-local burst helper */

/**
 * Meet-style live reaction swarm: stamps rise from the bottom of every
 * connected screen. Bounded per ARCHITECTURE-ESSENTIALS §13:
 *  - max 18 DOM particles alive at once; excess bursts collapse into a
 *    "+N" counter pulse instead of more nodes;
 *  - every particle self-removes when its rise finishes;
 *  - nothing renders when the tab is hidden.
 */

const MAX_PARTICLES = 18;

interface Particle {
  id: number;
  kind: ReactionKind;
  x: number;
  drift: number;
  tilt: number;
  size: number;
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
  size = "room",
}: {
  burst: ReactionBurst | null;
  /** Instant particle from the sender's own tap, before the SSE bucket lands. */
  localBurst?: ReactionBurst | null;
  /** Projector stamps read from the back row; phone stamps stay thumb-sized. */
  size?: "room" | "stage";
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const seenBursts = useRef<string[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastLocal = useRef<{ kind: ReactionKind; at: number } | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const stampPx = size === "stage" ? 64 : 48;

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
      x: 12 + Math.random() * 76,
      drift: -48 + Math.random() * 96,
      tilt: -18 + Math.random() * 36,
      size: stampPx - 8 + Math.round(Math.random() * 16),
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
  }, [localBurst, shouldReduceMotion, stampPx]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- ingest is a render-local helper
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- SSE burst is an external visual event
    ingest(burst, "server");
  }, [burst, shouldReduceMotion, stampPx]);

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
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.span
            key={particle.id}
            className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] -translate-x-1/2 will-change-transform"
            style={{
              left: `${particle.x}%`,
              color: REACTION_COLORS[particle.kind],
            }}
            initial={{
              y: "0vh",
              x: 0,
              opacity: 0,
              scale: 0.4,
              rotate: particle.tilt * 0.35,
            }}
            animate={{
              y: ["0vh", "-10vh", "-70vh"],
              x: [0, particle.drift * 0.25, particle.drift],
              opacity: [0, 1, 0],
              scale: [0.4, 1.18, 0.86],
              rotate: [particle.tilt * 0.35, particle.tilt, particle.tilt * 1.15],
            }}
            transition={{
              duration: 2.2,
              times: [0, 0.12, 1],
              ease: [0.22, 1, 0.36, 1],
            }}
            onAnimationComplete={() => removeParticle(particle.id)}
          >
            <ReactionStamp kind={particle.kind} size={particle.size} />
          </motion.span>
        ))}
      </AnimatePresence>

      {pulse && (
        <motion.span
          key={pulse.id}
          className={`display absolute bottom-10 right-8 border-2
            border-[var(--ink)] bg-[var(--paper)] px-3 py-1 block-shadow-sm ${
              pulse.extra >= 12 ? "text-3xl" : "text-xl"
            }`}
          style={{ color: REACTION_COLORS[pulse.kind] }}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: [0.7, 1.05, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.2, 1], ease: "easeOut" }}
          onAnimationComplete={() => setPulse(null)}
        >
          +{pulse.extra}
          {pulse.extra >= 12 && (
            <span className="mono-tag ml-2 text-[var(--ink)]">combo!</span>
          )}
        </motion.span>
      )}
    </div>
  );
}
