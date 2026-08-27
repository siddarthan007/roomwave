const encoder = new TextEncoder();

/** One binary SSE frame. Callers reuse this buffer across every subscriber. */
export function encodeSse(
  event: string,
  data: unknown,
  options: { id?: string; retry?: number } = {},
): Uint8Array {
  const fields = [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    options.id ? `id: ${options.id}` : null,
    options.retry ? `retry: ${options.retry}` : null,
  ].filter(Boolean);
  // Trailing comment forces proxies (Vite, nginx, Cloudflare) to flush.
  return encoder.encode(`${fields.join("\n")}\n\n:\n\n`);
}
