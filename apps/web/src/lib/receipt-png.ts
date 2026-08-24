import type { ActivityType } from "@roomwave/shared";

import html2canvas from "html2canvas-pro";

import type { ReceiptRow } from "./receipt";

/**
 * Rasterizes the stage result block into a PNG the host can share.
 *
 * Uses html2canvas-pro (modern CSS color-function support: the Roomwave
 * themes drive everything through oklch/color-mix values that classic
 * html2canvas cannot parse). Captures only `#rw-receipt-card` so the export
 * is a designed receipt, not a screenshot of the projector chrome.
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

  // Ensure the hidden truth rows are included in the capture even if the
  // caller rendered the card before reveal completed.
  const canvas = await html2canvas(card, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#f4efe3",
    scale: Math.min(2, window.devicePixelRatio || 1),
    logging: false,
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
  anchor.click();
  URL.revokeObjectURL(url);
}
