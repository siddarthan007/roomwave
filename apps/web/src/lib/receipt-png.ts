import type { ActivityType } from "@roomwave/shared";

import html2canvas from "html2canvas-pro";

import type { ReceiptRow } from "./receipt";

/**
 * Rasterizes the stage result block into a PNG the host can share.
 * Waits for webfonts so Archivo is painted into the receipt, then captures
 * only `#rw-receipt-card`.
 */
export async function downloadReceiptPng(options: {
  roomCode: string;
  mode: ActivityType;
  rows: ReceiptRow[];
  responseCount: number;
}): Promise<void> {
  const card = document.querySelector<HTMLElement>("#rw-receipt-card");
  if (!card) {
    throw new Error("Receipt is not on screen yet.");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const canvas = await html2canvas(card, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#f4efe3",
    scale: Math.min(2, window.devicePixelRatio || 1),
    logging: false,
    useCORS: true,
    ignoreElements(element) {
      const id = element.id ?? "";
      return id.startsWith("agentation") || id === "agentation-root";
    },
    onclone(clonedDoc) {
      const cloned = clonedDoc.querySelector<HTMLElement>("#rw-receipt-card");
      if (!cloned) return;
      cloned.style.boxShadow = "none";
      const kicker = cloned.querySelector("[data-receipt-meta]");
      if (kicker instanceof HTMLElement) {
        kicker.textContent = `${options.roomCode} · ${options.mode} · ${options.responseCount} voices`;
      }
    },
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) {
    throw new Error("Could not render the receipt image.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `roomwave-${options.roomCode}-${options.mode}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
