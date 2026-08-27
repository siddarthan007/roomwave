import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import type { AppEnv } from "./lib/app-env";

import {
  activityRoutes,
} from "./routes/activities";

import {
  eventRoutes,
} from "./routes/events";

import {
  roomRoutes,
} from "./routes/rooms";

export const app =
  new Hono<AppEnv>();

const allowedOrigins = new Set(
  (Bun.env.ROOMWAVE_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

if (allowedOrigins.has("*")) {
  throw new Error("ROOMWAVE_ALLOWED_ORIGINS must list exact web origins; wildcard access is not supported.");
}

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      const normalized = origin.replace(/\/$/, "");
      return allowedOrigins.has(normalized) ? origin : null;
    },
    allowMethods: ["GET", "HEAD", "POST", "PATCH", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-Room-Id",
      "Accept",
      "Last-Event-ID",
      "Cache-Control",
    ],
    exposeHeaders: ["Retry-After"],
    maxAge: 86_400,
  }),
);

app.use(
  "/api/*",
  secureHeaders({
    // A static frontend may live on Vercel or Cloudflare Pages while the
    // stateful API stays on a Bun host. The CORS allowlist remains the gate.
    crossOriginResourcePolicy: "cross-origin",
    referrerPolicy: "no-referrer",
  }),
);

app.use(
  "/api/*",
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) =>
      c.json(
        {
          error: {
            code: "BODY_TOO_LARGE",
            message: "This request is too large.",
          },
        },
        413,
      ),
  }),
);

app.get(
  "/api/health",
  (c) => {
    return c.json({
      status: "ok",
      service:
        "roomwave-api",
    });
  },
);

app.route(
  "/api/rooms",
  roomRoutes,
);

app.route(
  "/api/rooms",
  eventRoutes,
);

app.route(
  "/api/activities",
  activityRoutes,
);

if (Bun.env.ROOMWAVE_SERVE_WEB === "1") {
  app.use("*", async (c, next) => {
    await next();
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
  });
  const staticAsset = serveStatic({ root: "./apps/web/dist" });
  const appShell = serveStatic({ path: "./apps/web/dist/index.html" });
  app.use("/assets/*", staticAsset);
  app.use("/fonts/*", staticAsset);
  for (const asset of [
    "/favicon.svg",
    "/mark.svg",
    "/og.png",
    "/og.jpg",
    "/robots.txt",
    "/site.webmanifest",
  ]) {
    app.get(asset, staticAsset);
  }
  app.use("/emoji/*", staticAsset);
  app.get("/", appShell);
  app.get("/host/*", appShell);
  app.get("/join/*", appShell);
  app.get("/room/*", appShell);
  app.get("/stage/*", appShell);
  app.get("*", appShell);
}

app.onError(
  (error, c) => {
    console.error(error);

    return c.json(
      {
        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "Unexpected server error.",
        },
      },
      500,
    );
  },
);

const configuredPort = Number(Bun.env.PORT ?? 3000);

if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

export default {
  port: configuredPort,
  // Bun's default 10s idle timer kills quiet SSE streams. Cap at the
  // documented maximum; each /events request also calls timeout(req, 0).
  idleTimeout: 255,
  maxRequestBodySize: 64 * 1024,
  fetch(request: Request, server: Bun.Server<undefined>) {
    return app.fetch(request, {
      remoteAddress: server.requestIP(request)?.address,
      bunServer: server,
    });
  },
};
