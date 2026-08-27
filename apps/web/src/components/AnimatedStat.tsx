import { motion, useReducedMotion } from "motion/react";

/**
 * Live numeric readout for the stage. Real DOM text so projector contrast
 * and PNG receipts both see the digits (custom-element odometers live in
 * shadow DOM and drop out of html2canvas).
 */
export function AnimatedStat({
  value,
  suffix,
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={`tabular-nums ${className}`}>
      <motion.span
        key={value}
        initial={reduce ? false : { y: 10, opacity: 0.35 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="inline-block"
      >
        {value}
      </motion.span>
      {suffix}
    </span>
  );
}
