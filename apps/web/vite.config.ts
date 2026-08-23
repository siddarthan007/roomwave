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
      },
    },
  },
})
