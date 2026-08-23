import { motion } from "motion/react";
import { useEffect, useState } from "react";

export function RoundClock({
  deadlineAt,
  serverNow,
  durationSeconds = 120,
  compact = false,
}: {
  deadlineAt: string | null;
  serverNow: string;
  durationSeconds?: number;
  compact?: boolean;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!deadlineAt) return;
    const offset = Date.parse(serverNow) - Date.now();
    const update = () =>
      setRemaining(Math.max(0, Date.parse(deadlineAt) - (Date.now() + offset)));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [deadlineAt, serverNow]);

  if (!deadlineAt) return null;
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(1, remaining / (durationSeconds * 1000)));
  const urgent = seconds <= 5;

  return (
    <div
      className={`border-2 border-[var(--ink)] bg-[var(--paper)] ${compact ? "px-3 py-2" : "p-3 block-shadow-sm"}`}
      aria-live={urgent ? "polite" : "off"}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mono-tag text-[var(--ink-soft)]">room clock</span>
        <motion.span
          key={seconds}
          initial={urgent ? { scale: 1.35 } : false}
          animate={{ scale: 1 }}
          className="display text-2xl tabular-nums"
          style={{ color: urgent ? "var(--red)" : "var(--ink)" }}
        >
          {String(seconds).padStart(2, "0")}
        </motion.span>
      </div>
      {!compact && (
        <div className="mt-2 h-2 overflow-hidden border border-[var(--ink)] bg-white">
          <motion.div
            className="h-full bg-[var(--red)]"
            animate={{ scaleX: progress }}
            style={{ transformOrigin: "left" }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>
      )}
    </div>
  );
}
