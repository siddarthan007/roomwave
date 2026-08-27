import type { ReactNode } from "react";

import { motion, useReducedMotion } from "motion/react";

import { onSurface } from "./surface-color";

/**
 * Poster headline block. The single most important typographic element on
 * any screen: question, state word, or big number.
 */
export function Headline({
  children,
  size = "md",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-2xl md:text-3xl",
    md: "text-4xl md:text-5xl",
    lg: "text-6xl md:text-7xl",
    xl: "text-7xl md:text-9xl",
  } as const;
  return <h1 className={`display ${sizes[size]}`}>{children}</h1>;
}

/** Small condensed kicker label, print-style. */
export function Kicker({
  children,
  color = "var(--ink)",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <p className="mono-tag font-bold" style={{ color }}>
      {children}
    </p>
  );
}

/** Hard-edged primary button with the offset-print shadow. */
export function BlockButton({
  children,
  onClick,
  color = "var(--yellow)",
  type = "button",
  disabled = false,
  wide = false,
  textColor,
}: {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  wide?: boolean;
  textColor?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled || reduce ? undefined : { x: 3, y: 3, boxShadow: "0px 0px 0px var(--ink)" }}
      transition={{ type: "spring", stiffness: 700, damping: 32 }}
      className={`relative isolate border-2 border-[var(--ink)] px-6 py-3 text-lg
        font-bold uppercase tracking-wide block-shadow-sm
        disabled:cursor-not-allowed ${wide ? "w-full" : ""}`}
      style={{
        background: color,
        color: textColor ?? onSurface(color),
      }}
    >
      {disabled && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent 0 8px, rgba(23,21,15,0.14) 8px 16px)",
          }}
        />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/** Ink-outlined text field on a white paper slip. */
export function Field({
  value,
  onChange,
  placeholder,
  label,
  type = "text",
  maxLength,
  autoComplete,
  inputMode,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  type?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "search" | "url" | "none";
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mono-tag mb-2 block text-[var(--ink-soft)]">
          {label}
        </span>
      )}
      <input
        type={type}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-12 w-full border-2 border-[var(--ink)] bg-white px-4
          py-3 text-lg transition-shadow placeholder:text-[var(--ink-soft)]/50
          focus:shadow-[4px_4px_0_var(--ink)]"
      />
    </label>
  );
}

/** Oversized rolling count numeral. */
export function CountRoll({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      key={value}
      initial={reduce ? false : { y: 12, opacity: 0.4 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="display inline-block text-5xl tabular-nums md:text-6xl"
    >
      {value}
    </motion.span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-2 border-[var(--red)] bg-[var(--red)] px-3 py-2
        text-sm font-bold text-[var(--on-red)]"
    >
      {message}
    </p>
  );
}
