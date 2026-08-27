import type { ReactNode } from "react";

import { motion, useReducedMotion } from "motion/react";

/**
 * Horizontal share rail. Animates scaleX from the left so projector bars
 * stay on the compositor instead of relayouting width every vote.
 */
export function FillBar({
  share,
  color,
  className = "",
  framed = true,
  children,
}: {
  share: number;
  color: string;
  className?: string;
  framed?: boolean;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const amount = Math.max(0, Math.min(1, share / 100));

  return (
    <div
      className={`relative overflow-hidden ${framed ? "border-2 border-[var(--ink)] bg-[var(--paper-deep)]" : ""} ${className}`}
    >
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: amount }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 26 }
        }
        className="absolute inset-y-0 left-0 w-full origin-left"
        style={{ background: color, willChange: "transform" }}
      />
      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  );
}

/** Vertical share column. Grows from the floor, same compositor path. */
export function FillColumn({
  share,
  color,
  className = "",
}: {
  share: number;
  color: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const amount = Math.max(0, Math.min(1, share / 100));

  return (
    <div
      className={`relative overflow-hidden bg-[var(--paper-deep)] ${className}`}
    >
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ scaleY: amount }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 26 }
        }
        className="absolute inset-x-0 bottom-0 h-full origin-bottom border-t-2 border-[var(--ink)]"
        style={{ background: color, willChange: "transform" }}
      />
    </div>
  );
}
