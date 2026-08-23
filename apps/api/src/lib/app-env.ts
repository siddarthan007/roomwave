import type { Context } from "hono";
import { isIP } from "node:net";

export type AppEnv = {
  Bindings: {
    /** Socket peer address supplied by Bun, never by a request header. */
    remoteAddress?: string;
  };
};

export type AppContext = Context<AppEnv>;

const trustedProxyIps = new Set(
  (Bun.env.ROOMWAVE_TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0),
);

export function resolveClientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedPeers: ReadonlySet<string>,
): string {
  const peer = remoteAddress?.trim();
  if (!peer || isIP(peer) === 0) return "unknown";
  if (!trustedPeers.has(peer) || !forwardedFor) return peer;

  // Walk from the socket peer toward the client. Stop at the first address
  // outside the explicit proxy allowlist, so a spoofed left-hand value cannot
  // mint arbitrary limiter buckets when the edge appends X-Forwarded-For.
  const chain = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0);
  let address = peer;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (!trustedPeers.has(address)) break;
    address = chain[index];
  }
  return address;
}

export function remoteClientKey(c: AppContext): string {
  return resolveClientAddress(
    c.env?.remoteAddress,
    c.req.header("X-Forwarded-For"),
    trustedProxyIps,
  );
}
