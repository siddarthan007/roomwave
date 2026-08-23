import type { ReactionKind } from "@roomwave/shared";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

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

const GLYPHS: Record<ReactionKind, string> = {
  spark: "✦",
  flame: "▲",
  clap: "■",
  wave: "〜",
  bolt: "⟋",
};

const COLORS: Record<ReactionKind, string> = {
  spark: "var(--yellow)",
  flame: "var(--red)",
  clap: "var(--blue)",
  wave: "var(--green)",
  bolt: "var(--violet)",
};

let nextId = 1;

export function ReactionLayer({
  burst,
}: {
  burst: { kind: ReactionKind; count: number; bucket: number } | null;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const seenBursts = useRef<string[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!burst) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const burstKey = `${burst.bucket}:${burst.kind}`;
    if (seenBursts.current.includes(burstKey)) return;
    seenBursts.current = [...seenBursts.current.slice(-63), burstKey];

    if (shouldReduceMotion) {
      // oxlint-disable-next-line react/set-state-in-effect -- prop-driven visual event
      setPulse({ id: nextId++, kind: burst.kind, extra: burst.count });
      return;
    }

    const room = MAX_PARTICLES - particlesRef.current.length;
    const spawn = Math.min(burst.count, Math.max(0, room));
    const fresh: Particle[] = Array.from({ length: spawn }, () => ({
      id: nextId++,
      kind: burst.kind,
      x: 8 + Math.random() * 84,
      drift: -30 + Math.random() * 60,
    }));

    const next = [
      ...particlesRef.current.slice(-(MAX_PARTICLES - fresh.length)),
      ...fresh,
    ];
    particlesRef.current = next;
    setParticles(next);

    if (spawn < burst.count) {
      setPulse({
        id: nextId++,
        kind: burst.kind,
        extra: burst.count - spawn,
      });
    }
  }, [burst, shouldReduceMotion]);

  function removeParticle(id: number) {
    const next = particlesRef.current.filter((candidate) => candidate.id !== id);
    particlesRef.current = next;
    setParticles(next);
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
            color: COLORS[particle.kind],
            animation: "rw-rise 2.2s ease-out forwards",
            ["--rw-drift" as string]: `${particle.drift}px`,
          }}
        >
          {GLYPHS[particle.kind]}
        </span>
      ))}

      {pulse && (
        <span
          key={pulse.id}
          onAnimationEnd={() => setPulse(null)}
          className="display absolute bottom-10 right-8 border-2
            border-[var(--ink)] bg-[var(--paper)] px-3 py-1 text-xl block-shadow-sm"
          style={{
            color: COLORS[pulse.kind],
            animation: "rw-pulse 1.4s ease-out forwards",
          }}
        >
          +{pulse.extra}
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
