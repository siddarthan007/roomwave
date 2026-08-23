import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

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
    document.title = publicLanding
      ? "Roomwave: make the room visible"
      : "Live room | Roomwave";
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (publicLanding) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.append(canonical);
      }
      canonical.href = `${window.location.origin}/`;
      let openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
      if (!openGraphUrl) {
        openGraphUrl = document.createElement("meta");
        openGraphUrl.setAttribute("property", "og:url");
        document.head.append(openGraphUrl);
      }
      openGraphUrl.content = canonical.href;
    } else {
      canonical?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    }
  }, [publicLanding, robots]);

  return null;
}

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const HostPage = lazy(() => import("./pages/HostPage").then((module) => ({ default: module.HostPage })));
const JoinPage = lazy(() => import("./pages/JoinPage").then((module) => ({ default: module.JoinPage })));
const ParticipantPage = lazy(() =>
  import("./pages/ParticipantPage").then((module) => ({ default: module.ParticipantPage })),
);
const StagePage = lazy(() => import("./pages/StagePage").then((module) => ({ default: module.StagePage })));

export default function App() {
  return (
    <>
      <RouteMetadata />
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
        <Route path="/stage/:roomId" element={<StagePage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/room/:roomId" element={<ParticipantPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
