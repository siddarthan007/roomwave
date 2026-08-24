import NumberFlow from "@number-flow/react";

/**
 * Live-updating numeric readout for the stage. Digit transitions run on
 * NumberFlow's internal spring so votes roll the odometer instead of
 * teleporting; reduced-motion users get instant swaps (handled internally).
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
  return (
    <span className={className}>
      <NumberFlow
        value={value}
        transformTiming={{ duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        spinTiming={{ duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        willChange
      />
      {suffix}
    </span>
  );
}
