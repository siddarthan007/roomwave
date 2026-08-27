import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { Agentation } from "agentation";

import { ErrorBoundary } from "./components/ErrorBoundary";

function routeTitle(pathname: string): string {
  if (pathname === "/") return "Roomwave: make the room visible";
  if (pathname.startsWith("/join/")) {
    const code = pathname.slice("/join/".length).split("/")[0]?.toUpperCase() ?? "";
    return code ? `Join ${code} | Roomwave` : "Join | Roomwave";
  }
  if (pathname.includes("/remote")) return "Presenter remote | Roomwave";
  if (pathname.startsWith("/host/")) return "Host studio | Roomwave";
  if (pathname.startsWith("/stage/")) return "Stage | Roomwave";
  if (pathname.startsWith("/room/")) return "In the room | Roomwave";
  return "Page not found | Roomwave";
}

function RouteMetadata() {
  const location = useLocation();
  const publicLanding = location.pathname === "/";
  const robots = publicLanding ? "index,follow" : "noindex,nofollow";

  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.append(meta);
    }
    meta.content = robots;
    const origin = window.location.origin;
    const absoluteImage = `${origin}/og.jpg`;
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const tag = document.querySelector<HTMLMetaElement>(selector);
      if (tag) tag.content = absoluteImage;
    }
    document.title = routeTitle(location.pathname);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (publicLanding) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.append(canonical);
      }
      canonical.href = `${origin}/`;
      let openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
      if (!openGraphUrl) {
        openGraphUrl = document.createElement("meta");
        openGraphUrl.setAttribute("property", "og:url");
        document.head.append(openGraphUrl);
      }
      openGraphUrl.content = canonical.href;
      const jsonLd = document.querySelector("script[type='application/ld+json']");
      if (jsonLd) {
        try {
          const data = JSON.parse(jsonLd.textContent ?? "{}") as Record<string, unknown>;
          data.url = `${origin}/`;
          jsonLd.textContent = JSON.stringify(data);
        } catch {
          // Keep the static JSON-LD if the payload is not object JSON.
        }
      }
    } else {
      canonical?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    }
  }, [location.pathname, publicLanding, robots]);

  return null;
}

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const HostPage = lazy(() => import("./pages/HostPage").then((module) => ({ default: module.HostPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((module) => ({ default: module.JoinPage })));
const ParticipantPage = lazy(() =>
  import("./pages/ParticipantPage").then((module) => ({ default: module.ParticipantPage })),
);
const StagePage = lazy(() => import("./pages/StagePage").then((module) => ({ default: module.StagePage })));
const PresenterPage = lazy(() => import("./pages/PresenterPage").then((module) => ({ default: module.PresenterPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

export default function App() {
  return (
    <>
      <a href="#roomwave-main" className="skip-link">
        Skip to content
      </a>
      <MotionConfig reducedMotion="user">
        <RouteMetadata />
        <ErrorBoundary>
          <Suspense
            fallback={
              <main className="grid min-h-[100dvh] place-items-center bg-[var(--paper)] px-6">
                <p className="mono-tag">tuning into the room…</p>
              </main>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/host/:roomId" element={<HostPage />} />
              <Route path="/host/:roomId/remote" element={<PresenterPage />} />
              <Route path="/stage/:roomId" element={<StagePage />} />
              <Route path="/join/:code" element={<JoinPage />} />
              <Route path="/room/:roomId" element={<ParticipantPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </MotionConfig>
      {process.env.NODE_ENV === "development" && <Agentation />}
    </>
  );
}
