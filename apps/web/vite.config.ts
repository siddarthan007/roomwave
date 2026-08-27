import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss
  from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bun workspaces expose dependencies through symlinked package paths.
  // Force every workspace import onto one React runtime so Vite's dev graph
  // cannot load a second hook dispatcher from the package store.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,

    proxy: {
      "/api": {
        target:
          process.env.VITE_DEV_API_URL ?? "http://127.0.0.1:3000",

        changeOrigin: true,
        // Long-lived SSE must not inherit Node's default proxy timeouts.
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            const type = String(proxyRes.headers["content-type"] ?? "");
            if (!type.includes("text/event-stream")) return;
            res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
            res.setHeader("X-Accel-Buffering", "no");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("Content-Encoding", "identity");
            res.flushHeaders?.();
          });
        },
      },
    },
  },
})
