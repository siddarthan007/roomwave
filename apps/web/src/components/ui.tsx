import type { ReactNode } from "react";

import NumberFlow from "@number-flow/react";

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

/** Small mono kicker label, print-style. */
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
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`block-shadow-sm border-2 border-[var(--ink)] px-6 py-3 text-lg
        font-bold uppercase tracking-wide transition-transform
        active:translate-x-[3px] active:translate-y-[3px]
        active:shadow-none disabled:opacity-40 ${wide ? "w-full" : ""}`}
      style={{
        background: color,
        color: textColor ?? onSurface(color),
      }}
    >
      {children}
    </button>
  );
}

/** Ink-outlined text field on paper. */
export function Field({
  value,
  onChange,
  placeholder,
  label,
  type = "text",
  maxLength,
  autoComplete,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  type?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "search" | "url" | "none";
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-4
          py-3 text-lg transition-shadow placeholder:text-[var(--ink-soft)]/50
          focus:shadow-[4px_4px_0_var(--ink)] focus:outline-none"
      />
    </label>
  );
}

/** Oversized rolling count numeral. */
export function CountRoll({ value }: { value: number }) {
  return (
    <span className="display text-5xl tabular-nums md:text-6xl">
      <NumberFlow value={value} willChange />
    </span>
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
