import type { ActivityType } from "@roomwave/shared";

import html2canvas from "html2canvas-pro";

import type { ReceiptRow } from "./receipt";

function paperColor(): string {
  const fromVar = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  return fromVar || "#f4efe3";
}

/**
 * html2canvas restarts CSS animations on the clone. Stamp-in uses
 * `animation-fill-mode: both`, so the clone would capture children at
 * opacity 0. Fill bars also live as scaleX/scaleY transforms, which the
 * rasterizer often paints washed-out. Freeze both before capture.
 */
function freezeReceiptClone(cloned: HTMLElement) {
  cloned.style.boxShadow = "none";
  cloned.style.opacity = "1";
  cloned.style.filter = "none";
  cloned.style.animation = "none";
  cloned.style.backgroundColor = paperColor();

  cloned.querySelectorAll<HTMLElement>(".rw-reveal-sweep").forEach((node) => {
    node.remove();
  });

  cloned.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.style.animation = "none";
    el.style.transition = "none";
  });
  cloned.querySelectorAll<HTMLElement>(".rw-reveal-stamp > *").forEach((el) => {
    el.style.opacity = "1";
    el.style.transform = "none";
  });

  cloned.querySelectorAll<HTMLElement>("[data-fill-share]").forEach((track) => {
    const share = Number(track.dataset.fillShare ?? "0");
    const painted = Number.isFinite(share) ? Math.max(0, Math.min(100, share)) : 0;
    const fill = track.querySelector<HTMLElement>("[data-fill-paint]");
    if (!fill) return;
    fill.style.transform = "none";
    fill.style.willChange = "auto";
    fill.style.opacity = "1";
    fill.style.animation = "none";
    if (track.dataset.fillAxis === "y") {
      fill.style.inset = "auto 0 0 0";
      fill.style.height = `${painted}%`;
      fill.style.width = "100%";
    } else {
      fill.style.inset = "0 auto 0 0";
      fill.style.width = `${painted}%`;
      fill.style.height = "100%";
    }
  });
}

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
    backgroundColor: paperColor(),
    scale: 2,
    logging: false,
    useCORS: true,
    ignoreElements(element) {
      const id = element.id ?? "";
      if (id.startsWith("agentation") || id === "agentation-root") return true;
      return element.classList?.contains("rw-reveal-sweep") === true;
    },
    onclone(clonedDoc) {
      const cloned = clonedDoc.querySelector<HTMLElement>("#rw-receipt-card");
      if (!cloned) return;
      freezeReceiptClone(cloned);
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
