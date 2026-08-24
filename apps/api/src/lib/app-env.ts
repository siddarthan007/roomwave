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

  // Standard trusted-hop-count walk: each trusted proxy strips exactly one
  // address it prepended (or appends, per deployment — either way every
  // trusted hop accounts for one entry). Walk from the socket peer toward the
  // client through at most N = |trusted allowlist| entries; the first address
  // beyond that budget is the client. A spoofed left-hand value can no longer
  // pin a limiter bucket to a trusted proxy IP, because reaching any chain
  // entry requires passing through untrusted addresses that exhaust the
  // budget first.
  const chain = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0);
  let address = peer;
  const maxHops = Math.min(trustedPeers.size, chain.length);
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (!trustedPeers.has(address)) break;
    address = chain[chain.length - 1 - hop];
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
