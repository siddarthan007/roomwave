import { useState } from "react";

import { copyText } from "../lib/clipboard";

export function CodeStamp({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(code);
    if (!ok) return;
    navigator.vibrate?.(10);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy room code ${code}`}
      className="group text-left"
    >
      <span className="display block text-6xl md:text-7xl">{code}</span>
      <span className="mono-tag mt-2 block text-[var(--blue)]">
        {copied ? "copied" : "tap to copy"}
      </span>
    </button>
  );
}
